"""`BuildRequest` — every input a candidate release build takes (CRPS-06 deliverable 1).

NOTHING HERE IS INFERRED, and that is the whole point of the module. Breakdown plan §8 **Q11**
(confirmed) makes the model, tokenizer and runtime pins values the release process SUPPLIES. So this
module — and everything else under `src/build/**` and `src/validation/**` — reads no environment
variable, no `importlib.metadata`, no lockfile, no `Cargo.toml`, and imports nothing from
`services/search-rs`. `tests/build/test_no_environment_inference.py` asserts that mechanically over
both source trees, exactly as `tests/manifest/test_no_environment_inference.py` does for CRPS-02.

`__post_init__` validates SHAPE ONLY. A missing or incomplete pin is deliberately NOT raised here:
the acceptance checklist requires such a build to be a **gate rejection** (exit 2, `REJECTED`, a
dedicated blocking code), not an exception, so the pin preflight lives in `validation/gates.py`.

FIELDS BEYOND THE TICKET'S DELIVERABLE-1 LIST. Five inputs the ticket's field list does not name are
unavoidable for deliverables 2, 8 and 10, and are reported as a ticket-wording writeback:

* `release_id` — deliverable 2's output path is `corpus-release-{release_id}` and the manifest
  records it. It is never invented here, never derived from a clock and never defaulted.
* `embedding_dir` — deliverable 2 must copy CRPS-05's `vectors.usearch` and
  `embedding-manifest.json` from somewhere; a scan of the filesystem would be a guess.
* `parent_corpus_db_path` — deliverable 8's `release_diff(parent_db, …)` and the ±10% count-change
  anomaly need the parent DATABASE, not just its id.
* `public_key_paths` — gate 8 calls `verify_bundle(public_keys=…)`, which needs a trust map.
* `signing_key_path` / `signing_key_id` — deliverable 10's opt-in `--sign`. A path from the caller,
  never `CORPUS_SIGNING_KEYFILE` and never any other environment lookup.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Mapping, Sequence

from manifest import (
    RELEASE_KINDS,
    CompatibilityRanges,
    ModelPin,
    RuntimePin,
    Versions,
)

from validation.anomalies import AnomalyThresholds

__all__ = [
    "BuildRequest",
    "InvalidBuildRequest",
    "load_model_pins",
    "load_runtime_pin",
]


class InvalidBuildRequest(ValueError):
    """The request is malformed in a way no gate can report — a caller defect, not a corpus defect.

    Reserved for SHAPE: an unknown `release_kind`, an inconsistent parent pair, a path that is not a
    path. Corpus content, pins and evaluation state are gate findings, never this.
    """


@dataclass(frozen=True)
class BuildRequest:
    """The complete, explicit description of one candidate release build."""

    # -- inputs ----------------------------------------------------------------------------------
    corpus_db_path: Path
    embedding_dir: Path
    output_dir: Path
    release_id: str

    # -- recorded identity -----------------------------------------------------------------------
    versions: Versions
    compatibility: CompatibilityRanges
    local_model_pins: tuple[ModelPin, ...]
    runtime_pin: RuntimePin | None
    embedding_profile_id: str
    chunk_profile_id: str

    # -- verification ----------------------------------------------------------------------------
    public_key_paths: tuple[Path, ...]

    # -- optional --------------------------------------------------------------------------------
    release_kind: str = "CANDIDATE"
    parent_release_id: str | None = None
    parent_corpus_db_path: Path | None = None
    evaluation_report_path: Path | None = None
    allow_not_run_evaluation: bool = False
    anomaly_thresholds: AnomalyThresholds = field(default_factory=AnomalyThresholds)
    signing_key_path: Path | None = None
    signing_key_id: str | None = None

    def __post_init__(self) -> None:
        if self.release_kind not in RELEASE_KINDS:
            raise InvalidBuildRequest(
                f"release_kind must be one of {RELEASE_KINDS!r}, got {self.release_kind!r}"
            )
        if not self.release_id:
            raise InvalidBuildRequest(
                "release_id is required: it names the output directory and the manifest, and this "
                "module never invents one, derives one from a clock or defaults one"
            )
        for name in (
            "corpus_db_path",
            "embedding_dir",
            "output_dir",
            "parent_corpus_db_path",
            "evaluation_report_path",
            "signing_key_path",
        ):
            value = getattr(self, name)
            if value is not None and not isinstance(value, Path):
                object.__setattr__(self, name, Path(value))
        object.__setattr__(self, "public_key_paths", tuple(Path(p) for p in self.public_key_paths))
        object.__setattr__(self, "local_model_pins", tuple(self.local_model_pins))
        if (self.parent_release_id is None) != (self.parent_corpus_db_path is None):
            raise InvalidBuildRequest(
                "parent_release_id and parent_corpus_db_path must be supplied together or not at "
                "all: a parent id with no database cannot be diffed, and a parent database with no "
                "id cannot be recorded in the manifest"
            )
        if (self.signing_key_path is None) != (self.signing_key_id is None):
            raise InvalidBuildRequest(
                "signing_key_path and signing_key_id must be supplied together"
            )

    @property
    def signing_requested(self) -> bool:
        return self.signing_key_path is not None

    @property
    def bundle_name(self) -> str:
        """PRD §18.4's output directory name — the ONLY place this spelling is constructed."""
        return f"corpus-release-{self.release_id}"

    @property
    def final_dir(self) -> Path:
        return self.output_dir / self.bundle_name

    @property
    def staging_dir(self) -> Path:
        """`output_dir/.staging/<release_id>/`. Keyed by release id, so two concurrent builds of
        different releases into one `output_dir` cannot interleave, and two builds of the SAME
        release collide loudly (a non-empty staging directory is refused)."""
        return self.output_dir / ".staging" / self.release_id

    def pin_for_role(self, role: str) -> ModelPin | None:
        for pin in self.local_model_pins:
            if pin.role == role:
                return pin
        return None


# ==================================================================================================
# Pin loading — from FILES the caller names, never from the machine
# ==================================================================================================


def _load_json(path: Path, what: str) -> Any:
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise InvalidBuildRequest(f"{what} at {path} could not be read: {error}") from error


def load_model_pins(path: Path) -> tuple[ModelPin, ...]:
    """Read a `[ModelPin, …]` JSON array. The pin values are the operator's, from `RETR-07`'s
    recorded compatibility verification and the chosen model artefacts — this function chooses
    nothing and defaults nothing."""
    document = _load_json(path, "the model pin file")
    if isinstance(document, Mapping):
        document = [document]
    if not isinstance(document, Sequence) or isinstance(document, (str, bytes)):
        raise InvalidBuildRequest(
            f"the model pin file at {path} must contain a JSON array of pins (or one pin object)"
        )
    return tuple(ModelPin.from_dict(item) for item in document)


def load_runtime_pin(path: Path) -> RuntimePin:
    """Read one `RuntimePin` JSON object."""
    document = _load_json(path, "the runtime pin file")
    if not isinstance(document, Mapping):
        raise InvalidBuildRequest(f"the runtime pin file at {path} must contain a JSON object")
    return RuntimePin.from_dict(document)
