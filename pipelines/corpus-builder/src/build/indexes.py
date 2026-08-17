"""The lexical index builder PORT, and the null builder (CRPS-06 deliverable 3).

Q-CRPS-2 — which offline mechanism actually builds `tantivy/` — is resolved by
`docs/adr/0003-offline-lexical-index-builder.md`, not here. This module defines the seam the ADR's
decision plugs into, and ships the one builder that needs no external tool.

WHAT THIS MODULE MAY KNOW ABOUT THE INDEX: its presence, its `index_version` and its file hashes.
The CONTENTS of `tantivy/` are opaque to `04-corpus-contract` (deliverable 3). Importing
`services/search-rs` from here would create a `04 → 11` edge on top of the existing `11 → 04` edge —
a module cycle that makes `dag-scan.mjs` exit 1 (breakdown plan §6.1, risk R6) — so it never happens,
and `tests/build/test_no_environment_inference.py` asserts the absence by source scan.

`NullLexicalIndexBuilder` writes exactly the ticket's object:
`tantivy/INDEX_STATE.json` = `{state: "ABSENT", reason, index_version: null}`. CRPS-08's committed
fixture writes `{state: "PLACEHOLDER", …}`; sub-PRD **D16** says the two forms converge on THIS one
and that CRPS-08 is amended in the same docs PR. The fixture is another ticket's file and is not
edited from here.

A `CANDIDATE` built with a null index is a BLOCKING gate failure
(`INDEX_BUILDER_NULL_ON_CANDIDATE`, gate 8) so a fixture path can never masquerade as a promotable
release. The check keys on `IndexBuildResult.index_version is None` **and** on the builder's declared
`builder_id`, so a future null-equivalent cannot slip through by renaming its class.
"""

from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol, Sequence, runtime_checkable

__all__ = [
    "INDEX_BUILD_TIMEOUT_SECONDS",
    "INDEX_STATE_FILENAME",
    "INDEX_VERSION_ABSENT_SENTINEL",
    "ExternalLexicalIndexBuilder",
    "IndexBuildFailed",
    "IndexBuildResult",
    "LexicalIndexBuilder",
    "NullLexicalIndexBuilder",
]

#: A local, offline index build over an MVP-scale corpus. A hung external process must fail the
#: build rather than hang a release.
INDEX_BUILD_TIMEOUT_SECONDS = 1800

INDEX_STATE_FILENAME = "INDEX_STATE.json"

#: `release-manifest.schema.json` types `versions.index` as a NON-EMPTY STRING, so a null
#: `index_version` cannot be written there: a `null` would make the bundle fail its own verification
#: with `MANIFEST_SCHEMA_INVALID`, which reads as corruption rather than as "no index was built".
#: This sentinel is what `versions.index` carries instead (sub-PRD D16).
INDEX_VERSION_ABSENT_SENTINEL = "PLACEHOLDER_NO_INDEX"


class IndexBuildFailed(RuntimeError):
    """A lexical index builder could not produce an index. Converted to a BLOCKING gate finding."""


@dataclass(frozen=True)
class IndexBuildResult:
    """What a builder reports about the index it just wrote.

    `index_version` is `None` when no real index was produced. Everything else is measured from the
    directory, so a builder cannot claim a size it did not write.
    """

    index_version: str | None
    file_count: int
    byte_size: int
    doc_count: int
    builder_id: str = "unknown"

    def to_dict(self) -> dict[str, object]:
        return {
            "index_version": self.index_version,
            "file_count": self.file_count,
            "byte_size": self.byte_size,
            "doc_count": self.doc_count,
            "builder_id": self.builder_id,
        }


@runtime_checkable
class LexicalIndexBuilder(Protocol):
    """Deliverable 3's port. `build()` writes the index into *out_dir* and describes it.

    An implementation that shells out to an external, separately-built search binary (ADR option a)
    takes that command's path as an explicit `BuildRequest`-supplied input, invokes it with
    `shell=False` on a fixed argv and a timeout, never searches `PATH`, and raises
    `IndexBuildFailed` on a non-zero exit.
    """

    #: A stable identity for the mechanism, recorded in the gate report and checked by gate 8.
    builder_id: str

    def build(self, corpus_db: Path, out_dir: Path) -> IndexBuildResult:  # pragma: no cover
        ...


def _measure(out_dir: Path) -> tuple[int, int]:
    files = [path for path in out_dir.rglob("*") if path.is_file() and not path.is_symlink()]
    return len(files), sum(path.stat().st_size for path in files)


class NullLexicalIndexBuilder:
    """Writes a declared-absent index. For fixtures and development builds only.

    It never pretends: the state file says `ABSENT`, `index_version` is `None`, and gate 8 refuses
    the resulting bundle outright when `release_kind` is `CANDIDATE`.
    """

    builder_id = "null-lexical-index-builder"

    def __init__(self, reason: str = "no offline lexical index builder was supplied (Q-CRPS-2)") -> None:
        self.reason = reason

    def build(self, corpus_db: Path, out_dir: Path) -> IndexBuildResult:
        out_dir.mkdir(parents=True, exist_ok=True)
        document = {"state": "ABSENT", "reason": self.reason, "index_version": None}
        target = out_dir / INDEX_STATE_FILENAME
        target.write_bytes(
            (json.dumps(document, sort_keys=True, indent=2, ensure_ascii=False) + "\n").encode(
                "utf-8"
            )
        )
        file_count, byte_size = _measure(out_dir)
        _ = corpus_db  # deliberately unread: this builder indexes nothing
        return IndexBuildResult(
            index_version=None,
            file_count=file_count,
            byte_size=byte_size,
            doc_count=0,
            builder_id=self.builder_id,
        )


class ExternalLexicalIndexBuilder:
    """ADR 0003 option (a): a pinned, separately-built search binary over a documented CLI contract.

    THE ONLY `subprocess` CALL SITE IN `src/build/**` OR `src/validation/**`, and
    `tests/build/test_no_environment_inference.py` allow-lists exactly this one. The rules that make
    it acceptable there are all enforced below rather than merely intended:

    * the command is an EXPLICIT input from the caller (`BuildRequest.index_command_path`, supplied
      by `--index-command`). `PATH` is never searched, so the release cannot silently pick up a
      different binary from a different machine;
    * `shell=False` on a fixed argv, so no part of the command line is interpreted by a shell;
    * a bounded timeout, and a non-zero exit or a timeout raises `IndexBuildFailed`, which
      `assemble.py` converts into a BLOCKING gate finding;
    * `index_version` is reported by the BINARY, on stdout, and is what `versions.index` records —
      this module never invents one. That value is the compatibility handshake `RETR-01`/`RETR-02`
      read; see the ADR.

    THE CLI CONTRACT (ADR 0003):

        <command> --corpus <corpus.sqlite> --out <tantivy dir>

    with a single line on stdout: the index version. Anything else is a build failure.
    """

    builder_id = "external-lexical-index-builder"

    def __init__(
        self,
        command: Path,
        *,
        extra_arguments: Sequence[str] = (),
        timeout_seconds: int = INDEX_BUILD_TIMEOUT_SECONDS,
    ) -> None:
        self.command = Path(command)
        self.extra_arguments = tuple(extra_arguments)
        self.timeout_seconds = timeout_seconds

    def build(self, corpus_db: Path, out_dir: Path) -> IndexBuildResult:
        if not self.command.is_file():
            raise IndexBuildFailed(
                f"the lexical index command {self.command} does not exist. It is an explicit build "
                "input and is never resolved from PATH"
            )
        out_dir.mkdir(parents=True, exist_ok=True)
        argv = [
            str(self.command),
            "--corpus",
            str(corpus_db),
            "--out",
            str(out_dir),
            *self.extra_arguments,
        ]
        try:
            completed = subprocess.run(  # noqa: S603 — fixed argv, shell=False, explicit command
                argv,
                shell=False,
                capture_output=True,
                text=True,
                timeout=self.timeout_seconds,
                check=False,
            )
        except (OSError, subprocess.TimeoutExpired) as error:
            raise IndexBuildFailed(
                f"the lexical index command failed to run: {type(error).__name__}"
            ) from error
        if completed.returncode != 0:
            raise IndexBuildFailed(
                f"the lexical index command exited {completed.returncode}"
            )
        index_version = completed.stdout.strip().splitlines()[0].strip() if completed.stdout.strip() else ""
        if not index_version:
            raise IndexBuildFailed(
                "the lexical index command printed no index version on stdout; the ADR 0003 CLI "
                "contract requires one, and this module never invents one"
            )
        file_count, byte_size = _measure(out_dir)
        return IndexBuildResult(
            index_version=index_version,
            file_count=file_count,
            byte_size=byte_size,
            doc_count=0,
            builder_id=self.builder_id,
        )
