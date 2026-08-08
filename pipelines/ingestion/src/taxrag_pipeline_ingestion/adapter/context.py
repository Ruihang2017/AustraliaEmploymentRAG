"""`AdapterRunContext` — the single channel between an adapter and the framework (deliverable 7).

PRD §40.7 splits responsibility between the adapter (source knowledge) and the framework (HTTP
safety, hashing, persistence, retry, licensing, metrics, quarantine, run accounting). This context
is that split made concrete: an adapter reaches the network, the filesystem or any store ONLY
through the ports carried here. Every one of the eight PRD §40.7 boundaries takes it as `ctx`.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Self

from .ports import (
    ArtifactStore,
    Clock,
    Fetcher,
    LicenceGate,
    NotWiredPort,
    ParserHost,
    QuarantineSink,
    RecordSink,
    RunHistoryPort,
    RunRecorder,
)
from .types import RunMode

__all__ = ["AdapterRunContext"]

#: The logger name every adapter run logs under, so operator log filters are stable.
LOGGER_NAME = "taxrag_pipeline_ingestion.adapter"


@dataclass(frozen=True, slots=True, kw_only=True)
class AdapterRunContext:
    """Everything one adapter run may reach (PRD §40.7)."""

    run_id: str
    group_id: str
    mode: RunMode
    fetcher: Fetcher
    artifacts: ArtifactStore
    licence: LicenceGate
    parser: ParserHost
    quarantine: QuarantineSink
    records: RecordSink
    runs: RunRecorder
    history: RunHistoryPort
    clock: Clock
    log: logging.Logger

    @classmethod
    def unwired(cls, group_id: str) -> Self:
        """A context whose every port is a `NotWiredPort` (deliverable 6/7).

        The default for unit tests that exercise pure adapter logic: touching any port raises
        `PortNotWiredError` naming the implementing ticket, so a test can never accidentally depend
        on framework behaviour that does not exist yet. Deterministic — no clock, no uuid, hence
        `run_id="unwired"` and `mode=DISCOVERY_ONLY` (the mode that reaches nothing).
        """
        return cls(
            run_id="unwired",
            group_id=group_id,
            mode=RunMode.DISCOVERY_ONLY,
            fetcher=NotWiredPort("Fetcher"),  # type: ignore[arg-type]
            artifacts=NotWiredPort("ArtifactStore"),  # type: ignore[arg-type]
            licence=NotWiredPort("LicenceGate"),  # type: ignore[arg-type]
            parser=NotWiredPort("ParserHost"),  # type: ignore[arg-type]
            quarantine=NotWiredPort("QuarantineSink"),  # type: ignore[arg-type]
            records=NotWiredPort("RecordSink"),  # type: ignore[arg-type]
            runs=NotWiredPort("RunRecorder"),  # type: ignore[arg-type]
            history=NotWiredPort("RunHistoryPort"),  # type: ignore[arg-type]
            clock=NotWiredPort("Clock"),  # type: ignore[arg-type]
            log=logging.getLogger(LOGGER_NAME),
        )
