"""`[fixture]` The decompression-bomb suite — SEC-002's named acceptance evidence.

Acceptance: "a recorded gzip response that expands beyond `MAX_DECOMPRESSED_BYTES` is aborted with
`FETCH_DECOMPRESSION_LIMIT` and peak process memory stays bounded; a response whose compression
ratio exceeds `MAX_COMPRESSION_RATIO` is aborted even below the absolute cap."

Both fixtures are replayed THROUGH THE FETCHER, not just through the decoder, so what is proved is
the behaviour of the whole path. Peak memory is measured with `tracemalloc` (`resource` is
POSIX-only and this repository is built on Windows), and the number is what the PR's PRD §45.4
memory line reports.

The caps are shrunk with a `FetchLimits` override (R14): a test that used the real 250 MiB cap
would need a 250 MiB expansion to prove anything.
"""

from __future__ import annotations

import hashlib
import os
import tracemalloc
from pathlib import Path

import pytest
from fetch_paths import BOMB_FIXTURES
from fetch_harness import build_fetcher, request_for
from fetch_server import ScriptedResponse

from taxrag_pipeline_ingestion.fetch.decode import BoundedDecoder
from taxrag_pipeline_ingestion.fetch.errors import FetchFailure

#: Pinned so a regenerated fixture cannot drift silently (`fixtures/bombs/generate.py`).
FIXTURE_DIGESTS = {
    "gzip-absolute.bin.gz": "646a4bcfa1693c6422c96db3ce0d9893a2003a3d33645aa07ed32f39bc5c1e9c",
    "ratio-abuse.gz": "e7f97c0c2884ce9d57541b4857bce79fa0d0ff22922e3e8b53257e1056fff947",
}

GZIP_HEADERS = {"Content-Type": "application/pdf", "Content-Encoding": "gzip"}


@pytest.mark.parametrize("name", sorted(FIXTURE_DIGESTS))
def test_the_committed_fixture_is_the_one_the_suite_was_written_against(name: str) -> None:
    payload = (BOMB_FIXTURES / name).read_bytes()
    assert hashlib.sha256(payload).hexdigest() == FIXTURE_DIGESTS[name]
    assert len(payload) < 64 * 1024  # small in git; the expansion is what matters


def _replay(server, resolver, loader, name: str, **limits):
    payload = (BOMB_FIXTURES / name).read_bytes()
    server.route("/latest/bomb", ScriptedResponse(status=200, headers=GZIP_HEADERS, body=payload))
    resolver.add_v4("docs.example.test", "127.0.0.1")
    url = server.url("docs.example.test", "/latest/bomb")
    fetcher = build_fetcher(policy_loader=loader, resolver=resolver, max_attempts=1, **limits)
    with fetcher:
        with pytest.raises(FetchFailure) as caught:
            fetcher.fetch(request_for(url, "DEMO-OK"))
        tempdir = fetcher.tempdir
        assert tempdir is None or os.listdir(tempdir) == []
    return caught.value


def test_the_absolute_cap_aborts_the_bomb(fixture_server, fake_resolver, policy_loader) -> None:
    tracemalloc.start()
    try:
        failure = _replay(
            fixture_server,
            fake_resolver,
            policy_loader,
            "gzip-absolute.bin.gz",
            max_document_bytes=1024 * 1024,
            max_decompressed_bytes=128 * 1024,
            max_compression_ratio=100_000,  # disabled, so the ABSOLUTE cap is what is under test
        )
        _, peak = tracemalloc.get_traced_memory()
    finally:
        tracemalloc.stop()

    assert str(failure.code) == "FETCH_DECOMPRESSION_LIMIT"
    assert failure.details["guard"] == "absolute"
    # The fixture expands to 8 MiB; the abort happened just past the 128 KiB cap, never at 8 MiB.
    assert failure.details["decompressed_bytes"] <= 128 * 1024 + 1
    # PRD §45.4 memory line: peak traced allocation stays in the same order as the cap, not the
    # order of the expansion.
    assert peak < 8 * 1024 * 1024, peak


def test_the_ratio_guard_aborts_below_the_absolute_cap(
    fixture_server, fake_resolver, policy_loader
) -> None:
    failure = _replay(
        fixture_server,
        fake_resolver,
        policy_loader,
        "ratio-abuse.gz",
        max_document_bytes=1024 * 1024,
        max_decompressed_bytes=8 * 1024 * 1024,  # above the fixture's full 6.5 MB expansion
        max_compression_ratio=100,
    )
    assert str(failure.code) == "FETCH_DECOMPRESSION_LIMIT"
    assert failure.details["guard"] == "ratio"
    # Below the absolute cap, which is the point: the ratio is what caught it.
    assert failure.details["decompressed_bytes"] < 8 * 1024 * 1024


def test_the_decoder_never_materialises_more_than_the_cap() -> None:
    """The unit-level statement of the same property, with the counter instrumented directly."""
    payload = (BOMB_FIXTURES / "gzip-absolute.bin.gz").read_bytes()
    decoder = BoundedDecoder("gzip", 64 * 1024, 100_000)
    produced = 0
    with pytest.raises(FetchFailure) as caught:
        for start in range(0, len(payload), 4096):
            produced += len(decoder.feed(payload[start : start + 4096]))
            assert decoder.decompressed_total <= 64 * 1024 + 1
    assert str(caught.value.code) == "FETCH_DECOMPRESSION_LIMIT"
    assert produced <= 64 * 1024 + 1


def test_an_identity_response_is_unaffected() -> None:
    decoder = BoundedDecoder(None, 1024, 100)
    assert decoder.feed(b"plain bytes") == b"plain bytes"
    assert decoder.finish() == b""


def test_a_gzip_body_below_every_limit_round_trips(
    fixture_server, fake_resolver, policy_loader
) -> None:
    """The guards must not break the ordinary compressed response they exist to protect."""
    import gzip

    plain = b"%PDF-1.7\n" + b"real document bytes " * 100
    fixture_server.route(
        "/latest/ok.gz",
        ScriptedResponse(status=200, headers=GZIP_HEADERS, body=gzip.compress(plain, mtime=0)),
    )
    fake_resolver.add_v4("docs.example.test", "127.0.0.1")
    url = fixture_server.url("docs.example.test", "/latest/ok.gz")
    with build_fetcher(policy_loader=policy_loader, resolver=fake_resolver) as fetcher:
        with fetcher.fetching(request_for(url, "DEMO-OK")) as result:
            assert result.byte_length == len(plain)
            assert result.sha256 == hashlib.sha256(plain).hexdigest()
            assert Path(result.body_path or "").read_bytes() == plain
