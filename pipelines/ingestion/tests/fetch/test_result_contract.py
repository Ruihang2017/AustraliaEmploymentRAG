"""Deliverable 4 — the result shape, the header allowlist and the PRD §35.3 mapping.

Acceptance: "`FetchResult` carries every field PRD §35.3 `source_artifact` requires (`official_url`,
`retrieved_at`, `http_status`, `etag`, `last_modified`, `content_type`, `byte_length`, `sha256`); a
test asserts the mapping explicitly."
"""

from __future__ import annotations

import hashlib
import os
from pathlib import Path

from fetch_harness import RecordingSink, build_fetcher, request_for
from fetch_server import ScriptedResponse

from taxrag_pipeline_ingestion.adapter.types import FetchResult
from taxrag_pipeline_ingestion.fetch.observability import FETCH_EVENT_FIELDS, FetchEvent
from taxrag_pipeline_ingestion.fetch.result import (
    HEADER_ALLOWLIST,
    SOURCE_ARTIFACT_FIELDS,
    close_result,
    source_artifact_fields,
)

BODY = b"%PDF-1.7\n" + b"x" * 400


def _serve(server, path="/latest/doc.pdf"):
    server.route(
        path,
        ScriptedResponse(
            status=200,
            headers={
                "Content-Type": "application/pdf",
                "ETag": '"abc123"',
                "Last-Modified": "Wed, 19 Aug 2026 10:00:00 GMT",
                "Date": "Wed, 19 Aug 2026 12:00:00 GMT",
                "Set-Cookie": "session=should-never-be-returned",
                "X-Secret-Header": "should-never-be-returned",
            },
            body=BODY,
        ),
    )
    return server.url("docs.example.test", path)


def test_a_successful_fetch_fills_the_prd_35_3_fields(
    fixture_server, fake_resolver, policy_loader
) -> None:
    url = _serve(fixture_server)
    fake_resolver.add_v4("docs.example.test", "127.0.0.1")
    sink = RecordingSink()
    with build_fetcher(policy_loader=policy_loader, resolver=fake_resolver, sink=sink) as fetcher:
        result = fetcher.fetch(request_for(url, "DEMO-OK"))
        try:
            assert type(result) is FetchResult  # never a subclass (writeback W2)
            assert result.status_code == 200
            assert result.official_url == url
            assert result.final_url == url
            assert result.not_modified is False
            assert result.byte_length == len(BODY)
            assert result.sha256 == hashlib.sha256(BODY).hexdigest()
            assert result.body_path is not None
            assert Path(result.body_path).read_bytes() == BODY
            assert result.retrieved_at.endswith("Z")
            assert set(result.timings) == {"dns", "connect", "tls", "ttfb", "transfer", "total"}

            fields = source_artifact_fields(result)
            assert tuple(fields) == SOURCE_ARTIFACT_FIELDS
            assert fields["official_url"] == url
            assert fields["http_status"] == 200
            assert fields["etag"] == '"abc123"'
            assert fields["last_modified"] == "Wed, 19 Aug 2026 10:00:00 GMT"
            assert fields["content_type"] == "application/pdf"
            assert fields["byte_length"] == len(BODY)
            assert fields["sha256"] == result.sha256
        finally:
            close_result(result)
        assert result.body_path is not None and not os.path.exists(result.body_path)

    # Deliverable 9: exactly the seven permitted fields, one event for the one attempt.
    assert len(sink.events) == 1
    event = sink.events[0]
    assert tuple(event.as_mapping()) == FETCH_EVENT_FIELDS
    assert event.group_id == "DEMO-OK"
    assert event.status == 200
    assert event.failure_code is None
    assert event.attempt == 1


def test_only_allowlisted_headers_are_returned(
    fixture_server, fake_resolver, policy_loader
) -> None:
    url = _serve(fixture_server)
    fake_resolver.add_v4("docs.example.test", "127.0.0.1")
    with build_fetcher(policy_loader=policy_loader, resolver=fake_resolver) as fetcher:
        with fetcher.fetching(request_for(url, "DEMO-OK")) as result:
            assert set(result.headers) <= set(HEADER_ALLOWLIST)
            assert "set-cookie" not in result.headers
            assert "x-secret-header" not in result.headers
            body_path = result.body_path
    assert body_path is not None and not os.path.exists(body_path)


def test_the_event_dataclass_cannot_grow_a_field() -> None:
    """PRD §22 — "and nothing else" has to be structural, not a habit."""
    assert FETCH_EVENT_FIELDS == (
        "group_id",
        "final_url",
        "status",
        "byte_length",
        "duration_ms",
        "failure_code",
        "attempt",
    )
    assert tuple(FetchEvent.__dataclass_fields__) == FETCH_EVENT_FIELDS


def test_a_head_request_returns_no_body(fixture_server, fake_resolver, policy_loader) -> None:
    url = _serve(fixture_server, "/latest/head.pdf")
    fake_resolver.add_v4("docs.example.test", "127.0.0.1")
    with build_fetcher(policy_loader=policy_loader, resolver=fake_resolver) as fetcher:
        result = fetcher.fetch(request_for(url, "DEMO-OK", method="HEAD"))
        assert result.body_path is None
        assert result.byte_length == 0
        assert fixture_server.requests[-1].method == "HEAD"
