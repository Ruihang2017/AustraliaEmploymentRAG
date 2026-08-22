"""The `allowlist.yaml` loader and the URL policy check (INGF-02 deliverable 1).

PRD §37.4: "Each source has an allowlisted scheme/domain/path policy." Plan §2.1 A2 requires the
allowlist to be a **per-adapter** file (`pipelines/adapters/<group-id>/allowlist.yaml`) rather than
one shared document, because a shared document would serialise all 52 adapter tickets. This module
owns the schema and the loader; modules `06`-`10` own the instances.

CHECK ORDER is fixed and tested: scheme -> host -> path prefix -> deny paths. `check()` **returns**
an `AllowDecision`; it never raises, never fetches and never resolves DNS. `client.py` turns a
denial into a `FetchFailure`, which is what keeps a denial identical at hop 0 and at every redirect
hop except for the code it is reported under (`FETCH_REDIRECT_DENIED`).

NORMALISATION BEFORE COMPARISON is the whole security value of this module (R5). A host is compared
after IDNA/ASCII encoding, lowercasing and trailing-dot removal, on label boundaries — never as a
suffix string, so `evil-www.legislation.gov.au` cannot match `www.legislation.gov.au`. A path is
compared after percent-decoding and a segment walk, so `/Latest/../../etc` and `/%2e%2e/etc`
cannot slip past a prefix. A URL carrying userinfo (`user@host`) is refused outright: it is the
oldest allowlist bypass there is.

POLITENESS KEYS ARE CARRIED, NOT ENFORCED. `min_request_interval_ms` and `max_concurrent_requests`
are declared in the schema here (deliverable 1) so that `INGF-08` — which owns scheduling and
cadence — has somewhere to read them from. INGF-02 deliberately does not rate-limit; see the
ticket's Feedback obligation item 5.
"""

from __future__ import annotations

import ipaddress
import json
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping, Protocol, Sequence
from urllib.parse import unquote, urlsplit

from ..adapter.failures import FailureCode
from .limits import FetchLimits
from .yaml_min import YamlSubsetError, parse_yaml_subset

__all__ = [
    "ALLOWLIST_FILENAME",
    "AllowDecision",
    "AllowlistError",
    "AllowlistPolicy",
    "DirectoryPolicyLoader",
    "HostRule",
    "PolicyLoader",
    "allowlist_schema",
    "effective_max_bytes",
    "load_allowlist",
    "normalise_host",
    "normalise_path",
]

#: The file name is fixed by deliverable 1 and by the 52 adapter tickets that write one.
ALLOWLIST_FILENAME = "allowlist.yaml"

_SCHEMA_PATH = Path(__file__).resolve().parent / "schema" / "allowlist.schema.json"

#: The only scheme PRD §21.1 permits on this path.
REQUIRED_SCHEMES: tuple[str, ...] = ("https",)

#: The only port an `https` URL may name explicitly. A non-standard port is permitted solely for the
#: deliverable 10 loopback fixture server, and only when the caller passes `allow_nonstandard_port`.
STANDARD_HTTPS_PORT = 443


class AllowlistError(ValueError):
    """An `allowlist.yaml` is missing, malformed, or violates a rule the schema cannot express."""


@dataclass(frozen=True, slots=True, kw_only=True)
class HostRule:
    """One entry of the `hosts` list, normalised."""

    host: str
    include_subdomains: bool
    path_prefixes: tuple[str, ...]
    min_request_interval_ms: int | None = None
    max_concurrent_requests: int | None = None
    approved_max_bytes: int | None = None
    approved_max_bytes_reason: str | None = None


@dataclass(frozen=True, slots=True, kw_only=True)
class AllowDecision:
    """The outcome of `AllowlistPolicy.check()` — a value, never an exception."""

    allowed: bool
    code: FailureCode | None
    host_rule: HostRule | None
    reason: str


@dataclass(frozen=True, slots=True, kw_only=True)
class AllowlistPolicy:
    """A loaded, validated allowlist for one source group."""

    group_id: str
    schemes: tuple[str, ...]
    hosts: tuple[HostRule, ...]
    deny_paths: tuple[str, ...] = ()
    notes: str = ""

    def check(self, url: str, *, allow_nonstandard_port: bool = False) -> AllowDecision:
        """Scheme -> host -> path prefix -> deny paths, in that order."""
        try:
            parts = urlsplit(url)
        except ValueError as exc:
            return _deny("FETCH_DENIED_HOST", f"the URL cannot be parsed: {exc}")

        scheme = (parts.scheme or "").lower()
        if scheme not in self.schemes:
            return _deny("FETCH_DENIED_SCHEME", f"scheme {scheme!r} is not allowed")

        if parts.username is not None or parts.password is not None or "@" in (parts.netloc or ""):
            return _deny("FETCH_DENIED_HOST", "a URL carrying userinfo is refused")

        try:
            port = parts.port
        except ValueError:
            return _deny("FETCH_DENIED_HOST", "the URL port is not a number")
        if port is not None and port != STANDARD_HTTPS_PORT and not allow_nonstandard_port:
            return _deny("FETCH_DENIED_HOST", f"an explicit port {port} is refused")

        raw_host = parts.hostname
        if not raw_host:
            return _deny("FETCH_DENIED_HOST", "the URL has no host")
        if raw_host.startswith("[") or _is_ip_literal(raw_host):
            return _deny("FETCH_DENIED_HOST", "an IP-literal host is refused; allowlists name hosts")
        try:
            host = normalise_host(raw_host)
        except AllowlistError as exc:
            return _deny("FETCH_DENIED_HOST", str(exc))

        rule = self._match_host(host)
        if rule is None:
            return _deny("FETCH_DENIED_HOST", f"host {host!r} is not in the allowlist")

        path = normalise_path(parts.path)
        if path is None:
            return _deny("FETCH_DENIED_PATH", "the path escapes its root after normalisation")

        if not any(path.startswith(prefix) for prefix in rule.path_prefixes):
            return _deny("FETCH_DENIED_PATH", f"path {path!r} is outside the allowed prefixes", rule)

        for denied in self.deny_paths:
            if path.startswith(denied):
                return _deny("FETCH_DENIED_PATH", f"path {path!r} matches deny_paths {denied!r}", rule)

        return AllowDecision(allowed=True, code=None, host_rule=rule, reason="allowed")

    def _match_host(self, host: str) -> HostRule | None:
        for rule in self.hosts:
            if host == rule.host:
                return rule
            # Label-boundary match only: a suffix-string match would accept `evil-www.example`.
            if rule.include_subdomains and host.endswith("." + rule.host):
                return rule
        return None


def _deny(code: str, reason: str, rule: HostRule | None = None) -> AllowDecision:
    return AllowDecision(allowed=False, code=FailureCode(code), host_rule=rule, reason=reason)


def _is_ip_literal(host: str) -> bool:
    try:
        ipaddress.ip_address(host.strip("[]"))
    except ValueError:
        return False
    return True


def normalise_host(host: str) -> str:
    """Lowercase, strip a trailing dot, and IDNA-encode each label to ASCII."""
    candidate = host.strip().rstrip(".")
    if not candidate:
        raise AllowlistError("empty host")
    labels: list[str] = []
    for label in candidate.split("."):
        if not label:
            raise AllowlistError(f"host {host!r} has an empty label")
        try:
            if label.isascii():
                encoded = label.lower()
            else:
                encoded = label.encode("idna").decode("ascii").lower()
        except UnicodeError as exc:
            raise AllowlistError(f"host {host!r} is not IDNA-encodable: {exc}") from exc
        labels.append(encoded)
    return ".".join(labels)


def normalise_path(path: str) -> str | None:
    """Percent-decode and normalise *path*; `None` when it escapes its root.

    The segment walk is written out rather than delegated to `posixpath.normpath`, because
    `normpath` answers two questions wrongly for this purpose: it PRESERVES a leading `//` (a POSIX
    rule), and it silently swallows a `..` that climbs above the root instead of reporting it. A
    path that tried to climb out is a bypass attempt and must be visible as one.
    """
    decoded = unquote(path or "/")
    if not decoded.startswith("/"):
        decoded = "/" + decoded
    trailing_slash = decoded.endswith("/") and decoded != "/"
    stack: list[str] = []
    for segment in decoded.split("/"):
        if segment in ("", "."):
            continue
        if segment == "..":
            if not stack:
                return None
            stack.pop()
            continue
        stack.append(segment)
    normalised = "/" + "/".join(stack)
    if trailing_slash and not normalised.endswith("/"):
        normalised += "/"
    return normalised


def allowlist_schema() -> Mapping[str, Any]:
    """The committed JSON Schema document (deliverable 1)."""
    return json.loads(_SCHEMA_PATH.read_text(encoding="utf-8"))


def _validate_against_schema(document: Any, source: Path) -> None:
    # Imported lazily: `contracts` eagerly imports `contracts.schema` -> `sqlite3`, and the corpus
    # database has no business being an import-time cost of the fetcher.
    from contracts.jsonschema_min import Draft202012Validator, ValidationError

    schema = allowlist_schema()
    validator = Draft202012Validator(schema, documents={str(schema["$id"]): schema})
    try:
        validator.validate(document)
    except ValidationError as exc:
        raise AllowlistError(f"{source}: {exc.message} (at {exc.path})") from exc


def load_allowlist(group_dir: Path) -> AllowlistPolicy:
    """Load, validate and normalise `<group_dir>/allowlist.yaml`."""
    group_dir = Path(group_dir)
    source = group_dir / ALLOWLIST_FILENAME
    if not source.is_file():
        raise AllowlistError(f"{source} does not exist")
    try:
        document = parse_yaml_subset(source.read_text(encoding="utf-8"))
    except YamlSubsetError as exc:
        raise AllowlistError(f"{source}: {exc}") from exc
    except UnicodeDecodeError as exc:
        raise AllowlistError(f"{source}: not valid UTF-8") from exc
    if not isinstance(document, dict):
        raise AllowlistError(f"{source}: the document must be a mapping")

    _validate_against_schema(document, source)

    group_id = str(document["group_id"])
    expected = group_dir.name.upper()
    if group_id != expected:
        raise AllowlistError(
            f"{source}: group_id {group_id!r} must equal the directory name uppercased ({expected!r})"
        )

    schemes = tuple(str(item) for item in document["schemes"])
    if schemes != REQUIRED_SCHEMES:
        raise AllowlistError(
            f"{source}: schemes must be exactly ['https'] (PRD §21.1); got {list(schemes)}"
        )

    raw_hosts = document["hosts"]
    if not raw_hosts:
        raise AllowlistError(f"{source}: hosts must list at least one entry")

    hosts: list[HostRule] = []
    seen: set[str] = set()
    for entry in raw_hosts:
        hosts.append(_host_rule(entry, source))
        if hosts[-1].host in seen:
            raise AllowlistError(f"{source}: host {hosts[-1].host!r} is listed twice")
        seen.add(hosts[-1].host)

    deny_paths = tuple(str(item) for item in document.get("deny_paths") or ())
    for denied in deny_paths:
        if not denied.startswith("/"):
            raise AllowlistError(f"{source}: deny_paths entry {denied!r} must start with '/'")

    return AllowlistPolicy(
        group_id=group_id,
        schemes=schemes,
        hosts=tuple(hosts),
        deny_paths=deny_paths,
        notes=str(document.get("notes") or ""),
    )


def _host_rule(entry: Mapping[str, Any], source: Path) -> HostRule:
    raw_host = str(entry["host"])
    if _is_ip_literal(raw_host):
        raise AllowlistError(
            f"{source}: host {raw_host!r} is an IP literal; an allowlist names hosts, and an IP "
            "literal would bypass the DNS screen this module exists to enforce"
        )
    host = normalise_host(raw_host)

    prefixes = tuple(str(item) for item in entry["path_prefixes"])
    if not prefixes:
        raise AllowlistError(f"{source}: host {host!r} has no path_prefixes")
    for prefix in prefixes:
        if not prefix.startswith("/"):
            raise AllowlistError(f"{source}: path prefix {prefix!r} must start with '/'")

    approved = entry.get("approved_max_bytes")
    reason = entry.get("approved_max_bytes_reason")
    if approved is not None:
        if not isinstance(approved, int) or isinstance(approved, bool) or approved <= 0:
            raise AllowlistError(f"{source}: approved_max_bytes must be a positive integer")
        if not isinstance(reason, str) or not reason.strip():
            raise AllowlistError(
                f"{source}: host {host!r} sets approved_max_bytes without "
                "approved_max_bytes_reason; PRD §37.4 requires the reason for a source-specific "
                "approved limit"
            )

    return HostRule(
        host=host,
        include_subdomains=bool(entry["include_subdomains"]),
        path_prefixes=prefixes,
        min_request_interval_ms=entry.get("min_request_interval_ms"),
        max_concurrent_requests=entry.get("max_concurrent_requests"),
        approved_max_bytes=approved,
        approved_max_bytes_reason=reason,
    )


def effective_max_bytes(
    host_rule: HostRule | None,
    limits: FetchLimits,
    request_max_bytes: int | None = None,
) -> int:
    """The byte ceiling for one fetch.

    A per-host `approved_max_bytes` RAISES the ceiling above the default (PRD §37.4's
    "source-specific approved limit"); a caller-supplied `validators.max_bytes` can only LOWER it.
    """
    ceiling = limits.max_document_bytes
    if host_rule is not None and host_rule.approved_max_bytes is not None:
        ceiling = host_rule.approved_max_bytes
    if request_max_bytes is not None:
        ceiling = min(ceiling, request_max_bytes)
    return ceiling


class PolicyLoader(Protocol):
    """How `SafeFetcher` obtains a group's policy — injectable, so tests need no adapter tree."""

    def load(self, group_id: str) -> AllowlistPolicy: ...


class DirectoryPolicyLoader:
    """Loads `<root>/<group-id lowercased>/allowlist.yaml`, caching per group.

    The cache is guarded by a lock because `INGF-08` will drive concurrent fetches through one
    `SafeFetcher` (R9). A load failure is not cached: a corrected file must take effect on the next
    run without a process restart.
    """

    __slots__ = ("_root", "_cache", "_lock")

    def __init__(self, root: Path) -> None:
        self._root = Path(root)
        self._cache: dict[str, AllowlistPolicy] = {}
        self._lock = threading.Lock()

    @property
    def root(self) -> Path:
        return self._root

    def load(self, group_id: str) -> AllowlistPolicy:
        key = group_id.upper()
        with self._lock:
            cached = self._cache.get(key)
        if cached is not None:
            return cached
        policy = load_allowlist(self._root / key.lower())
        with self._lock:
            self._cache.setdefault(key, policy)
            return self._cache[key]

    def groups(self) -> Sequence[str]:
        if not self._root.is_dir():
            return ()
        return tuple(
            sorted(
                item.name.upper()
                for item in self._root.iterdir()
                if (item / ALLOWLIST_FILENAME).is_file()
            )
        )
