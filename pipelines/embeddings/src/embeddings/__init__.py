"""The offline embedding build pipeline (CRPS-05).

Takes the chunks eligible for dense indexing (CRPS-04's predicate), embeds them with an explicitly
pinned profile, writes PRD §18.4's `vectors.usearch` plus `chunk_embedding` rows, and emits an
`embedding-manifest.json` that pins the profile, the model artefact, the tokenizer artefact, the
model licence and the runtime exactly enough to reproduce the run and to let a reader decide
compatibility.

This pipeline is OFFLINE WORK AND NEVER PRODUCTION WORK. PRD §19.1: "Production MUST NOT compile
application code, build large indexes or generate mass embeddings."

IMPORT CONVENTION. Modules under `pipelines/embeddings/src/` are a top-level PACKAGE named
`embeddings`, mirroring `pipelines/corpus-builder/src/{contracts,chunking,tiering,manifest}`. The
member directory name contains a hyphen, so consumers prepend `pipelines/embeddings/src` to
`sys.path`. Two hard reasons the files are not top-level modules in `src/` as the ticket's
deliverable paths literally read: `profile` is a stdlib module name and `build` a well-known PyPI
name, and shadowing either process-wide from a `sys.path[0]` entry would be a trap; and
`tools/workspace-assertions.mjs` allows the uv member exactly one immediate child directory holding
an `__init__.py`, which is `taxrag_pipeline_embeddings/`. Recorded as a ticket-wording writeback.

INSIDE this package, always use explicit relative imports. An absolute `import manifest` from here
resolves to CORPUS-BUILDER's `manifest` — which is sometimes exactly what is wanted (see
`_bootstrap`) and would be a baffling bug when it is not. That is also why the manifest-emitting
module here is called `emit`, never `manifest`.

CRPS-06 consumes this package through this module and nothing else.
"""

from __future__ import annotations

from .build import build_embeddings, vector_key_for
from .emit import (
    MANIFEST_FILENAME,
    VECTOR_FILENAME,
    build_embedding_manifest,
    write_embedding_manifest,
)
from .errors import (
    ArtefactPinMismatch,
    ChunkTextMismatch,
    EmbeddingError,
    IneligibleTierRequested,
    MissingRuntimePin,
    ModelArtefactMismatch,
    ProfileMismatch,
    ProviderUnavailable,
    RuntimeMismatch,
    TokenizerArtefactMismatch,
    UntieredChunk,
    VectorBackendUnavailable,
)
from .guard import assert_profile_compatible
from .memory import PeakMemory, peak_rss
from .persist import CHUNK_EMBEDDING_COLUMNS
from .profile import (
    EMBEDDING_BUILD_VERSION,
    EmbeddingProfile,
    LicencePin,
    ModelArtefactPin,
    PinnedProfile,
    fingerprint_of_manifest,
    load_runtime_pin,
    profile_fingerprint,
    resolve_effective_profile,
    runtime_pin_from_dict,
)
from .provider import (
    DeterministicStubProvider,
    EmbeddingProvider,
    LocalModelProvider,
    ProviderInfo,
    VectorBatch,
)
from .report import REPORT_FILENAME, EmbeddingBuildResult, write_build_report
from .selection import SelectedChunk, resolve_requested_tiers, select_chunks
from .vectors import UsearchIndexWriter, VectorFileStat, VectorIndexWriter

__all__ = [
    "ArtefactPinMismatch",
    "CHUNK_EMBEDDING_COLUMNS",
    "ChunkTextMismatch",
    "DeterministicStubProvider",
    "EMBEDDING_BUILD_VERSION",
    "EmbeddingBuildResult",
    "EmbeddingError",
    "EmbeddingProfile",
    "EmbeddingProvider",
    "IneligibleTierRequested",
    "LicencePin",
    "LocalModelProvider",
    "MANIFEST_FILENAME",
    "MissingRuntimePin",
    "ModelArtefactMismatch",
    "ModelArtefactPin",
    "PeakMemory",
    "PinnedProfile",
    "ProfileMismatch",
    "ProviderInfo",
    "ProviderUnavailable",
    "REPORT_FILENAME",
    "RuntimeMismatch",
    "SelectedChunk",
    "TokenizerArtefactMismatch",
    "UntieredChunk",
    "UsearchIndexWriter",
    "VECTOR_FILENAME",
    "VectorBackendUnavailable",
    "VectorBatch",
    "VectorFileStat",
    "VectorIndexWriter",
    "assert_profile_compatible",
    "build_embedding_manifest",
    "build_embeddings",
    "fingerprint_of_manifest",
    "load_runtime_pin",
    "peak_rss",
    "profile_fingerprint",
    "resolve_effective_profile",
    "resolve_requested_tiers",
    "runtime_pin_from_dict",
    "select_chunks",
    "vector_key_for",
    "write_build_report",
    "write_embedding_manifest",
]
