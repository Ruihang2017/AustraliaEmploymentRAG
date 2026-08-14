"""The profile-compatibility guard (CRPS-05 deliverable 6).

PRD §35.3 requires "exact profile compatibility" for `chunk_embedding`; PRD §14.4 requires an
embedding change to use a DUAL INDEX — "two profiles mean two indexes, never one mixed index". So
this module refuses, rather than tolerates, four distinct situations:

    a different profile fingerprint      -> ProfileMismatch
    a different model artefact hash      -> ModelArtefactMismatch
    a different tokenizer artefact hash  -> TokenizerArtefactMismatch
    a different runtime pin              -> RuntimeMismatch

Four TYPES, not four messages: acceptance item 8 says "each with a distinct error", and a caller
that must tell "you changed the model" from "you changed the tokenizer export" cannot do that by
matching strings.

The comparison is against the manifest of the index being written into, plus the `profile_id`s
already present in `chunk_embedding`. The fingerprint is RECOMPUTED from the manifest rather than
read out of it, because `embedding-manifest.schema.json` is `additionalProperties: false` and has no
member to store one in (see `emit.py`).
"""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any

from .errors import (
    ModelArtefactMismatch,
    ProfileMismatch,
    RuntimeMismatch,
    TokenizerArtefactMismatch,
)
from .persist import profiles_present
from .profile import EmbeddingProfile, fingerprint_of_manifest, profile_fingerprint

__all__ = ["assert_no_foreign_profiles", "assert_profile_compatible"]


def assert_no_foreign_profiles(connection: sqlite3.Connection, profile_id: str) -> None:
    """Refuse a `chunk_embedding` table that already holds rows for a DIFFERENT `profile_id`.

    Split out of `assert_profile_compatible` because `build.py` runs it TWICE: once up front, and
    once more inside the `BEGIN IMMEDIATE` transaction it holds across publication. The up-front
    call alone is a check-then-act: another build could commit its own profile's rows in the
    interval and both would publish, producing exactly the mixed index PRD §14.4 forbids. The second
    call happens under SQLite's RESERVED lock, so the two builds are serialised and the loser fails
    before it can publish rather than after.
    """
    present = profiles_present(connection)
    foreign = sorted(present - {profile_id})
    if foreign:
        raise ProfileMismatch(
            f"chunk_embedding already holds rows for profile_id(s) {foreign}, and this build "
            f"writes profile_id={profile_id!r}. PRD §14.4: an embedding change requires a "
            "dual index with pointer rollback, not a mixed one."
        )


def assert_profile_compatible(
    connection: sqlite3.Connection,
    profile: EmbeddingProfile,
    *,
    manifest_path: Path | None = None,
    model_artefact_sha256: str | None = None,
    tokenizer_artifact_sha256: str | None = None,
    runtime: Any | None = None,
) -> None:
    """Refuse to add vectors to an index built with a different profile, artefact or runtime.

    The ticket's two positional arguments stay literal; everything else is keyword-only so that a
    call site cannot silently reorder the four things being compared.

    *profile* must be the EFFECTIVE profile, so that a stub run is compared as the stub it is.
    """
    # (a) An existing index whose manifest describes a different build.
    if manifest_path is not None and manifest_path.is_file():
        document = json.loads(manifest_path.read_text(encoding="utf-8"))

        existing_fingerprint = fingerprint_of_manifest(document)
        if existing_fingerprint != profile_fingerprint(profile):
            raise ProfileMismatch(
                f"{manifest_path} describes an index built with profile fingerprint "
                f"{existing_fingerprint}, but this build's profile fingerprints as "
                f"{profile_fingerprint(profile)} (profile_id={profile.profile_id!r}, "
                f"model_id={profile.model_id!r}). PRD §14.4 requires an embedding change to build "
                "a SECOND index, never to mix two profiles in one."
            )

        existing_model = (document.get("model_artifact") or {}).get("sha256")
        if model_artefact_sha256 is not None and existing_model != model_artefact_sha256:
            raise ModelArtefactMismatch(
                f"{manifest_path} records model_artifact.sha256={existing_model}, but this build "
                f"loaded {model_artefact_sha256}. The representation members agree, so this is a "
                "differently exported artefact rather than a different profile (breakdown plan §8 "
                "Q11) — it still cannot share one index."
            )

        existing_tokenizer = (document.get("tokenizer") or {}).get("artifact_sha256")
        if tokenizer_artifact_sha256 is not None and existing_tokenizer != tokenizer_artifact_sha256:
            raise TokenizerArtefactMismatch(
                f"{manifest_path} records tokenizer.artifact_sha256={existing_tokenizer}, but this "
                f"build used {tokenizer_artifact_sha256}. Q11 pins a local tokenizer.json by the "
                "release; a different one produces different token boundaries and different vectors."
            )

        existing_runtime = document.get("runtime")
        if runtime is not None and existing_runtime != runtime.to_dict():
            raise RuntimeMismatch(
                f"{manifest_path} records runtime={existing_runtime}, but this build was given "
                f"{runtime.to_dict()}. Mixing two runtimes in one vectors.usearch is blocking "
                "(deliverable 6); RETR-07 verifies the recorded runtime before first use."
            )

    # (b) Rows for another profile already in this corpus database. Re-checked under the
    # publication lock by `build.py`; see `assert_no_foreign_profiles`.
    assert_no_foreign_profiles(connection, profile.profile_id)
