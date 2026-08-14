"""Regression test: the shipped fixture matches the TICKET, and the ticket carries the amendments.

CLAUDE.md makes the ticket the executable source of truth (WHAT): spec changes go ticket -> docs PR
-> merge -> `publish-tickets.mjs --sync`, never into code, a plan, or a hand-edited issue. CRPS-08's
own Feedback obligation §1 says the same thing in stronger words: *"Silent divergence is an
incomplete ticket."*

Two `[machine]`-checkable facts forced CRPS-08 to differ from its first draft:

1. `versions.index` cannot be `null` — CRPS-02's frozen schema makes it a required non-empty string
   and `verify_bundle()` rejects a violation at BLOCKING severity;
2. `uv run python -m corpus_builder.fixtures` cannot exist — an importable `corpus_builder` package
   would need a second `__init__.py`-bearing directory under this uv member, which
   `tools/workspace-assertions.mjs::assertSkeleton()` fails repository-wide.

The first build addressed both in code and left the ticket untouched, which is exactly the failure
this file now makes impossible. **These assertions fail in BOTH directions**: if someone reverts the
ticket to `null` or to the `-m` invocation, this test goes red rather than the code quietly winning;
if someone changes the sentinel or the CLI's argument surface without amending the ticket, it goes
red too. It asserts nothing about *which* value is right — only that exactly one authority states it.

It reads `docs/**` read-only and writes nothing.
"""

from __future__ import annotations

import json
import re

# `fixture_release_helpers` puts CRPS-01's `src` and this module's `fixtures/` on `sys.path`, so it
# must be imported before `generator.*`.
from fixture_release_helpers import COMMITTED_BUNDLE_DIR, FIXTURES_DIR, REPO_ROOT

from generator._paths import INDEX_VERSION_PLACEHOLDER  # noqa: E402

TICKET = (
    REPO_ROOT
    / "docs"
    / "prd"
    / "04-corpus-contract"
    / "tickets"
    / "CRPS-08-signed-synthetic-corpus-fixture-release.md"
)
SUB_PRD = REPO_ROOT / "docs" / "prd" / "04-corpus-contract" / "README.md"

#: Deliverable 8's invocation, as the ticket must name it. A bare `python -m corpus_builder…` form
#: anywhere in the ticket is the un-amended text coming back.
CLI_INVOCATION = "uv run python pipelines/corpus-builder/fixtures/generator/cli.py"
FORBIDDEN_INVOCATION = "-m corpus_builder.fixtures"


def _ticket_text() -> str:
    return TICKET.read_text(encoding="utf-8")


def test_the_ticket_file_exists_and_is_this_ticket() -> None:
    """Guards the whole file: a renamed ticket must not turn these assertions into no-ops."""
    text = _ticket_text()
    assert "id: CRPS-08" in text
    assert "# CRPS-08 — Signed synthetic corpus fixture release" in text


def test_the_ticket_specifies_the_sentinel_index_version_not_null() -> None:
    """Amendment 1. The ticket — not this repository's code — is where the sentinel is decided."""
    text = _ticket_text()
    assert INDEX_VERSION_PLACEHOLDER in text, (
        f"the ticket does not mention {INDEX_VERSION_PLACEHOLDER!r}: either the amendment was "
        "reverted or the code changed the sentinel without amending the ticket"
    )
    assert "`index: null` when placeholder" not in text
    assert "`versions.index` is `null`" not in text


def test_the_shipped_manifest_carries_exactly_the_ticket_s_sentinel() -> None:
    """The committed artifact agrees with the ticket, through the constant the generator uses."""
    manifest = json.loads(
        (COMMITTED_BUNDLE_DIR / "release-manifest.json").read_text(encoding="utf-8")
    )
    assert manifest["versions"]["index"] == INDEX_VERSION_PLACEHOLDER
    assert INDEX_VERSION_PLACEHOLDER in _ticket_text()


def test_the_ticket_specifies_the_script_path_cli_invocation() -> None:
    """Amendment 2. The command a consumer is told to run must be one that can actually exist."""
    text = _ticket_text()
    assert CLI_INVOCATION in text.replace("\n   ", " ").replace("\n", " "), (
        "deliverable 8 no longer names the script-path invocation"
    )
    # The old form may still be QUOTED, but only inside the amendment note that retires it — never
    # as something a reader is told to run. An unattributed occurrence is the revert this guards.
    flattened = text.replace("\n   ", " ").replace("\n", " ")
    for match in re.finditer(re.escape(FORBIDDEN_INVOCATION), flattened):
        preamble = flattened[max(0, match.start() - 160) : match.start()]
        assert "originally named" in preamble, (
            "the ticket names an invocation that cannot exist outside an amendment note: an "
            "importable `corpus_builder` package would add a second package directory to this uv "
            f"member and fail assertSkeleton(). Context: ...{preamble[-120:]!r}"
        )


def test_the_cli_named_by_the_ticket_is_the_file_that_exists() -> None:
    """The amended invocation is not merely plausible — it resolves to a real script."""
    script = REPO_ROOT / "pipelines/corpus-builder/fixtures/generator/cli.py"
    assert script.is_file()
    assert not (FIXTURES_DIR / "__init__.py").exists(), (
        "fixtures/__init__.py would make `python -m corpus_builder.fixtures` importable at the cost "
        "of failing tools/workspace-assertions.mjs::assertSkeleton() repository-wide"
    )


def test_both_amendments_are_dated_in_the_ticket() -> None:
    """An amendment with no date is indistinguishable from the original text a year from now."""
    text = _ticket_text()
    assert len(re.findall(r"[Aa]mended 2026-08-15", text)) >= 3, (
        "expected the amendment note on deliverable 3, deliverable 8 and the acceptance item"
    )


def test_the_sub_prd_records_the_decision_and_the_version_bump() -> None:
    """CRPS-08's Feedback obligation §1 requires the module writeback, versioned with a changelog."""
    text = SUB_PRD.read_text(encoding="utf-8")
    assert "| D16 |" in text, "the sub-PRD does not record the placeholder-sentinel decision"
    assert INDEX_VERSION_PLACEHOLDER in text
    assert "| Version | v0.3 (2026-08-15) |" in text
    assert "**v0.3 — 2026-08-15**" in text, "the version bump has no changelog entry"
