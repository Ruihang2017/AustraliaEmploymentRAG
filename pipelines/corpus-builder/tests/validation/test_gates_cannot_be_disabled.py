"""A gate must not be disableable for a `CANDIDATE`, and a gate must never be silently absent.

Reviewer focus item from the ticket's test plan: *"confirm gates cannot be disabled by
configuration for a CANDIDATE build (search for any skip/force flag)"*. This is a source scan
rather than a behavioural test on purpose — a behavioural test can only prove that the flags that
exist today do not disable a gate, whereas the scan proves no such flag exists at all.
"""

from __future__ import annotations

import ast
import re

from candidate_paths import BUILD_SRC, VALIDATION_SRC

from validation.codes import GATE_NAMES
from validation.gates import GATES, merge_results

#: Spellings that would name a gate-disabling switch. Matched as whole identifiers so ordinary
#: words ("skipped_count", "forced_split") do not produce a false positive.
_FORBIDDEN = re.compile(
    r"\b(skip_gates?|skip_gate|disable_gates?|disable_gate|force_build|only_gates?|gates_to_run"
    r"|no_gates|bypass_gates?|ignore_gates?)\b"
)


def _sources() -> list[tuple[str, str]]:
    return [
        (str(path), path.read_text(encoding="utf-8"))
        for path in sorted([*BUILD_SRC.rglob("*.py"), *VALIDATION_SRC.rglob("*.py")])
    ]


def test_no_gate_disabling_identifier_exists_anywhere() -> None:
    offenders = [
        (name, match.group(0))
        for name, text in _sources()
        for match in _FORBIDDEN.finditer(text)
    ]
    assert offenders == []


def test_no_gate_function_takes_a_switch() -> None:
    """Every gate is `(BundleContext) -> list[Finding]` and takes nothing else.

    Scoped to `validation/gates.py`, where the gates live: a `gate_`-prefixed helper elsewhere
    (`build/report.py::gate_report_path`) is not a gate and has no reason to take one argument.
    """
    path = VALIDATION_SRC / "gates.py"
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    seen = 0
    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef) and node.name.startswith("gate_"):
            seen += 1
            arguments = node.args
            assert arguments.kwonlyargs == [], node.name
            assert arguments.vararg is None and arguments.kwarg is None, node.name
            assert [item.arg for item in arguments.args] == ["ctx"], node.name
    # A scan that found nothing would make the assertions above vacuous.
    assert seen >= len(GATE_NAMES)


def test_all_eight_gates_are_registered_in_prd_order() -> None:
    assert tuple(name for name, _ in GATES) == GATE_NAMES


def test_a_report_records_all_eight_gates_even_when_a_phase_ran_none() -> None:
    results = merge_results({})
    assert tuple(result.gate for result in results) == GATE_NAMES
    assert {result.status for result in results} == {"NOT_RUN"}
    # NOT_RUN is stated as a finding, so an operator never has to infer a skip from an absence.
    assert all(result.findings[0].code == "GATE_NOT_RUN" for result in results)
