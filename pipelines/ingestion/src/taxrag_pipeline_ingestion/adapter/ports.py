"""The nine framework ports (INGF-01 deliverable 6, sub-PRD D1).

PRD §40.7 splits responsibility: "Shared framework code performs HTTP safety, hashing, artifact
persistence, retry, licensing, metrics, quarantine and run accounting." Those capabilities reach an
adapter only through these ports, and only through `AdapterRunContext`. Declaring ALL of them at
wave 1 is what lets `INGF-02`…`INGF-06` be built concurrently: each supplies one implementation and
none needs a sibling's internals. PRD §39.1 states the same rule for the TypeScript side.

Every port here is a `Protocol` — no implementation, no fake, no default. The implementing ticket is
named in each docstring and, machine-readably, in `PORT_IMPLEMENTORS`.

The port value types (`FetchRequest`, `FetchResult`, `IntendedUse`, `LicenceDecision`,
`ParserLimits`, `ParseOutcome`, `RunMode`, `RunSummary`, `ArtifactRef`) are DEFINED in `.types` and
re-exported here, so both documented import paths work. They live in `.types` because `PriorState`
(deliverable 3) carries a `RunSummary` while these ports need `ArtifactRef` — defining them here
would be a hard import cycle.
"""

from __future__ import annotations

from datetime import datetime
from typing import BinaryIO, Mapping, Protocol, runtime_checkable

from .envelope import IntermediateRecordEnvelope
from .failures import FailureCode
from .types import (
    ArtifactRef,
    FetchRequest,
    FetchResult,
    IntendedUse,
    LicenceDecision,
    ParseOutcome,
    ParserLimits,
    RunMode,
    RunSummary,
)

__all__ = [
    "PORTS",
    "PORT_IMPLEMENTORS",
    "ArtifactRef",
    "ArtifactStore",
    "Clock",
    "FetchRequest",
    "FetchResult",
    "Fetcher",
    "IntendedUse",
    "LicenceDecision",
    "LicenceGate",
    "NotWiredPort",
    "ParseOutcome",
    "ParserHost",
    "ParserLimits",
    "PortNotWiredError",
    "QuarantineSink",
    "RecordSink",
    "RunHandle",
    "RunHistoryPort",
    "RunMode",
    "RunRecorder",
    "RunSummary",
]


@runtime_checkable
class Fetcher(Protocol):
    """The shared, safety-checked HTTP fetcher — implemented by `INGF-02`.

    PRD §37.4: "Adapters use a shared fetcher, not arbitrary HTTP libraries." The architecture scan
    (deliverable 11) enforces that no adapter module imports an HTTP library directly.
    """

    def fetch(self, request: FetchRequest) -> FetchResult: ...


@runtime_checkable
class ArtifactStore(Protocol):
    """Artifact persistence and read-back (PRD §35.3) — implemented by `INGF-03`.

    `storage_permitted` is the licence outcome, not a caller preference: when it is False the
    returned `ArtifactRef.storage_key` is `None` (PRD §35.3, "object key absent when storage is not
    permitted") and no bytes are retained.
    """

    def put(
        self,
        result: FetchResult,
        *,
        source_id: str,
        licence_snapshot_id: str,
        storage_permitted: bool,
    ) -> ArtifactRef: ...

    def open(self, ref: ArtifactRef) -> BinaryIO: ...


@runtime_checkable
class LicenceGate(Protocol):
    """Per-use licence decisions (PRD §37.4) — implemented by `INGF-04`."""

    def evaluate(self, group_id: str, use: IntendedUse) -> LicenceDecision: ...


@runtime_checkable
class ParserHost(Protocol):
    """The sandboxed parser host (PRD §37.4) — implemented by `INGF-06`.

    An adapter never runs a parser in its own process: `limits` is a security boundary, and the
    outcome carries a `FailureCode` rather than raising, so a hostile document is quarantined
    instead of crashing a run.
    """

    def run(self, parser_key: str, ref: ArtifactRef, limits: ParserLimits) -> ParseOutcome: ...


@runtime_checkable
class QuarantineSink(Protocol):
    """Quarantine of an artifact that cannot be processed (PRD §12.2) — `INGF-05` implements.

    `details` never carries raw document bytes — it is operator-facing diagnostic metadata only
    (`INGF-05`'s rule, repeated here so 52 adapters read the constraint at the port). Returns the
    quarantine record id.
    """

    def quarantine(
        self,
        *,
        run_id: str,
        artifact_id: str,
        code: FailureCode,
        details: Mapping[str, object],
    ) -> str: ...


@runtime_checkable
class RunHandle(Protocol):
    """A live run: stage counters plus a terminal status (PRD §12.1) — `INGF-05` implements.

    A `Protocol` rather than a dataclass because the handle is stateful and transactional; it is
    usable as a context manager so an abandoned run is still closed out.
    """

    run_id: str

    def count(self, stage: str, n: int = 1) -> None: ...

    def finish(self, status: str, failure_code: FailureCode | None = None) -> None: ...

    def __enter__(self) -> RunHandle: ...

    def __exit__(self, exc_type: object, exc: object, tb: object) -> bool | None: ...


@runtime_checkable
class RunRecorder(Protocol):
    """Opens a run and records its accounting (PRD §12.1) — implemented by `INGF-05`."""

    def start(self, *, group_id: str, mode: RunMode) -> RunHandle: ...


@runtime_checkable
class RunHistoryPort(Protocol):
    """Prior-run lookup for incremental comparison (PRD §12.1) — implemented by `INGF-05`."""

    def latest(self, group_id: str) -> RunSummary | None: ...


@runtime_checkable
class RecordSink(Protocol):
    """Where emitted intermediate records go (PRD §40.7) — implemented by `INGF-05`.

    The adapter never writes active corpus tables directly; it emits envelopes here.
    """

    def emit(self, envelope: IntermediateRecordEnvelope) -> None: ...


@runtime_checkable
class Clock(Protocol):
    """The only source of "now" in the framework — implemented by `INGF-05` (faked in tests).

    A port rather than a call to `datetime.now()` so runs are reproducible; every persisted
    timestamp is rendered from this as UTC ISO-8601 text (PRD §35.1).
    """

    def now(self) -> datetime: ...


#: Port name -> the protocol class. Lets a composition root or a parametrised test enumerate the
#: ports without introspecting this module.
PORTS: Mapping[str, type] = {
    "Fetcher": Fetcher,
    "ArtifactStore": ArtifactStore,
    "LicenceGate": LicenceGate,
    "ParserHost": ParserHost,
    "QuarantineSink": QuarantineSink,
    "RunRecorder": RunRecorder,
    "RunHistoryPort": RunHistoryPort,
    "RecordSink": RecordSink,
    "Clock": Clock,
}

#: Port name -> the ticket that implements it (sub-PRD D1). Named in every `PortNotWiredError`, so
#: an operator or a Builder reading a failure knows exactly which ticket is missing.
PORT_IMPLEMENTORS: Mapping[str, str] = {
    "Fetcher": "INGF-02",
    "ArtifactStore": "INGF-03",
    "LicenceGate": "INGF-04",
    "ParserHost": "INGF-06",
    "QuarantineSink": "INGF-05",
    "RunRecorder": "INGF-05",
    "RunHistoryPort": "INGF-05",
    "RecordSink": "INGF-05",
    "Clock": "INGF-05",
}


class PortNotWiredError(RuntimeError):
    """A port was used that no composition root wired (deliverable 6)."""


class NotWiredPort:
    """A stand-in for an unwired port: every call RAISES, never a silent no-op.

    A no-op port would let an adapter believe it had fetched, stored or quarantined something —
    the exact failure mode PRD §40.7's responsibility split exists to prevent. Construct with a port
    name from `PORTS`; an unknown name is a `KeyError` at construction, not at first use.
    """

    __slots__ = ("_port", "_ticket")

    def __init__(self, port: str) -> None:
        if port not in PORT_IMPLEMENTORS:
            raise KeyError(f"unknown port {port!r}; known ports: {sorted(PORT_IMPLEMENTORS)}")
        object.__setattr__(self, "_port", port)
        object.__setattr__(self, "_ticket", PORT_IMPLEMENTORS[port])

    @property
    def port(self) -> str:
        """The port this stand-in replaces."""
        return self._port

    def __repr__(self) -> str:
        return f"NotWiredPort({self._port!r}, implemented_by={self._ticket!r})"

    def __getattr__(self, name: str):
        # Dunder probes (copy, pickle, dataclasses, inspect) must get a real AttributeError rather
        # than a raising callable, or an unrelated library silently misbehaves.
        if name.startswith("__"):
            raise AttributeError(name)
        port = object.__getattribute__(self, "_port")
        ticket = object.__getattribute__(self, "_ticket")

        def _raise(*args: object, **kwargs: object):
            raise PortNotWiredError(
                f"port {port}.{name}() is not wired; implemented by {ticket}"
            )

        _raise.__name__ = name
        return _raise
