"""`SourceAdapter` — the eight PRD §40.7 boundaries, and nothing else (deliverable 4).

PRD §40.7 fixes the interface literally. The Python names are the snake_case form of the PRD names;
the mapping is 1:1 and is the table below. A test parses this table, so it is machine-checked
documentation, not prose.

| PRD §40.7 | Python |
|---|---|
| `discover(cursor, since)` | `discover(self, ctx, cursor, since) -> Iterable[RemoteDescriptor]` |
| `fetch(descriptor, validators)` | `fetch(self, ctx, descriptor, validators) -> ArtifactRef` |
| `identify(artifact)` | `identify(self, ctx, artifact) -> StableDocumentIdentity` |
| `parse(artifact)` | `parse(self, ctx, artifact) -> ParsedDocument` |
| `normalise(parsed)` | `normalise(self, ctx, parsed, identity) -> NormalisedDocument` |
| `extractEvents(normalised)` | `extract_events(self, ctx, normalised) -> Sequence[LegalEventRecord]` |
| `extractRelations(normalised)` | `extract_relations(self, ctx, normalised) -> Sequence[NodeRelationRecord]` |
| `validate(candidate, priorState)` | `validate(self, ctx, candidate, prior) -> ValidationFindings` |

Every method takes `ctx: AdapterRunContext` first — that is the ONLY channel through which an
adapter reaches the network, the filesystem or any store (PRD §40.7's responsibility split).

A ninth boundary is a PRD change, not a ticket-local addition (INGF-01 "Feedback obligation" item 5).
"""

from __future__ import annotations

from typing import Iterable, Protocol, Sequence, runtime_checkable

from .context import AdapterRunContext
from .records import LegalEventRecord, NodeRelationRecord
from .types import (
    AdapterMeta,
    ArtifactRef,
    DiscoveryCursor,
    FetchValidators,
    NormalisedDocument,
    ParsedDocument,
    PriorState,
    RemoteDescriptor,
    StableDocumentIdentity,
    ValidationFindings,
)

__all__ = ["SourceAdapter"]


@runtime_checkable
class SourceAdapter(Protocol):
    """One source group's adapter (PRD §40.7). Exactly eight methods, plus `meta`.

    `isinstance(x, SourceAdapter)` checks MEMBER PRESENCE ONLY — the eight methods plus a `meta`
    attribute. `typing.runtime_checkable` cannot see signatures, so a method with the wrong arity
    still passes, and `meta` is only checked for existence, not for being an `AdapterMeta`.
    Signature and type conformance is `INGF-09`'s conformance kit, deliberately not duplicated in
    `loading.load_adapter()`.
    """

    #: Static identity of this adapter (deliverable 5). Annotation only — declaring it as a class
    #: attribute would put it in `vars()` and widen the protocol's public surface.
    meta: AdapterMeta

    def discover(
        self,
        ctx: AdapterRunContext,
        cursor: DiscoveryCursor | None,
        since: str | None,
    ) -> Iterable[RemoteDescriptor]:
        """PRD §40.7 `discover(cursor, since)`. `since` is UTC ISO-8601 text (PRD §35.1)."""
        ...

    def fetch(
        self,
        ctx: AdapterRunContext,
        descriptor: RemoteDescriptor,
        validators: FetchValidators,
    ) -> ArtifactRef:
        """PRD §40.7 `fetch(descriptor, validators)`. Goes through `ctx.fetcher` (PRD §37.4)."""
        ...

    def identify(self, ctx: AdapterRunContext, artifact: ArtifactRef) -> StableDocumentIdentity:
        """PRD §40.7 `identify(artifact)` — the identity a document keeps across versions (§35.2)."""
        ...

    def parse(self, ctx: AdapterRunContext, artifact: ArtifactRef) -> ParsedDocument:
        """PRD §40.7 `parse(artifact)`. Runs through `ctx.parser`, never in-process (PRD §37.4)."""
        ...

    def normalise(
        self,
        ctx: AdapterRunContext,
        parsed: ParsedDocument,
        identity: StableDocumentIdentity,
    ) -> NormalisedDocument:
        """PRD §40.7 `normalise(parsed)` → `DocumentVersion + NodeVersions` (PRD §35.2)."""
        ...

    def extract_events(
        self,
        ctx: AdapterRunContext,
        normalised: NormalisedDocument,
    ) -> Sequence[LegalEventRecord]:
        """PRD §40.7 `extractEvents(normalised)` → `LegalEvents` (PRD §35.2)."""
        ...

    def extract_relations(
        self,
        ctx: AdapterRunContext,
        normalised: NormalisedDocument,
    ) -> Sequence[NodeRelationRecord]:
        """PRD §40.7 `extractRelations(normalised)` → `NodeRelations` (PRD §35.2)."""
        ...

    def validate(
        self,
        ctx: AdapterRunContext,
        candidate: NormalisedDocument,
        prior: PriorState,
    ) -> ValidationFindings:
        """PRD §40.7 `validate(candidate, priorState)` → `ValidationFindings` (PRD §12.2)."""
        ...
