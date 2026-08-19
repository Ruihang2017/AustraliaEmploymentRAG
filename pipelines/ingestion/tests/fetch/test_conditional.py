"""Conditional requests and the 304 shape (deliverable 3 step 4; PRD §12.1, consumed by INGF-08).

PRD §12.1: "Critical official collections SHOULD be checked every 6-12 hours using
feeds/APIs/sitemaps/updated listings/manifests and conditional requests." `INGF-08` schedules them;
the transport is this ticket's, and `INGF-08` depends on the exact `not_modified` result shape
asserted here.
"""

from __future__ import annotations

import os

from fetch_harness import build_fetcher, request_for
from fetch_server import ScriptedResponse

ETAG = '"v1-abc"'
LAST_MODIFIED = "Wed, 19 Aug 2026 10:00:00 GMT"
PDF_BODY = b"%PDF-1.7\nbody"


def test_validators_become_conditional_request_headers(
    fixture_server, fake_resolver, policy_loader
) -> None:
    fixture_server.route(
        "/latest/cond.pdf",
        ScriptedResponse(status=304, headers={"ETag": ETAG, "Last-Modified": LAST_MODIFIED}),
    )
    fake_resolver.add_v4("docs.example.test", "127.0.0.1")
    url = fixture_server.url("docs.example.test", "/latest/cond.pdf")

    with build_fetcher(policy_loader=policy_loader, resolver=fake_resolver) as fetcher:
        result = fetcher.fetch(
            request_for(url, "DEMO-OK", etag=ETAG, last_modified=LAST_MODIFIED)
        )
        sent = fixture_server.requests[-1].headers
        assert sent["if-none-match"] == ETAG
        assert sent["if-modified-since"] == LAST_MODIFIED
        assert "cookie" not in sent
        assert "authorization" not in sent

        # The shape INGF-08 depends on.
        assert result.status_code == 304
        assert result.not_modified is True
        assert result.byte_length == 0
        assert result.body_path is None
        assert result.headers["etag"] == ETAG
        assert fetcher.tempdir is None or os.listdir(fetcher.tempdir) == []


def test_no_validators_means_no_conditional_headers(
    fixture_server, fake_resolver, policy_loader
) -> None:
    fixture_server.route(
        "/latest/plain.pdf",
        ScriptedResponse(status=200, headers={"Content-Type": "application/pdf"}, body=PDF_BODY),
    )
    fake_resolver.add_v4("docs.example.test", "127.0.0.1")
    url = fixture_server.url("docs.example.test", "/latest/plain.pdf")
    with build_fetcher(policy_loader=policy_loader, resolver=fake_resolver) as fetcher:
        with fetcher.fetching(request_for(url, "DEMO-OK")) as result:
            assert result.not_modified is False
        sent = fixture_server.requests[-1].headers
        assert "if-none-match" not in sent
        assert "if-modified-since" not in sent
        assert sent["accept-encoding"] == "gzip, deflate"  # never `br`
        assert sent["user-agent"].startswith("taxrag-ingestion/")


def test_a_200_then_304_sequence(fixture_server, fake_resolver, policy_loader) -> None:
    fixture_server.route(
        "/latest/seq.pdf",
        ScriptedResponse(
            status=200,
            headers={"Content-Type": "application/pdf", "ETag": ETAG},
            body=PDF_BODY,
        ),
        ScriptedResponse(status=304, headers={"ETag": ETAG}),
    )
    fake_resolver.add_v4("docs.example.test", "127.0.0.1")
    url = fixture_server.url("docs.example.test", "/latest/seq.pdf")

    with build_fetcher(policy_loader=policy_loader, resolver=fake_resolver) as fetcher:
        with fetcher.fetching(request_for(url, "DEMO-OK")) as first:
            assert first.status_code == 200
            etag = first.headers["etag"]
            assert first.byte_length == len(PDF_BODY)
        second = fetcher.fetch(request_for(url, "DEMO-OK", etag=etag))
        assert second.not_modified is True
        assert second.byte_length == 0
        assert second.body_path is None
        assert fetcher.tempdir is None or os.listdir(fetcher.tempdir) == []
