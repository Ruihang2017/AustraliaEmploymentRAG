"""The ingestion framework's adapter contract (INGF-01; PRD §40.7, §40.8).

One import path for all 52 source adapters in modules `06`–`10`:

    from taxrag_pipeline_ingestion.adapter import SourceAdapter, AdapterMeta, AdapterRunContext

What is here: the eight-boundary `SourceAdapter` protocol (`protocol`), the ingestion-side value
types those boundaries consume and produce (`types`), the `CRPS-01` record types re-exported by
identity (`records`), the nine framework ports (`ports`), the run context (`context`), the versioned
intermediate-record envelope (`envelope`), the directory-convention loader (`loading`) and the
area-local failure-code registry (`failures`).

`RemoteDescriptor` and `ValidationFinding` exported here are the INGESTION-SIDE types (deliverable
3). `CRPS-01` publishes different types of the same names; those stay reachable only through
`taxrag_pipeline_ingestion.adapter.records` under their `*Record` alias names, and the two must
never be pulled into one namespace.
"""

from __future__ import annotations

from .context import AdapterRunContext
from .envelope import (
    PAYLOAD_TYPES,
    EnvelopeError,
    IntermediateRecordEnvelope,
    RecordType,
    envelope_from_json,
)
from .failures import (
    DuplicateFailureCodeError,
    FailureCode,
    InvalidFailureCodeError,
    RegisteredCode,
    failure_code_registry,
    register_failure_codes,
)
from .loading import AdapterLoadError, iter_adapter_dirs, load_adapter
from .ports import (
    PORT_IMPLEMENTORS,
    PORTS,
    ArtifactStore,
    Clock,
    Fetcher,
    LicenceGate,
    NotWiredPort,
    ParserHost,
    PortNotWiredError,
    QuarantineSink,
    RecordSink,
    RunHandle,
    RunHistoryPort,
    RunRecorder,
)
from .protocol import SourceAdapter
from .records import (
    DocumentVersionRecord,
    LegalEventRecord,
    NodeRelationRecord,
    NodeVersionRecord,
    SourceArtifactRecord,
)
from .types import (
    AdapterMeta,
    AdapterMetaError,
    ArtifactRef,
    DiscoveryCursor,
    DiscoveryFinding,
    FetchRequest,
    FetchResult,
    FetchValidators,
    IntendedUse,
    LicenceDecision,
    NormalisedDocument,
    ParsedBlock,
    ParsedDocument,
    ParseOutcome,
    ParserLimits,
    PriorState,
    RemoteDescriptor,
    RunMode,
    RunSummary,
    StableDocumentIdentity,
    ValidationFinding,
    ValidationFindings,
)

__all__ = [
    "PAYLOAD_TYPES",
    "PORTS",
    "PORT_IMPLEMENTORS",
    "AdapterLoadError",
    "AdapterMeta",
    "AdapterMetaError",
    "AdapterRunContext",
    "ArtifactRef",
    "ArtifactStore",
    "Clock",
    "DiscoveryCursor",
    "DiscoveryFinding",
    "DocumentVersionRecord",
    "DuplicateFailureCodeError",
    "EnvelopeError",
    "FailureCode",
    "FetchRequest",
    "FetchResult",
    "FetchValidators",
    "Fetcher",
    "IntendedUse",
    "IntermediateRecordEnvelope",
    "InvalidFailureCodeError",
    "LegalEventRecord",
    "LicenceDecision",
    "LicenceGate",
    "NodeRelationRecord",
    "NodeVersionRecord",
    "NormalisedDocument",
    "NotWiredPort",
    "ParseOutcome",
    "ParsedBlock",
    "ParsedDocument",
    "ParserHost",
    "ParserLimits",
    "PortNotWiredError",
    "PriorState",
    "QuarantineSink",
    "RecordSink",
    "RecordType",
    "RegisteredCode",
    "RemoteDescriptor",
    "RunHandle",
    "RunHistoryPort",
    "RunMode",
    "RunRecorder",
    "RunSummary",
    "SourceAdapter",
    "SourceArtifactRecord",
    "StableDocumentIdentity",
    "ValidationFinding",
    "ValidationFindings",
    "envelope_from_json",
    "failure_code_registry",
    "iter_adapter_dirs",
    "load_adapter",
    "register_failure_codes",
]
