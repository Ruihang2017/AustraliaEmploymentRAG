"""The one definition of "the golden build", shared by the test and by `regenerate.py`.

A uniquely named module for the usual reason (see `conftest.py`), and a separate one from
`embedding_fixtures` because `regenerate.py` runs OUTSIDE pytest and must not import a module full
of `@pytest.fixture` declarations.

If the test and the regenerator built the manifest differently, the golden would encode the
regenerator's behaviour rather than the pipeline's, and the comparison would be theatre.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from embedding_fixtures import (
    MODEL_ARTEFACT_BYTES,
    RUNTIME_PIN_DOCUMENT,
    TOKENIZER_ARTEFACT_BYTES,
    RecordingWriter,
    build_corpus,
    make_profile,
)
from embeddings.build import build_embeddings
from embeddings.emit import MANIFEST_FILENAME
from embeddings.profile import (
    LicencePin,
    ModelArtefactPin,
    PinnedProfile,
    runtime_pin_from_dict,
)
from embeddings.provider import DeterministicStubProvider

#: Members whose value cannot be pinned across platforms or across the backend-availability guard.
#: See `fixtures/golden/README.md`. Everything else is compared exactly.
NORMALISED = {
    "built_at": "<normalised>",
    "vector_file.sha256": "<normalised>",
    "vector_file.byte_size": -1,
}


def golden_pinned_profile() -> PinnedProfile:
    """Literal pins, not the pytest fixtures — this runs outside pytest too."""
    import hashlib

    return PinnedProfile(
        profile=make_profile(),
        model_artifact=ModelArtefactPin(
            sha256=hashlib.sha256(MODEL_ARTEFACT_BYTES).hexdigest(),
            byte_size=len(MODEL_ARTEFACT_BYTES),
            format="onnx",
        ),
        licence=LicencePin(
            identifier="CC-BY-4.0",
            url="https://creativecommons.org/licenses/by/4.0/",
            attribution_required=True,
            redistribution_permitted=True,
            notes="Fixture licence. PRD §11.1's conservative default applies to weights as to sources.",
        ),
        tokenizer_artifact_sha256=hashlib.sha256(TOKENIZER_ARTEFACT_BYTES).hexdigest(),
    )


def normalise(document: dict[str, Any]) -> dict[str, Any]:
    result = json.loads(json.dumps(document))
    for pointer, placeholder in NORMALISED.items():
        parts = pointer.split(".")
        target = result
        for part in parts[:-1]:
            target = target[part]
        target[parts[-1]] = placeholder
    return result


def golden_document(work: Path) -> dict[str, Any]:
    """Run the end-to-end stub build over the committed corpus fixture and normalise the result."""
    corpus = build_corpus(work / "corpus" / "corpus.sqlite")
    pinned = golden_pinned_profile()
    out = work / "out"
    build_embeddings(
        corpus.path,
        pinned,
        DeterministicStubProvider(seed=pinned.profile.seed, dimensions=pinned.profile.dimensions),
        runtime_pin_from_dict(dict(RUNTIME_PIN_DOCUMENT)),
        out,
        writer=RecordingWriter(),
    )
    return normalise(json.loads((out / MANIFEST_FILENAME).read_text(encoding="utf-8")))
