"""Acceptance item: findings are content-free.

"A canary string placed in a fixture case's `question` appears in no finding message, log line or
non-zero-exit output." (PRD §22, §14.3; breakdown plan §8 Q6 item 15.)

The canary is planted in BOTH `question` and `anonymous_scenario`, and the assertion covers every
check, every CLI subcommand, both `--format` modes, stdout, stderr and the logging system. This is
the test that makes the blind claim true for the VISIBLE path as well: a finding that quoted a
development case's question today would quote a blind one the moment `GOLD-02` opens material.
"""

from __future__ import annotations

import io
import logging

import dataset_fixtures  # noqa: F401
import pytest
from dataset import compose
from dataset.checks import CheckContext, run_checks
from dataset.cli import main
from dataset.paths import SCHEMAS_DIR

CANARY = "zqxjkvbnmwrtypfgh-canary-do-not-echo"


@pytest.fixture()
def tree_with_canary(dataset_tree):
    return dataset_tree(canary=CANARY)


def test_the_canary_really_is_in_the_fixture(tree_with_canary) -> None:
    """A canary that was never planted would make every assertion below vacuous."""
    text = (tree_with_canary / "cases" / "federal-core" / "EVAL-FED-001.yaml").read_text(encoding="utf-8")
    assert CANARY in text


def test_no_check_puts_case_content_in_a_finding(tree_with_canary) -> None:
    dataset = compose(tree_with_canary)
    for complete in (False, True):
        context = CheckContext(schemas_dir=SCHEMAS_DIR, complete=complete)
        for finding in run_checks(dataset, context):
            assert CANARY not in finding.render()
            assert CANARY not in str(finding.as_dict())


@pytest.mark.parametrize("fmt", ["text", "json"])
@pytest.mark.parametrize(
    "argv",
    [
        ["verify"],
        ["verify", "--complete"],
        ["verify", "--category", "federal-core"],
        ["guard-blind"],
        ["hash"],
        ["hash", "--category", "federal-core"],
    ],
)
def test_no_cli_subcommand_echoes_case_content(tree_with_canary, argv: list[str], fmt: str) -> None:
    out, err = io.StringIO(), io.StringIO()
    stream = io.StringIO()
    handler = logging.StreamHandler(stream)
    logging.getLogger().addHandler(handler)
    try:
        main(["--root", str(tree_with_canary), "--format", fmt, *argv], stdout=out, stderr=err)
    finally:
        logging.getLogger().removeHandler(handler)
    assert CANARY not in out.getvalue()
    assert CANARY not in err.getvalue()
    assert CANARY not in stream.getvalue()


def test_a_non_zero_exit_still_carries_no_content(tree_with_canary, dataset_tree) -> None:
    """The path that matters most: the output an author actually reads when something failed."""
    root = dataset_tree(canary=CANARY, miscount_category="federal-core", plaintext_under_blind="federal-core")
    out, err = io.StringIO(), io.StringIO()
    code = main(["--root", str(root), "--format", "text", "verify"], stdout=out, stderr=err)
    assert code == 1
    assert out.getvalue().strip()
    assert CANARY not in out.getvalue()
    assert CANARY not in err.getvalue()
    del tree_with_canary


def test_findings_reference_ids_categories_and_counts_only(tree_with_canary) -> None:
    """Positive statement of the rule: a finding names the vocabulary Q6 item 15 permits."""
    dataset = compose(tree_with_canary)
    findings = run_checks(dataset, CheckContext(schemas_dir=SCHEMAS_DIR))
    assert findings
    for finding in findings:
        assert finding.check_id
        assert finding.category
        if finding.case_id is not None:
            assert finding.case_id.startswith("EVAL-") or finding.case_id.startswith("<")
