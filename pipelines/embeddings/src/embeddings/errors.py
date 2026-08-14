"""Every blocking condition this pipeline can reach, as a distinct type (CRPS-05).

Two ticket acceptance items rest on this module rather than on messages:

* "A missing or incomplete `RuntimePin` fails the build with a typed error naming the field."
* "`assert_profile_compatible()` blocks a second profile, a different model artefact, a different
  tokenizer artefact or a different runtime writing into an existing index, EACH WITH A DISTINCT
  ERROR."

So the four guard failures are four types, not one type with four messages: a caller that must
distinguish "you changed the model" from "you changed the tokenizer export" cannot do it by string
matching, and PRD §14.4's dual-index rule is exactly a caller that must.

Nothing here defaults, infers or downgrades. There is deliberately no `EmbeddingWarning`.
"""

from __future__ import annotations

__all__ = [
    "ArtefactPinMismatch",
    "ChunkTextMismatch",
    "EmbeddingError",
    "IneligibleTierRequested",
    "MissingRuntimePin",
    "ModelArtefactMismatch",
    "ProfileMismatch",
    "ProviderUnavailable",
    "RuntimeMismatch",
    "TokenizerArtefactMismatch",
    "UntieredChunk",
    "VectorBackendUnavailable",
]


class EmbeddingError(Exception):
    """Base class for every blocking condition in the embedding build.

    `cli.py` catches exactly this and exits non-zero; anything else escaping is a defect in this
    package rather than a build outcome.
    """


class MissingRuntimePin(EmbeddingError):
    """The runtime pin is absent, or one of its members is missing or empty.

    Breakdown plan §8 Q11: the runtime is a build INPUT, supplied by the caller (ultimately
    CRPS-06's `BuildRequest`, sourced from RETR-07's recorded compatibility verification). It is
    never read from an installed package, a lockfile or the environment, and never defaulted. The
    message names the offending field so the operator can fix the input file rather than guess.
    """


class ArtefactPinMismatch(EmbeddingError):
    """A loaded artefact's hash disagrees with the pin declared for it.

    Raised BEFORE anything is loaded into a model runtime: an artefact that is not the pinned one
    must never produce a vector, because the vectors would be silently incompatible with what the
    manifest claims (breakdown plan §8 Q11 "immutable revision identifier, hash").
    """


class ProfileMismatch(EmbeddingError):
    """An existing index was built with a different embedding profile (deliverable 6).

    PRD §14.4: "Embedding changes require a dual index" — two profiles mean two indexes, never one
    mixed index.
    """


class ModelArtefactMismatch(EmbeddingError):
    """An existing index was built from a different model artefact (deliverable 6)."""


class TokenizerArtefactMismatch(EmbeddingError):
    """An existing index was built with a different `tokenizer.json` (deliverable 6)."""


class RuntimeMismatch(EmbeddingError):
    """An existing index was built with a different runtime pin (deliverable 6)."""


class UntieredChunk(EmbeddingError):
    """A selected `search_chunk` has `index_tier IS NULL`.

    The column is NULLABLE on purpose (CRPS-01 creates it, CRPS-04 fills it), so NULL means "the
    tiering pass has not run for this chunk" — not "ineligible". Failing closed is the only safe
    reading: treating it as ineligible would silently under-embed a release with no signal, and
    treating it as eligible would embed material the licence assessment may forbid.
    """


class IneligibleTierRequested(EmbeddingError):
    """`--tiers` named a tier for which `tiering.is_eligible_for_dense()` is false.

    Refusing here is what makes Tier 3, `EXCLUDED_LICENSING` and `QUARANTINED_QUALITY` unreachable
    by explicit request as well as by default (PRD §17.2).
    """


class ChunkTextMismatch(EmbeddingError):
    """The text reconstructed from the node version's offsets does not hash to `text_hash`.

    `search_chunk` stores offsets, not text. If the slice disagrees with the recorded hash, the
    chunker and this pipeline disagree about offsets or normalisation, and embedding it anyway
    would put plausible but wrong vectors into a signed release, invisibly. Also raised when the
    referenced `node_version` row is absent.
    """


class VectorBackendUnavailable(EmbeddingError):
    """`usearch` / `numpy` could not be imported, so no vector file can be written.

    Not a code defect and not an architecture question: the packages are declared in this member's
    `pyproject.toml` and present in the root `uv.lock`, but the root project is a virtual project
    with empty `dependencies` and nothing depends on this member, so `uv sync` installs neither.
    The fix lives in the root `pyproject.toml` / CI workflow, which are FND-01/FND-02's file-scope
    and not this ticket's.
    """


class ProviderUnavailable(EmbeddingError):
    """The requested provider cannot run.

    NEVER a trigger for falling back to `DeterministicStubProvider`. A silent stub fallback would
    put unusable vectors into a signed release, which is the worst failure available in this
    pipeline; the provider is an explicit, defaultless choice made by the caller.
    """
