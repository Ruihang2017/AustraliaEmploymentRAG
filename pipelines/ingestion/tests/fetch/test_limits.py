"""Size, time, type and retry — deliverables 3.5, 3.7, 5 (PRD §37.4, §40.7).

Every cap is exercised through a small `FetchLimits` override so the suite moves KiB and
milliseconds (R14); `test_seam.py` separately asserts that the DEFAULTS are the PRD §37.4 numbers.
"""

from __future__ import annotations

import os
import time

import pytest
from fetch_harness import RecordingSink, build_fetcher, request_for
from fetch_server import ScriptedResponse

from taxrag_pipeline_ingestion.fetch.errors import FetchFailure

PDF = {"Content-Type": "application/pdf"}
HTML_BODY = b"<!DOCTYPE html><html><body>consent wall</body></html>"
PDF_BODY = b"%PDF-1.7\n" + b"a" * 200


def _fetcher(policy_loader, resolver, **kw):
    return build_fetcher(policy_loader=policy_loader, resolver=resolver, **kw)


def assert_no_body_files(fetcher) -> None:
    """No partial body file survives a failure path (R10). A temp dir that was never created is
    the strongest possible version of the same statement."""
    tempdir = fetcher.tempdir
    assert tempdir is None or os.listdir(tempdir) == []


def wait_for_abort(record, total: int, timeout: float = 1.5) -> None:
    """Wait for the server to notice that the client stopped consuming the body.

    Two shapes are accepted, because the operating systems differ (R11): the write raises
    (`ConnectionAbortedError` / `WinError 10053` on Windows, `BrokenPipeError` or
    `ConnectionResetError` elsewhere), or the write simply BLOCKS forever once the receive window
    fills because nobody is reading. Both prove the same thing, which is the thing the acceptance
    criterion asks for: the body was never fully transferred, so it cannot have been buffered and
    checked afterwards.
    """
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline and not record.disconnected:
        time.sleep(0.05)
    assert record.disconnected or record.bytes_written < total, (
        "the server transferred the whole body: the client cannot have aborted the stream"
    )


# -- size ------------------------------------------------------------------------------------


def test_a_declared_length_above_the_ceiling_is_refused_before_the_body(
    fixture_server, fake_resolver, policy_loader
) -> None:
    url = fixture_server.url("docs.example.test", "/latest/big.pdf")
    fixture_server.route(
        "/latest/big.pdf", ScriptedResponse(status=200, headers=PDF, body=b"%PDF-" + b"x" * 8192)
    )
    fake_resolver.add_v4("docs.example.test", "127.0.0.1")
    with _fetcher(policy_loader, fake_resolver, max_document_bytes=2048) as fetcher:
        with pytest.raises(FetchFailure) as caught:
            fetcher.fetch(request_for(url, "DEMO-OK"))
        assert str(caught.value.code) == "FETCH_SIZE_LIMIT"
        assert caught.value.details["ceiling"] == 2048
        # `declared_length` in the details is what proves the PRE-BODY branch fired: the refusal
        # came from the Content-Length header, not from counting bytes as they arrived.
        assert caught.value.details["declared_length"] == 8197
        assert_no_body_files(fetcher)


def test_size_limit_aborts_the_stream_and_the_server_sees_the_disconnect(
    fixture_server, fake_resolver, policy_loader
) -> None:
    """Acceptance: the body must NOT be fully buffered — the server observes an early disconnect."""
    url = fixture_server.url("docs.example.test", "/latest/stream.pdf")
    body = b"%PDF-1.7\n" + b"y" * (1024 * 1024)
    fixture_server.route(
        "/latest/stream.pdf",
        ScriptedResponse(
            status=200,
            headers=PDF,
            body=body,
            omit_content_length=True,  # a lying/absent length must still be caught
            chunk_size=8192,
            stall_between_chunks=0.005,
        ),
    )
    fake_resolver.add_v4("docs.example.test", "127.0.0.1")
    with _fetcher(policy_loader, fake_resolver, max_document_bytes=32 * 1024) as fetcher:
        with pytest.raises(FetchFailure) as caught:
            fetcher.fetch(request_for(url, "DEMO-OK"))
        assert str(caught.value.code) == "FETCH_SIZE_LIMIT"
        assert_no_body_files(fetcher)  # the partial file is gone (R10)

    record = fixture_server.requests[-1]
    wait_for_abort(record, len(body))
    assert record.bytes_written < len(body)


def test_the_approved_limit_raises_the_ceiling_and_one_byte_beyond_still_fails(
    fixture_server, fake_resolver, policy_loader
) -> None:
    ok_body = b"%PDF-1.7\n" + b"z" * (4096 - 9)
    too_big = ok_body + b"!"
    fixture_server.route("/ok.pdf", ScriptedResponse(status=200, headers=PDF, body=ok_body))
    fixture_server.route("/big.pdf", ScriptedResponse(status=200, headers=PDF, body=too_big))
    fake_resolver.add_v4("bulk.example.test", "127.0.0.1")

    # The default ceiling here is 1 KiB; the group's approved_max_bytes is 4096.
    with _fetcher(policy_loader, fake_resolver, max_document_bytes=1024) as fetcher:
        with fetcher.fetching(
            request_for(fixture_server.url("bulk.example.test", "/ok.pdf"), "DEMO-APPROVED-LIMIT")
        ) as result:
            assert result.byte_length == 4096

        with pytest.raises(FetchFailure) as caught:
            fetcher.fetch(
                request_for(
                    fixture_server.url("bulk.example.test", "/big.pdf"), "DEMO-APPROVED-LIMIT"
                )
            )
        assert str(caught.value.code) == "FETCH_SIZE_LIMIT"


def test_a_caller_supplied_max_bytes_can_only_lower_the_ceiling(
    fixture_server, fake_resolver, policy_loader
) -> None:
    fixture_server.route(
        "/ok.pdf", ScriptedResponse(status=200, headers=PDF, body=b"%PDF-1.7\n" + b"z" * 4087)
    )
    fake_resolver.add_v4("bulk.example.test", "127.0.0.1")
    url = fixture_server.url("bulk.example.test", "/ok.pdf")
    with _fetcher(policy_loader, fake_resolver, max_document_bytes=1024) as fetcher:
        with pytest.raises(FetchFailure) as caught:
            fetcher.fetch(request_for(url, "DEMO-APPROVED-LIMIT", max_bytes=512))
        assert str(caught.value.code) == "FETCH_SIZE_LIMIT"
        assert caught.value.details["ceiling"] == 512


# -- time ------------------------------------------------------------------------------------


def test_a_stalling_source_yields_fetch_timeout(
    fixture_server, fake_resolver, policy_loader
) -> None:
    url = fixture_server.url("docs.example.test", "/latest/slow.pdf")
    fixture_server.route(
        "/latest/slow.pdf",
        ScriptedResponse(status=200, headers=PDF, body=PDF_BODY, stall_before_headers=3.0),
    )
    fake_resolver.add_v4("docs.example.test", "127.0.0.1")
    with _fetcher(
        policy_loader,
        fake_resolver,
        fetch_timeout_seconds=0.4,
        read_timeout_seconds=0.4,
        connect_timeout_seconds=0.4,
    ) as fetcher:
        with pytest.raises(FetchFailure) as caught:
            fetcher.fetch(request_for(url, "DEMO-OK"))
        assert str(caught.value.code) == "FETCH_TIMEOUT"
        assert_no_body_files(fetcher)


def test_retries_never_exceed_the_budget(
    fixture_server, fake_resolver, policy_loader, fake_clock
) -> None:
    """Deliverable 5 — one budget covers every attempt of one logical fetch."""
    url = fixture_server.url("docs.example.test", "/latest/flaky.pdf")
    fixture_server.route("/latest/flaky.pdf", ScriptedResponse(status=503))
    fake_resolver.add_v4("docs.example.test", "127.0.0.1")
    with _fetcher(
        policy_loader, fake_resolver, clock=fake_clock, fetch_timeout_seconds=2.0
    ) as fetcher:
        with pytest.raises(FetchFailure) as caught:
            fetcher.fetch(request_for(url, "DEMO-OK"))
    assert str(caught.value.code) == "FETCH_TRANSIENT_FAILURE"
    assert len(fixture_server.requests) <= 3
    assert fake_clock.total_slept <= 2.0


# -- retry -----------------------------------------------------------------------------------


def test_a_503_then_200_succeeds_in_two_attempts(
    fixture_server, fake_resolver, policy_loader, fake_clock
) -> None:
    url = fixture_server.url("docs.example.test", "/latest/retry.pdf")
    fixture_server.route(
        "/latest/retry.pdf",
        ScriptedResponse(status=503),
        ScriptedResponse(status=200, headers=PDF, body=PDF_BODY),
    )
    fake_resolver.add_v4("docs.example.test", "127.0.0.1")
    sink = RecordingSink()
    with _fetcher(policy_loader, fake_resolver, clock=fake_clock, sink=sink) as fetcher:
        with fetcher.fetching(request_for(url, "DEMO-OK")) as result:
            assert result.status_code == 200
    assert len(fixture_server.requests) == 2
    assert [event.attempt for event in sink.events] == [1, 2]
    assert sink.events[0].failure_code == "FETCH_TRANSIENT_FAILURE"
    assert sink.events[1].failure_code is None
    assert fake_clock.sleeps  # a backoff was actually taken


@pytest.mark.parametrize("status", [400, 403, 404, 410, 500])
def test_a_non_retryable_status_is_not_retried(
    status: int, fixture_server, fake_resolver, policy_loader, fake_clock
) -> None:
    url = fixture_server.url("docs.example.test", "/latest/err.pdf")
    fixture_server.route("/latest/err.pdf", ScriptedResponse(status=status))
    fake_resolver.add_v4("docs.example.test", "127.0.0.1")
    with _fetcher(policy_loader, fake_resolver, clock=fake_clock) as fetcher:
        with pytest.raises(FetchFailure) as caught:
            fetcher.fetch(request_for(url, "DEMO-OK"))
    assert str(caught.value.code) == "FETCH_HTTP_ERROR"
    assert caught.value.details["status_code"] == status
    assert len(fixture_server.requests) == 1
    assert fake_clock.sleeps == []


def test_a_policy_denial_is_not_retried(
    fixture_server, fake_resolver, policy_loader, fake_clock
) -> None:
    url = fixture_server.url("docs.example.test", "/forbidden/x")
    with _fetcher(policy_loader, fake_resolver, clock=fake_clock) as fetcher:
        with pytest.raises(FetchFailure) as caught:
            fetcher.fetch(request_for(url, "DEMO-OK"))
    assert str(caught.value.code) == "FETCH_DENIED_PATH"
    assert fixture_server.requests == ()
    assert fake_clock.sleeps == []


def test_retry_after_is_clamped_to_the_remaining_budget(
    fixture_server, fake_resolver, policy_loader, fake_clock
) -> None:
    url = fixture_server.url("docs.example.test", "/latest/busy.pdf")
    fixture_server.route(
        "/latest/busy.pdf", ScriptedResponse(status=503, headers={"Retry-After": "3600"})
    )
    fake_resolver.add_v4("docs.example.test", "127.0.0.1")
    with _fetcher(
        policy_loader, fake_resolver, clock=fake_clock, fetch_timeout_seconds=30.0
    ) as fetcher:
        with pytest.raises(FetchFailure) as caught:
            fetcher.fetch(request_for(url, "DEMO-OK"))
    assert str(caught.value.code) == "FETCH_TRANSIENT_FAILURE"
    assert fake_clock.total_slept <= 30.0
    assert 3600.0 not in fake_clock.sleeps
    assert len(fixture_server.requests) == 1


def test_a_short_retry_after_is_honoured(
    fixture_server, fake_resolver, policy_loader, fake_clock
) -> None:
    url = fixture_server.url("docs.example.test", "/latest/wait.pdf")
    fixture_server.route(
        "/latest/wait.pdf",
        ScriptedResponse(status=429, headers={"Retry-After": "2"}),
        ScriptedResponse(status=200, headers=PDF, body=PDF_BODY),
    )
    fake_resolver.add_v4("docs.example.test", "127.0.0.1")
    with _fetcher(policy_loader, fake_resolver, clock=fake_clock) as fetcher:
        with fetcher.fetching(request_for(url, "DEMO-OK")) as result:
            assert result.status_code == 200
    assert fake_clock.sleeps == [2.0]


# -- type ------------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("declared", "body", "mismatch"),
    [
        ("application/pdf", PDF_BODY, False),
        ("application/pdf", HTML_BODY, True),
        ("text/html", HTML_BODY, False),
        ("text/plain", HTML_BODY, False),
        ("text/html", b"plain words only", False),
        ("application/xml", b"<?xml version='1.0'?><a/>", False),
        ("text/xml", b"<?xml version='1.0'?><a/>", False),
        ("application/xhtml+xml", HTML_BODY, False),
        ("application/json", b'{"a": 1}', False),
        ("application/json", PDF_BODY, True),
        ("application/octet-stream", PDF_BODY, False),
        ("application/zip", b"PK\x03\x04rest-of-archive", False),
        ("application/pdf", b"PK\x03\x04rest-of-archive", True),
        (None, PDF_BODY, False),
    ],
)
def test_the_declared_type_must_agree_with_the_observed_bytes(
    declared: str | None,
    body: bytes,
    mismatch: bool,
    fixture_server,
    fake_resolver,
    policy_loader,
) -> None:
    headers = {} if declared is None else {"Content-Type": declared}
    fixture_server.route("/latest/typed", ScriptedResponse(status=200, headers=headers, body=body))
    fake_resolver.add_v4("docs.example.test", "127.0.0.1")
    url = fixture_server.url("docs.example.test", "/latest/typed")
    with _fetcher(policy_loader, fake_resolver) as fetcher:
        if mismatch:
            with pytest.raises(FetchFailure) as caught:
                fetcher.fetch(request_for(url, "DEMO-OK"))
            assert str(caught.value.code) == "FETCH_TYPE_MISMATCH"
            assert_no_body_files(fetcher)
        else:
            with fetcher.fetching(request_for(url, "DEMO-OK")) as result:
                assert result.byte_length == len(body)


def test_octet_stream_is_accepted_only_when_the_sniff_matches_an_expected_type(
    fixture_server, fake_resolver, policy_loader
) -> None:
    fixture_server.route(
        "/latest/opaque",
        ScriptedResponse(
            status=200, headers={"Content-Type": "application/octet-stream"}, body=HTML_BODY
        ),
    )
    fake_resolver.add_v4("docs.example.test", "127.0.0.1")
    url = fixture_server.url("docs.example.test", "/latest/opaque")
    with _fetcher(policy_loader, fake_resolver) as fetcher:
        with pytest.raises(FetchFailure) as caught:
            fetcher.fetch(request_for(url, "DEMO-OK", expected_content_types=["application/pdf"]))
        assert str(caught.value.code) == "FETCH_TYPE_MISMATCH"


def test_an_unsupported_content_encoding_is_an_http_error(
    fixture_server, fake_resolver, policy_loader
) -> None:
    """`br` is never requested, so a Brotli response means the server ignored us."""
    fixture_server.route(
        "/latest/br",
        ScriptedResponse(
            status=200, headers={"Content-Type": "application/pdf", "Content-Encoding": "br"}, body=PDF_BODY
        ),
    )
    fake_resolver.add_v4("docs.example.test", "127.0.0.1")
    url = fixture_server.url("docs.example.test", "/latest/br")
    with _fetcher(policy_loader, fake_resolver, max_attempts=1) as fetcher:
        with pytest.raises(FetchFailure) as caught:
            fetcher.fetch(request_for(url, "DEMO-OK"))
        assert str(caught.value.code) == "FETCH_HTTP_ERROR"


def test_the_temp_directory_is_empty_after_the_failure_matrix(
    fixture_server, fake_resolver, policy_loader
) -> None:
    """R10 — no failure path may leak a partial body file."""
    fake_resolver.add_v4("docs.example.test", "127.0.0.1")
    fixture_server.route(
        "/latest/mismatch", ScriptedResponse(status=200, headers=PDF, body=HTML_BODY)
    )
    fixture_server.route("/latest/gone", ScriptedResponse(status=404))
    with _fetcher(policy_loader, fake_resolver, max_document_bytes=64) as fetcher:
        for path in ("/latest/mismatch", "/latest/gone", "/forbidden/x"):
            with pytest.raises(FetchFailure):
                fetcher.fetch(
                    request_for(fixture_server.url("docs.example.test", path), "DEMO-OK")
                )
        tempdir = fetcher.tempdir
        if tempdir is not None:
            assert os.listdir(tempdir) == []
    if tempdir is not None:
        assert not os.path.exists(tempdir)
