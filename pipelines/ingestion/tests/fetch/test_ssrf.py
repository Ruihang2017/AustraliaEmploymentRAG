"""The SEC-002 SSRF suite (deliverable 3 steps 2-3 and 9; PRD §21.1, §37.4).

Every case asserts both the `FailureCode` AND that nothing was sent to the denied target — a
control that reports the right code after issuing the request is not a control.

A NOTE ON THE REBINDING CASE. The ticket describes a resolver answering a public address first and
`127.0.0.1` second. This suite runs with outbound network disabled (deliverable 10), so a connection
to a public address cannot be attempted at all; the case is therefore built the other way round —
answer 1 is the loopback fixture server, answer 2 is the AWS metadata address — and it proves the
same property: the fetch uses answer 1, the resolver is called exactly once per hop, and a fetch
that DOES take answer 2 is denied. If the fetcher re-resolved between the screen and the connect,
the second fetch's answer would have been used by the first.
"""

from __future__ import annotations

import socket
import ssl

import pytest
from fetch_paths import OutboundNetworkDenied
from fetch_harness import build_fetcher, request_for
from fetch_server import ScriptedResponse

from taxrag_pipeline_ingestion.fetch.connection import TlsPinnedConnectionFactory, tls_context
from taxrag_pipeline_ingestion.fetch.errors import FetchFailure

OK_BODY = b"%PDF-1.7\nbody"
PDF_HEADERS = {"Content-Type": "application/pdf"}


def _fetcher(policy_loader, resolver, **kw):
    return build_fetcher(policy_loader=policy_loader, resolver=resolver, **kw)


def test_the_network_guard_is_active() -> None:
    """Deliverable 10 — the suite cannot leave the machine."""
    with pytest.raises(OutboundNetworkDenied):
        socket.create_connection(("93.184.216.34", 80), timeout=1)
    with pytest.raises(OutboundNetworkDenied):
        socket.getaddrinfo("example.com", 443)


def test_pinned_address_survives_a_rebinding_resolver(
    fixture_server, fake_resolver, policy_loader
) -> None:
    url = fixture_server.url("docs.example.test", "/latest/doc.pdf")
    fixture_server.route(
        "/latest/doc.pdf",
        ScriptedResponse(status=200, headers=PDF_HEADERS, body=OK_BODY),
        ScriptedResponse(status=200, headers=PDF_HEADERS, body=OK_BODY),
    )
    # A rebinding resolver: the fixture server first, a metadata address on the next call.
    fake_resolver.add_v4("docs.example.test", "127.0.0.1", "169.254.169.254")

    with _fetcher(policy_loader, fake_resolver) as fetcher:
        with fetcher.fetching(request_for(url, "DEMO-OK")) as result:
            assert result.status_code == 200
        # Exactly one resolution for the one hop: no re-resolution between screen and connect.
        assert fake_resolver.call_count("docs.example.test") == 1

        # The resolver really does rebind — the next call takes the metadata answer and is denied.
        with pytest.raises(FetchFailure) as caught:
            fetcher.fetch(request_for(url, "DEMO-OK"))
        assert str(caught.value.code) == "FETCH_DENIED_IP"
        assert caught.value.details["rule"] == "cloud-metadata"


def test_redirect_to_denied_host(fixture_server, fake_resolver, policy_loader) -> None:
    start = fixture_server.url("docs.example.test", "/latest/start")
    evil = fixture_server.url("evil.example.test", "/latest/loot")
    fixture_server.route("/latest/start", ScriptedResponse(status=302, headers={"Location": evil}))
    fixture_server.route("/latest/loot", ScriptedResponse(status=200, headers=PDF_HEADERS, body=OK_BODY))
    fake_resolver.add_v4("docs.example.test", "127.0.0.1")
    fake_resolver.add_v4("evil.example.test", "127.0.0.1")

    with _fetcher(policy_loader, fake_resolver) as fetcher:
        with pytest.raises(FetchFailure) as caught:
            fetcher.fetch(request_for(start, "DEMO-OK"))
    assert str(caught.value.code) == "FETCH_REDIRECT_DENIED"
    # The evidence: the server never saw a request carrying that Host, and DNS was never asked.
    assert fixture_server.requests_for_host("evil.example.test") == ()
    assert fake_resolver.call_count("evil.example.test") == 0


def test_redirect_host_resolving_to_metadata(fixture_server, fake_resolver, policy_loader) -> None:
    start = fixture_server.url("docs.example.test", "/latest/start2")
    onward = fixture_server.url("mirror.example.test", "/anything")
    fixture_server.route("/latest/start2", ScriptedResponse(status=302, headers={"Location": onward}))
    fixture_server.route("/anything", ScriptedResponse(status=200, headers=PDF_HEADERS, body=OK_BODY))
    fake_resolver.add_v4("docs.example.test", "127.0.0.1")
    fake_resolver.add_v4("mirror.example.test", "169.254.169.254")

    with _fetcher(policy_loader, fake_resolver) as fetcher:
        with pytest.raises(FetchFailure) as caught:
            fetcher.fetch(request_for(start, "DEMO-OK"))
    assert str(caught.value.code) == "FETCH_DENIED_IP"
    assert fixture_server.requests_for_host("mirror.example.test") == ()


def test_redirect_limit(fixture_server, fake_resolver, policy_loader) -> None:
    """Six chained redirects against a limit of five."""
    for index in range(1, 9):
        target = fixture_server.url("mirror.example.test", f"/hop{index + 1}")
        fixture_server.route(f"/hop{index}", ScriptedResponse(status=302, headers={"Location": target}))
    fake_resolver.add_v4("mirror.example.test", "127.0.0.1")
    start = fixture_server.url("mirror.example.test", "/hop1")

    with _fetcher(policy_loader, fake_resolver) as fetcher:
        with pytest.raises(FetchFailure) as caught:
            fetcher.fetch(request_for(start, "DEMO-OK"))
    assert str(caught.value.code) == "FETCH_REDIRECT_LIMIT"
    assert caught.value.details["hops"] == 6


def test_final_url_is_the_last_hop(fixture_server, fake_resolver, policy_loader) -> None:
    second = fixture_server.url("mirror.example.test", "/two")
    third = fixture_server.url("mirror.example.test", "/three")
    start = fixture_server.url("mirror.example.test", "/one")
    fixture_server.route("/one", ScriptedResponse(status=302, headers={"Location": second}))
    fixture_server.route("/two", ScriptedResponse(status=301, headers={"Location": third}))
    fixture_server.route("/three", ScriptedResponse(status=200, headers=PDF_HEADERS, body=OK_BODY))
    fake_resolver.add_v4("mirror.example.test", "127.0.0.1")

    with _fetcher(policy_loader, fake_resolver) as fetcher:
        with fetcher.fetching(request_for(start, "DEMO-OK")) as result:
            assert result.official_url == start
            assert result.final_url == third
            assert list(result.redirect_chain) == [second, third]
            # Every hop was screened again: three policy checks, three resolutions.
            assert fake_resolver.call_count("mirror.example.test") == 3


@pytest.mark.parametrize(
    "url",
    [
        "file:///etc/passwd",
        "gopher://docs.example.test/latest/x",
        "ftp://docs.example.test/latest/x",
        "http://docs.example.test/latest/x",
    ],
)
def test_a_non_https_scheme_is_denied_before_any_socket(
    url: str, fixture_server, fake_resolver, policy_loader
) -> None:
    with _fetcher(policy_loader, fake_resolver) as fetcher:
        with pytest.raises(FetchFailure) as caught:
            fetcher.fetch(request_for(url, "DEMO-OK"))
    assert str(caught.value.code) == "FETCH_DENIED_SCHEME"
    assert fake_resolver.calls == []
    assert fixture_server.requests == ()


def test_an_ip_literal_url_is_denied(fixture_server, fake_resolver, policy_loader) -> None:
    url = f"https://127.0.0.1:{fixture_server.port}/latest/doc.pdf"
    with _fetcher(policy_loader, fake_resolver) as fetcher:
        with pytest.raises(FetchFailure) as caught:
            fetcher.fetch(request_for(url, "DEMO-OK"))
    assert str(caught.value.code) == "FETCH_DENIED_HOST"
    assert fixture_server.requests == ()


def test_the_tls_context_is_fully_verified() -> None:
    """R3's compensating assertion: the production TLS configuration, checked directly."""
    context = tls_context()
    assert context.check_hostname is True
    assert context.verify_mode is ssl.CERT_REQUIRED
    assert context.minimum_version is ssl.TLSVersion.TLSv1_2


def test_the_production_factory_fails_closed_against_a_plaintext_server(
    fixture_server, fake_resolver, policy_loader
) -> None:
    """R3: no certificate can be committed or generated here, so the production factory is pointed
    at the plaintext fixture server and must fail CLOSED rather than downgrade."""
    url = fixture_server.url("docs.example.test", "/latest/doc.pdf")
    fixture_server.route("/latest/doc.pdf", ScriptedResponse(status=200, headers=PDF_HEADERS, body=OK_BODY))
    fake_resolver.add_v4("docs.example.test", "127.0.0.1")

    with _fetcher(
        policy_loader,
        fake_resolver,
        connection_factory=TlsPinnedConnectionFactory(),
        max_attempts=1,
    ) as fetcher:
        with pytest.raises(FetchFailure) as caught:
            fetcher.fetch(request_for(url, "DEMO-OK"))
    assert str(caught.value.code) == "FETCH_TLS_ERROR"


def test_the_plaintext_seam_refuses_a_non_loopback_address() -> None:
    """The seam is gated on the RESOLVED address, not only on the flag (R3)."""
    from fetch_seam import TestFetchLimits

    from taxrag_pipeline_ingestion.fetch.clock import Deadline, SystemFetchClock
    from taxrag_pipeline_ingestion.fetch.connection import PlaintextLoopbackConnectionFactory
    from taxrag_pipeline_ingestion.fetch.ipguard import ScreenedAddress

    limits = TestFetchLimits()
    deadline = Deadline(SystemFetchClock(), 5)
    screened = ScreenedAddress(
        host="docs.example.test", family=socket.AF_INET, address="93.184.216.34", port=443
    )
    with pytest.raises(FetchFailure) as caught:
        PlaintextLoopbackConnectionFactory().open("docs.example.test", screened, deadline, limits)
    assert str(caught.value.code) == "FETCH_TLS_ERROR"
