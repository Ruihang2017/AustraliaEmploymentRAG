"""Architecture enforcement (deliverable 8, extending INGF-01 deliverable 11).

PRD §37.4: "Adapters use a shared fetcher, not arbitrary HTTP libraries." The scanner is INGF-01's,
IMPORTED rather than copied — the ticket's file-scope forbids editing `tests/adapter/**`, and a
second copy of a rule engine is a second set of rules.

Two scopes are asserted separately, because they are two different claims:

* PRODUCTION code — every `.py` under `pipelines/ingestion/` outside `src/<root>/fetch/`, plus
  `pipelines/adapters/`, must not import an HTTP or socket module at all;
* THE FETCH SUITE — `tests/fetch/` legitimately speaks sockets (it runs a loopback fixture server
  and asserts that outbound connections fail), so instead of exempting the directory wholesale, the
  set of files there that may import one is pinned to a named list. A new test module that reaches
  for a socket fails this test.

Violations are filtered by RULE rather than compared to an empty list, so a rule owned by another
ticket cannot make this test fail for the wrong reason.
"""

from __future__ import annotations

from pathlib import Path

from adapter_archscan import DENIED_HTTP_ROOTS, python_files, scan_paths, scan_tree
from fetch_paths import ADAPTERS_TREE, DIRTY_FIXTURES, FETCH_FIXTURES, FETCH_SRC, INGESTION_MEMBER

#: The only files under `tests/fetch/` permitted to import an HTTP or socket module: the offline
#: harness, and the two suites that assert socket-level behaviour.
SOCKET_AWARE_TEST_FILES = frozenset(
    {"conftest.py", "fetch_server.py", "fetch_resolver.py", "test_ssrf.py", "test_ipguard.py"}
)

FETCH_TESTS = Path(__file__).resolve().parent

#: Strings that would disable TLS verification. Assembled from fragments so that this list is not
#: itself a match — a guard whose own source trips it is a guard somebody deletes.
FORBIDDEN_TLS_STRINGS = (
    "verify" + "=False",
    "check_hostname" + " = False",
    "check_hostname" + "=False",
    "CERT_" + "NONE",
    "_create_" + "unverified_context",
)

#: Process-configuration accessors: a limit that can be lowered from outside the code is not a limit.
FORBIDDEN_CONFIG_STRINGS = ("get" + "env", "os." + "environ", "environ" + "[")


def _fetch_sources() -> list[Path]:
    return sorted(FETCH_SRC.rglob("*.py"))


def test_no_production_module_outside_fetch_imports_an_http_library() -> None:
    files = python_files(
        INGESTION_MEMBER,
        exclude=[FETCH_SRC, FETCH_TESTS, INGESTION_MEMBER / "tests" / "adapter" / "fixtures"],
    )
    violations = [v for v in scan_paths(files, adapter_tree=True) if v.rule == "direct-http"]
    assert violations == []
    assert len(files) >= 10  # the scan is not vacuous


def test_the_adapter_tree_imports_no_http_library() -> None:
    """`pipelines/adapters/` gains content in module `06`; an absent tree is tolerated."""
    violations = [
        v for v in scan_tree(ADAPTERS_TREE, adapter_tree=True) if v.rule == "direct-http"
    ]
    assert violations == []


def test_the_dirty_fixture_is_reported() -> None:
    """The positive control: without it, a passing scan proves nothing."""
    violations = scan_paths(python_files(DIRTY_FIXTURES), adapter_tree=True)
    assert [v.rule for v in violations] == ["direct-http"]


def test_only_the_named_harness_files_speak_sockets() -> None:
    files = python_files(FETCH_TESTS, exclude=[FETCH_FIXTURES])
    offenders = {
        Path(v.path).name
        for v in scan_paths(files, adapter_tree=True)
        if v.rule == "direct-http"
    }
    assert offenders <= SOCKET_AWARE_TEST_FILES, offenders
    assert len(files) >= 10


def test_the_denied_root_set_still_covers_what_this_ticket_relies_on() -> None:
    """If INGF-01's rule ever stopped naming these, this ticket's guarantee would be hollow."""
    assert {"requests", "httpx", "aiohttp", "urllib", "http", "socket"} <= DENIED_HTTP_ROOTS


def test_no_verification_disabling_string_exists_in_the_fetch_package() -> None:
    sources = _fetch_sources()
    assert len(sources) >= 10  # not a vacuous grep
    for path in sources:
        text = path.read_text(encoding="utf-8")
        for needle in FORBIDDEN_TLS_STRINGS:
            assert needle not in text, f"{path.name} contains {needle!r}"


def test_no_process_configuration_read_exists_in_the_fetch_package() -> None:
    sources = _fetch_sources()
    assert len(sources) >= 10
    for path in sources:
        text = path.read_text(encoding="utf-8")
        for needle in FORBIDDEN_CONFIG_STRINGS:
            assert needle not in text, f"{path.name} contains {needle!r}"


def test_the_schema_file_ships_with_the_package() -> None:
    assert (FETCH_SRC / "schema" / "allowlist.schema.json").is_file()
