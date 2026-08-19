"""Deliverable 2 — every deny set fires, and three public controls still pass.

Acceptance: "Every deny set fires: loopback, private (all three IPv4 blocks + fc00::/7), link-local
(v4 and v6), multicast, unspecified/broadcast, and each of the four cloud-metadata addresses →
FETCH_DENIED_IP. Parametrised, one case per address class."
"""

from __future__ import annotations

import socket

import pytest
from fetch_resolver import ScriptedResolver

from taxrag_pipeline_ingestion.fetch.errors import FetchFailure
from taxrag_pipeline_ingestion.fetch.ipguard import (
    METADATA_ADDRESSES,
    METADATA_HOST_NAMES,
    deny_reason,
    resolve_and_screen,
)

DENIED = [
    ("127.0.0.1", "loopback"),
    ("127.5.6.7", "loopback"),
    ("::1", "loopback"),
    ("10.1.2.3", "private"),
    ("172.16.0.1", "private"),
    ("172.31.255.254", "private"),
    ("192.168.1.1", "private"),
    ("fc00::1", "private"),
    ("fd12:3456::1", "private"),
    ("169.254.1.1", "link-local"),
    ("fe80::1", "link-local"),
    ("224.0.0.1", "multicast"),
    ("239.255.255.250", "multicast"),
    ("ff02::1", "multicast"),
    ("0.0.0.0", "unspecified-or-broadcast"),
    ("0.1.2.3", "unspecified-or-broadcast"),
    ("255.255.255.255", "unspecified-or-broadcast"),
    ("::", "unspecified-or-broadcast"),
    ("240.0.0.1", "reserved"),
    ("192.0.2.1", "not-global"),
    ("100.64.1.1", "not-global"),
    ("169.254.169.254", "cloud-metadata"),
    ("fd00:ec2::254", "cloud-metadata"),
    ("169.254.170.2", "cloud-metadata"),
    ("100.100.100.200", "cloud-metadata"),
    # IPv4-mapped / IPv4-compatible IPv6 must be unwrapped BEFORE the deny sets run.
    ("::ffff:127.0.0.1", "loopback"),
    ("::ffff:169.254.169.254", "cloud-metadata"),
    ("::ffff:10.0.0.1", "private"),
    ("::7f00:1", "loopback"),
]

PUBLIC_CONTROLS = ["93.184.216.34", "1.1.1.1", "2606:2800:220:1:248:1893:25c8:1946"]


@pytest.mark.parametrize(("address", "rule"), DENIED)
def test_every_deny_set_fires(address: str, rule: str) -> None:
    assert deny_reason(address) == rule


@pytest.mark.parametrize("address", PUBLIC_CONTROLS)
def test_a_public_address_is_accepted(address: str) -> None:
    assert deny_reason(address) is None


@pytest.mark.parametrize("address", sorted(METADATA_ADDRESSES))
def test_each_metadata_address_is_denied_as_metadata(address: str) -> None:
    assert deny_reason(address) == "cloud-metadata"


@pytest.mark.parametrize(("address", "rule"), DENIED)
def test_a_denied_address_yields_fetch_denied_ip(address: str, rule: str) -> None:
    family = socket.AF_INET6 if ":" in address else socket.AF_INET
    resolver = ScriptedResolver().add("host.example.test", [(family, address)])
    with pytest.raises(FetchFailure) as caught:
        resolve_and_screen("host.example.test", 443, resolver)
    assert str(caught.value.code) == "FETCH_DENIED_IP"
    assert caught.value.details["rule"] == rule


@pytest.mark.parametrize("host", sorted(METADATA_HOST_NAMES))
def test_a_metadata_host_name_is_denied_before_dns(host: str) -> None:
    resolver = ScriptedResolver()
    with pytest.raises(FetchFailure) as caught:
        resolve_and_screen(host, 443, resolver)
    assert str(caught.value.code) == "FETCH_DENIED_IP"
    assert caught.value.details["rule"] == "cloud-metadata-host"
    assert resolver.calls == []  # never resolved: the name alone is the answer


def test_a_public_answer_is_screened_and_pinned() -> None:
    resolver = ScriptedResolver().add_v4("host.example.test", "93.184.216.34")
    screened = resolve_and_screen("host.example.test", 443, resolver)
    assert [item.address for item in screened] == ["93.184.216.34"]
    assert screened[0].host == "host.example.test"
    assert screened[0].port == 443


def test_a_mixed_answer_keeps_only_the_acceptable_addresses() -> None:
    resolver = ScriptedResolver().add(
        "host.example.test",
        [(socket.AF_INET, "127.0.0.1"), (socket.AF_INET, "93.184.216.34")],
    )
    screened = resolve_and_screen("host.example.test", 443, resolver)
    assert [item.address for item in screened] == ["93.184.216.34"]


def test_unresolvable_dns_is_its_own_code() -> None:
    resolver = ScriptedResolver()
    with pytest.raises(FetchFailure) as caught:
        resolve_and_screen("nowhere.example.test", 443, resolver)
    assert str(caught.value.code) == "FETCH_DENIED_DNS_UNRESOLVED"


def test_an_empty_answer_is_unresolved_not_denied() -> None:
    resolver = ScriptedResolver().add("host.example.test", [])
    with pytest.raises(FetchFailure) as caught:
        resolve_and_screen("host.example.test", 443, resolver)
    assert str(caught.value.code) == "FETCH_DENIED_DNS_UNRESOLVED"


def test_loopback_passes_only_through_the_explicit_seam() -> None:
    resolver = ScriptedResolver().add_v4("local.example.test", "127.0.0.1")
    with pytest.raises(FetchFailure):
        resolve_and_screen("local.example.test", 443, resolver)
    screened = resolve_and_screen("local.example.test", 443, resolver, allow_loopback=True)
    assert screened[0].address == "127.0.0.1"


def test_the_seam_does_not_relax_any_other_rule() -> None:
    resolver = ScriptedResolver().add_v4("meta.example.test", "169.254.169.254")
    with pytest.raises(FetchFailure) as caught:
        resolve_and_screen("meta.example.test", 443, resolver, allow_loopback=True)
    assert caught.value.details["rule"] == "cloud-metadata"


def test_the_failure_details_are_bounded() -> None:
    """PRD §22 — a denial reports the RULE, not the whole resolved address set."""
    resolver = ScriptedResolver().add(
        "host.example.test",
        [(socket.AF_INET, "10.0.0.1"), (socket.AF_INET, "192.168.0.1")],
    )
    with pytest.raises(FetchFailure) as caught:
        resolve_and_screen("host.example.test", 443, resolver)
    assert set(caught.value.details) == {"rule"}
