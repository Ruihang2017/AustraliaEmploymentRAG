"""A file that will not PARSE must not leak its own content through the failure path.

Review finding (critical): `SCHEMA_VALID` put a parser message verbatim into a `Finding`, and
`yaml_min` built those messages by interpolating the offending source fragment (`{content!r}`,
`{key!r}`, `{remainder!r}`). A malformed file under a `blind/` path would therefore have published
a fragment of its own plaintext to stdout, to the JSON report and into CI logs — through the
ordinary failure path, with no key and no attacker.

The canary test in `test_findings_content_free.py` could not catch it: that tree is well formed, so
no parse error is ever raised there. These tests exercise the UNPARSEABLE path specifically, on a
blind sidecar and on a visible case, and they also pin the source-level invariant so a future edit
cannot reintroduce an interpolation of source text into a parser message.
"""

from __future__ import annotations

import io
import re
from pathlib import Path

import dataset_fixtures  # noqa: F401
import pytest
from dataset import compose, yaml_min
from dataset.checks import CheckContext, run_checks
from dataset.cli import main
from dataset.compose import SIDECAR_SUFFIX
from dataset.paths import SCHEMAS_DIR

CANARY = "qvzxwphlmrbtkgnd-parse-canary"

_YAML_MIN = Path(yaml_min.__file__)


# -- the source-level invariant --------------------------------------------------------------------


def test_no_parser_message_interpolates_source_text() -> None:
    """No `!r` (or `!s`) conversion of a source fragment survives anywhere in a raise message.

    Grepping the module is deliberate belt-and-braces: the behavioural tests below only cover the
    constructs they happen to trigger, while this one covers every raise site that exists.
    """
    body = _YAML_MIN.read_text(encoding="utf-8")
    # The module header quotes the forbidden shapes in prose to explain the rule; strip the
    # docstring before grepping so the explanation does not fail its own test.
    code = body.split('"""', 2)[2]
    offenders = [
        line.strip()
        for line in code.splitlines()
        if "!r}" in line or "!s}" in line
        if "type(" not in line  # `type(value).__name__` is a TYPE name, not content
    ]
    assert offenders == []


def test_reason_is_the_documented_content_free_accessor() -> None:
    error = yaml_min.YamlError("line 4: duplicate mapping key")
    assert error.reason == "YamlError: line 4: duplicate mapping key"
    unsupported = yaml_min.UnsupportedYamlError("line 9: tab in indentation")
    assert unsupported.reason.startswith("UnsupportedYamlError: ")


# -- the parser itself ------------------------------------------------------------------------------


@pytest.mark.parametrize(
    "document",
    [
        # not a mapping entry — the offending line used to be echoed with `{content!r}`
        f"id: EVAL-FED-001\n{CANARY} no colon here\n",
        # duplicate mapping key — the key used to be echoed with `{key!r}`
        f"{CANARY}: 1\n{CANARY}: 2\n",
        # content after a quoted scalar — the remainder used to be echoed with `{remainder!r}`
        f'id: "EVAL-FED-001" {CANARY}\n',
        # an unsupported block scalar header — the header used to be echoed with `{header!r}`
        f"note: |{CANARY}\n  text\n",
        # an anchor: rejected, and the key carrying it must not be echoed
        f"&{CANARY}anchor: 1\n",
    ],
)
def test_a_parse_failure_never_quotes_the_offending_text(document: str) -> None:
    with pytest.raises(yaml_min.YamlError) as caught:
        yaml_min.load(document)
    assert CANARY not in str(caught.value)
    assert CANARY not in caught.value.reason
    assert CANARY not in repr(caught.value)


# -- end to end, through a finding and through the CLI ----------------------------------------------


def _blind_sidecar(root: Path) -> Path:
    candidates = sorted(root.rglob(f"*{SIDECAR_SUFFIX}"))
    assert candidates, "the fixture tree must contain at least one blind sidecar"
    return candidates[0]


@pytest.fixture()
def tree_with_unparseable_sidecar(dataset_tree):
    """A BLIND sidecar that will not parse, and whose broken line carries a canary.

    This is the realistic shape of the leak: blind metadata edited by hand, saved malformed, and
    reported by an ordinary `verify` run that nobody thought of as touching blind content.
    """
    root = dataset_tree()
    target = _blind_sidecar(root)
    target.write_text(f"id: EVAL-FED-101\n{CANARY} this line is not a mapping entry\n", encoding="utf-8")
    return root


def test_the_unparseable_sidecar_really_is_unparseable(tree_with_unparseable_sidecar) -> None:
    dataset = compose(tree_with_unparseable_sidecar)
    reported = [reason for entry in dataset.categories for _path, reason in entry.unparseable]
    assert reported, "the fixture must actually fail to parse, or every assertion below is vacuous"
    for reason in reported:
        assert CANARY not in reason


def test_no_check_leaks_the_content_of_an_unparseable_blind_sidecar(
    tree_with_unparseable_sidecar,
) -> None:
    dataset = compose(tree_with_unparseable_sidecar)
    findings = run_checks(dataset, CheckContext(schemas_dir=SCHEMAS_DIR))
    assert any(finding.check_id == "SCHEMA_VALID" for finding in findings)
    for finding in findings:
        assert CANARY not in finding.render()
        assert CANARY not in str(finding.as_dict())


@pytest.mark.parametrize("fmt", ["text", "json"])
def test_verify_output_never_echoes_an_unparseable_file(tree_with_unparseable_sidecar, fmt: str) -> None:
    out, err = io.StringIO(), io.StringIO()
    code = main(["--root", str(tree_with_unparseable_sidecar), "--format", fmt, "verify"], stdout=out, stderr=err)
    assert code != 0, "an unparseable file is a blocking finding, never a pass"
    assert CANARY not in out.getvalue()
    assert CANARY not in err.getvalue()


def test_the_same_holds_for_a_visible_case_file(dataset_tree) -> None:
    root = dataset_tree()
    target = sorted((root / "cases").rglob("EVAL-*.yaml"))[0]
    target.write_text(f"question: 'unterminated {CANARY}\n", encoding="utf-8")
    out, err = io.StringIO(), io.StringIO()
    code = main(["--root", str(root), "--format", "json", "verify"], stdout=out, stderr=err)
    assert code != 0
    assert CANARY not in out.getvalue()
    assert CANARY not in err.getvalue()
    assert re.search(r"unreadable or unparseable", out.getvalue()) is not None
