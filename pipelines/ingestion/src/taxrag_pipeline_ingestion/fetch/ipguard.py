"""Default-deny address policy (INGF-02 deliverable 2; PRD §37.4, §21.1, SEC-002).

PRD §37.4: "The fetcher resolves DNS and rejects loopback, private, link-local, multicast and
cloud-metadata addresses before and after redirects." An address is accepted only if it is global
unicast **and** matches none of the deny sets below; the default is denial, so an address family
nobody thought about is refused rather than allowed.

WHY THE EXPLICIT CIDR SETS ARE NOT REDUNDANT WITH `is_global`. Measured on this repository's
CPython 3.14.6: `ipaddress.ip_address("224.0.0.1").is_global` is **True**, so a rule set that
trusted `is_global` alone would let multicast through. In the other direction
`ipaddress.ip_address("100.100.100.200")` is neither private nor global, and it is a real cloud
metadata endpoint. `is_global` is therefore kept as an ADDITIONAL filter, never as the only one.

WHY THE METADATA LIST IS NOT REDUNDANT EITHER. At least one public cloud publishes a globally
routable metadata address, and a metadata endpoint is the highest-value SSRF target there is
(credentials). The three metadata HOST NAMES are checked before DNS is consulted at all, because a
resolver that answers them is already the attack.

DEFENCE IN DEPTH, NOT A PRD REQUIREMENT. The five PRD §37.4 categories are loopback, private,
link-local, multicast and cloud-metadata. The "unspecified / broadcast / reserved" set and the
`is_global` filter are a documented defence-in-depth ADDITION by this ticket (deliverable 2 states
this wording explicitly), not a PRD requirement — recorded here so a later reader does not mistake
one for the other.
"""

from __future__ import annotations

import ipaddress
import socket
from dataclasses import dataclass
from typing import Protocol, Sequence

from ..adapter.failures import FailureCode
from .errors import FetchFailure

__all__ = [
    "METADATA_ADDRESSES",
    "METADATA_HOST_NAMES",
    "Resolver",
    "ScreenedAddress",
    "SystemResolver",
    "deny_reason",
    "resolve_and_screen",
]

#: Cloud-metadata addresses, deliverable 2's explicit list (AWS/GCP/Azure IMDS, AWS ECS task
#: metadata, and Alibaba Cloud's 100.100.100.200 — which is neither private nor global).
METADATA_ADDRESSES: frozenset[str] = frozenset(
    {"169.254.169.254", "fd00:ec2::254", "169.254.170.2", "100.100.100.200"}
)

#: Host names that resolve to a metadata endpoint on at least one cloud. Checked BEFORE DNS.
METADATA_HOST_NAMES: frozenset[str] = frozenset(
    {"metadata.google.internal", "metadata", "instance-data"}
)

_PRIVATE_NETWORKS = tuple(
    ipaddress.ip_network(cidr)
    for cidr in ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "fc00::/7")
)
_LINK_LOCAL_NETWORKS = tuple(
    ipaddress.ip_network(cidr) for cidr in ("169.254.0.0/16", "fe80::/10")
)
_MULTICAST_NETWORKS = tuple(ipaddress.ip_network(cidr) for cidr in ("224.0.0.0/4", "ff00::/8"))
_UNSPECIFIED_NETWORKS = tuple(
    ipaddress.ip_network(cidr) for cidr in ("0.0.0.0/8", "255.255.255.255/32", "::/128")
)


@dataclass(frozen=True, slots=True, kw_only=True)
class ScreenedAddress:
    """One address that passed the screen, pinned for the connection that follows.

    The connection is opened to `address`; `host` stays the original hostname so the `Host` header,
    the TLS SNI value and the certificate hostname check all remain bound to it. That pairing is the
    DNS-rebinding defence (PRD §21.1) and it is why this is a value object rather than a bare string.
    """

    host: str
    family: int
    address: str
    port: int


class Resolver(Protocol):
    """DNS, injectable so the suite can run with outbound resolution disabled."""

    def resolve(self, host: str, port: int) -> Sequence[tuple[int, str]]: ...


class SystemResolver:
    """`socket.getaddrinfo` for A and AAAA, in the order the resolver returned them."""

    __slots__ = ()

    def resolve(self, host: str, port: int) -> Sequence[tuple[int, str]]:
        infos = socket.getaddrinfo(host, port, socket.AF_UNSPEC, socket.SOCK_STREAM)
        return tuple((family, sockaddr[0]) for family, _, _, _, sockaddr in infos)


def _unwrap(address: ipaddress.IPv4Address | ipaddress.IPv6Address):
    """Unwrap an IPv4-mapped or IPv4-compatible IPv6 address to the embedded IPv4 address.

    `::ffff:169.254.169.254` must be screened as `169.254.169.254`, or every deny set below can be
    walked straight past.
    """
    if isinstance(address, ipaddress.IPv6Address):
        mapped = address.ipv4_mapped
        if mapped is not None:
            return mapped
        if int(address) < 2**32 and int(address) > 1:
            return ipaddress.IPv4Address(int(address))
    return address


def deny_reason(address_text: str) -> str | None:
    """The name of the first deny rule *address_text* matches, or `None` when it is acceptable.

    Rules are evaluated in a fixed order so a failure names the class of problem, which is what the
    parametrised deny-set test asserts.
    """
    try:
        parsed = ipaddress.ip_address(address_text)
    except ValueError:
        return "unparseable"
    if address_text in METADATA_ADDRESSES or str(parsed) in METADATA_ADDRESSES:
        return "cloud-metadata"
    address = _unwrap(parsed)
    if str(address) in METADATA_ADDRESSES:
        return "cloud-metadata"
    if address.is_loopback:
        return "loopback"
    if address.is_private and not address.is_link_local and not address.is_multicast:
        for network in _PRIVATE_NETWORKS:
            if address.version == network.version and address in network:
                return "private"
    if address.is_link_local:
        return "link-local"
    for network in _LINK_LOCAL_NETWORKS:
        if address.version == network.version and address in network:
            return "link-local"
    if address.is_multicast:
        return "multicast"
    for network in _MULTICAST_NETWORKS:
        if address.version == network.version and address in network:
            return "multicast"
    if address.is_unspecified or address == ipaddress.IPv4Address("255.255.255.255"):
        return "unspecified-or-broadcast"
    for network in _UNSPECIFIED_NETWORKS:
        if address.version == network.version and address in network:
            return "unspecified-or-broadcast"
    if address.is_reserved:
        return "reserved"
    if not address.is_global:
        return "not-global"
    return None


def resolve_and_screen(
    host: str,
    port: int,
    resolver: Resolver,
    *,
    allow_loopback: bool = False,
) -> Sequence[ScreenedAddress]:
    """Resolve *host* and return only the addresses that pass the screen.

    Raises `FetchFailure(FETCH_DENIED_DNS_UNRESOLVED)` when resolution fails or returns nothing, and
    `FetchFailure(FETCH_DENIED_IP)` when EVERY answer is denied — the failure names the rule that
    denied the first answer, and never more of the address set than that (PRD §22 bounds what may
    be reported on this path).

    `allow_loopback` is the deliverable 10 seam and is threaded from
    `FetchLimits.allow_loopback_for_tests` and from nowhere else. It relaxes the loopback rule only;
    a loopback address that is also on the metadata list is still denied.
    """
    lowered = host.strip().rstrip(".").lower()
    if lowered in METADATA_HOST_NAMES:
        raise FetchFailure(
            FailureCode("FETCH_DENIED_IP"),
            f"host {lowered!r} is a known cloud-metadata name",
            details={"rule": "cloud-metadata-host"},
        )

    try:
        answers = resolver.resolve(host, port)
    except FetchFailure:
        raise
    except Exception as exc:  # a resolver failure is a fetch failure, never a crash
        raise FetchFailure(
            FailureCode("FETCH_DENIED_DNS_UNRESOLVED"),
            f"DNS resolution failed for {host!r}",
            details={"error": type(exc).__name__},
        ) from exc
    if not answers:
        raise FetchFailure(
            FailureCode("FETCH_DENIED_DNS_UNRESOLVED"),
            f"DNS returned no address for {host!r}",
        )

    accepted: list[ScreenedAddress] = []
    first_reason: str | None = None
    for family, address_text in answers:
        reason = deny_reason(address_text)
        if reason == "loopback" and allow_loopback:
            reason = None
        if reason is None:
            accepted.append(
                ScreenedAddress(host=host, family=family, address=address_text, port=port)
            )
            continue
        if first_reason is None:
            first_reason = reason

    if not accepted:
        raise FetchFailure(
            FailureCode("FETCH_DENIED_IP"),
            f"every address for {host!r} was denied ({first_reason})",
            details={"rule": first_reason or "unknown"},
        )
    return tuple(accepted)
