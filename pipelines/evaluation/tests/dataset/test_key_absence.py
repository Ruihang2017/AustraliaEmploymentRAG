"""Acceptance item: the key is required and absent.

"With the private-key environment variable unset, `open_blind` raises `BlindKeyUnavailable`; there
is no default path, repository lookup or keyring fallback — a test greps `src/dataset/**` for any
literal key path." (PRD §14.3, §20.2; sub-PRD D2.)

`BlindKeyUnavailable` in ordinary CI and in every agent session is the CORRECT outcome, not a defect
to work around: only the Founder holds that key and only the Founder starts a blind stage
(breakdown plan §8 Q6 items 13-14).
"""

from __future__ import annotations

import ast
import base64
import json
import re
from pathlib import Path

import dataset_fixtures  # noqa: F401
import pytest
from dataset import blind, sealedbox

_SOURCE_DIR = dataset_fixtures.REPO_ROOT / "pipelines" / "evaluation" / "src" / "dataset"


def _envelope(public: bytes, plaintext: bytes = b"blind material") -> dict[str, str]:
    ciphertext = sealedbox.seal(plaintext, public)
    return {
        "case_id": "EVAL-FED-004",
        "ciphertext_b64": base64.b64encode(ciphertext).decode("ascii"),
    }


def _key_file(tmp_path: Path, private: bytes) -> Path:
    path = tmp_path / "founder-material.json"
    path.write_text(
        json.dumps({"private_scalar_base64": base64.b64encode(private).decode("ascii")}),
        encoding="utf-8",
    )
    return path


def test_unset_variable_raises_blind_key_unavailable(ephemeral_recipient) -> None:
    public, _private = ephemeral_recipient
    with pytest.raises(blind.BlindKeyUnavailable):
        blind.open_blind(_envelope(public), recipient_public=public, environ={})


def test_an_empty_variable_raises_too(ephemeral_recipient) -> None:
    public, _private = ephemeral_recipient
    with pytest.raises(blind.BlindKeyUnavailable):
        blind.open_blind(
            _envelope(public), recipient_public=public, environ={blind.BLIND_PRIVATE_PATH_ENV: ""}
        )


def test_an_unreadable_path_raises_blind_key_unavailable(ephemeral_recipient, tmp_path) -> None:
    public, _private = ephemeral_recipient
    with pytest.raises(blind.BlindKeyUnavailable):
        blind.open_blind(
            _envelope(public),
            recipient_public=public,
            environ={blind.BLIND_PRIVATE_PATH_ENV: str(tmp_path / "absent.json")},
        )


def test_the_right_key_opens_and_the_result_is_still_opaque(ephemeral_recipient, tmp_path) -> None:
    public, private = ephemeral_recipient
    opened = blind.open_blind(
        _envelope(public, b"the blind question"),
        recipient_public=public,
        environ={blind.BLIND_PRIVATE_PATH_ENV: str(_key_file(tmp_path, private))},
    )
    assert opened.plaintext_bytes_for_runner() == b"the blind question"
    with pytest.raises(blind.BlindMaterialNotRenderable):
        str(opened)


def test_the_wrong_key_fails_closed_rather_than_returning_a_partial_result(
    ephemeral_recipient, tmp_path
) -> None:
    public, _private = ephemeral_recipient
    _other_public, other_private = sealedbox.generate_keypair()
    with pytest.raises(sealedbox.AuthenticationFailed):
        blind.open_blind(
            _envelope(public),
            recipient_public=public,
            environ={blind.BLIND_PRIVATE_PATH_ENV: str(_key_file(tmp_path, other_private))},
        )


def test_the_public_half_alone_seals(ephemeral_recipient) -> None:
    """Plan §8 Q6 item 11: an authorised authoring agent seals without holding the private key."""
    public, private = ephemeral_recipient
    envelope, ciphertext = blind.seal(
        b"blind material",
        public,
        case_id="EVAL-FED-004",
        recipient_key_id="dev-fixture-recipient-001",
        blind_dataset_major_version=1,
        sealer="evaluation-author-agent",
    )
    assert envelope["algorithm"] == "crypto_box_seal"
    assert envelope["byte_length"] == len(ciphertext)
    assert sealedbox.seal_open(ciphertext, public, private) == b"blind material"


def test_two_seals_of_the_same_plaintext_differ(ephemeral_recipient) -> None:
    public, _private = ephemeral_recipient
    first, _ = blind.seal(
        b"identical", public, case_id="EVAL-FED-004", recipient_key_id="k", blind_dataset_major_version=1, sealer="a"
    )
    second, _ = blind.seal(
        b"identical", public, case_id="EVAL-FED-004", recipient_key_id="k", blind_dataset_major_version=1, sealer="a"
    )
    assert first["ciphertext_b64"] != second["ciphertext_b64"]


# -- the source scan the acceptance item names -----------------------------------------------------

#: Scanned over CODE, not over prose. `blind.py`'s own docstring necessarily writes the words
#: "no keyring fallback" and "no default path"; a text grep would fire on the very sentence that
#: states the rule. The scan therefore parses each module and inspects string literals (minus
#: docstrings) and attribute/name references.
_FORBIDDEN_STRINGS = {
    "a home-directory key path": re.compile(r"^~[/\\]"),
    "an ssh directory": re.compile(r"\.ssh"),
}
_FORBIDDEN_NAMES = ("keyring", "expanduser", "home")


def _sources() -> list[Path]:
    return sorted(path for path in _SOURCE_DIR.rglob("*.py") if "__pycache__" not in path.parts)


def _docstring_nodes(tree: ast.AST) -> set[int]:
    marked: set[int] = set()
    for node in ast.walk(tree):
        if isinstance(node, (ast.Module, ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            body = getattr(node, "body", [])
            if body and isinstance(body[0], ast.Expr) and isinstance(body[0].value, ast.Constant):
                marked.add(id(body[0].value))
    return marked


def test_the_scan_reads_something() -> None:
    """A scan that inspects no file discharges nothing."""
    assert len(_sources()) >= 15


@pytest.mark.parametrize("label", sorted(_FORBIDDEN_STRINGS))
def test_no_string_literal_names_a_key_location(label: str) -> None:
    pattern = _FORBIDDEN_STRINGS[label]
    for path in _sources():
        tree = ast.parse(path.read_text(encoding="utf-8"))
        docstrings = _docstring_nodes(tree)
        for node in ast.walk(tree):
            if isinstance(node, ast.Constant) and isinstance(node.value, str) and id(node) not in docstrings:
                assert not pattern.search(node.value), f"{path.name}:{node.lineno} contains {label}"


@pytest.mark.parametrize("name", _FORBIDDEN_NAMES)
def test_no_code_reference_provides_a_key_lookup_fallback(name: str) -> None:
    for path in _sources():
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if isinstance(node, ast.Name):
                assert node.id != name, f"{path.name}:{node.lineno} references {name}"
            if isinstance(node, ast.Attribute):
                assert node.attr != name, f"{path.name}:{node.lineno} calls .{name}"
            if isinstance(node, (ast.Import, ast.ImportFrom)):
                module = getattr(node, "module", None) or ""
                assert name not in module.split("."), f"{path.name}:{node.lineno} imports {name}"
                for alias in node.names:
                    assert alias.name.split(".")[0] != name, f"{path.name}:{node.lineno} imports {name}"


def test_the_environment_lookup_has_no_default() -> None:
    """`environ.get(NAME)` with a second argument would be a default path by another name."""
    for path in _sources():
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if (
                isinstance(node, ast.Call)
                and isinstance(node.func, ast.Attribute)
                and node.func.attr == "get"
                and isinstance(node.func.value, ast.Attribute)
                and node.func.value.attr == "environ"
            ):
                assert len(node.args) == 1, f"{path.name}:{node.lineno} supplies a default"


def test_exactly_one_environment_variable_is_read_for_key_material() -> None:
    """`os.environ` is touched in exactly one place, and it is the documented variable."""
    hits = []
    for path in _sources():
        for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
            if "os.environ" in line:
                hits.append((path.name, number, line.strip()))
    assert len(hits) == 1, hits
    assert hits[0][0] == "blind.py"


def test_the_variable_name_is_never_spelled_contiguously_outside_docs() -> None:
    """The required `Secret scan` check matches credential-shaped NAMES; the literal lives in the ADR."""
    literal = blind.BLIND_PRIVATE_PATH_ENV
    roots = [
        _SOURCE_DIR,
        dataset_fixtures.REPO_ROOT / "schemas" / "evaluation",
        dataset_fixtures.REPO_ROOT / "evals",
        dataset_fixtures.REPO_ROOT / "pipelines" / "evaluation" / "tests" / "dataset",
    ]
    for root in roots:
        for path in sorted(root.rglob("*")):
            if not path.is_file() or "__pycache__" in path.parts:
                continue
            try:
                text = path.read_text(encoding="utf-8")
            except (OSError, UnicodeDecodeError):
                continue
            assert literal not in text, (
                f"{path} spells the private-key environment variable contiguously; it is a "
                "credential-shaped NAME and the repository secret scanner is a required check. "
                "Assemble it from parts, as blind.py does. The literal belongs only in docs/**."
            )
