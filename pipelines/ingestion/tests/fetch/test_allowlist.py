"""Deliverable 1 — the `allowlist.yaml` schema, its loader, and the URL check matrix.

Acceptance covered here: a non-https scheme is denied and an allowlist declaring one fails to LOAD;
an unknown host is `FETCH_DENIED_HOST`; a path outside `path_prefixes` is `FETCH_DENIED_PATH`;
`include_subdomains: false` denies `sub.host.tld`; `approved_max_bytes` without a reason fails to
load; plus the R5 bypass matrix (trailing dot, case, IDNA confusable, userinfo, `..`, `%2e%2e`,
double slash, explicit port, IP literal).
"""

from __future__ import annotations

import pytest
from fetch_paths import ALLOWLIST_FIXTURES

from taxrag_pipeline_ingestion.fetch import limits as limits_module
from taxrag_pipeline_ingestion.fetch.limits import FetchLimits
from taxrag_pipeline_ingestion.fetch.policy import (
    AllowlistError,
    DirectoryPolicyLoader,
    allowlist_schema,
    effective_max_bytes,
    load_allowlist,
    normalise_host,
    normalise_path,
)
from taxrag_pipeline_ingestion.fetch.yaml_min import YamlSubsetError, parse_yaml_subset


def group(name: str):
    return load_allowlist(ALLOWLIST_FIXTURES / name)


# -- loading ---------------------------------------------------------------------------------


def test_the_control_fixture_loads() -> None:
    policy = group("demo-ok")
    assert policy.group_id == "DEMO-OK"
    assert policy.schemes == ("https",)
    assert [rule.host for rule in policy.hosts] == ["docs.example.test", "mirror.example.test"]
    first = policy.hosts[0]
    assert first.include_subdomains is False
    assert first.path_prefixes == ("/latest/", "/series/")
    # Politeness keys are CARRIED for INGF-08, not enforced here.
    assert first.min_request_interval_ms == 1000
    assert first.max_concurrent_requests == 2
    assert first.approved_max_bytes is None


@pytest.mark.parametrize(
    ("fixture", "needle"),
    [
        ("demo-bad-scheme", "https"),
        ("demo-unknown-key", "surprise"),
        ("demo-ip-host", "IP literal"),
        ("demo-approved-no-reason", "approved_max_bytes_reason"),
        ("demo-empty-hosts", "at least one"),
        ("demo-bad-indent", "tab"),
    ],
)
def test_a_bad_allowlist_fails_to_load(fixture: str, needle: str) -> None:
    with pytest.raises(AllowlistError) as caught:
        group(fixture)
    assert needle in str(caught.value)


def test_the_loader_rejects_non_https():
    """PRD §21.1 — the scheme rule is enforced at LOAD time, not only at check time."""
    with pytest.raises(AllowlistError):
        group("demo-bad-scheme")


def test_a_missing_file_is_a_load_error(tmp_path) -> None:
    with pytest.raises(AllowlistError):
        load_allowlist(tmp_path)


def test_group_id_must_equal_the_directory_name(tmp_path) -> None:
    (tmp_path / "demo-mismatch").mkdir()
    (tmp_path / "demo-mismatch" / "allowlist.yaml").write_text(
        "group_id: DEMO-OTHER\nschemes: [https]\nhosts:\n  - host: a.example.test\n"
        "    include_subdomains: false\n    path_prefixes: [\"/\"]\n",
        encoding="utf-8",
    )
    with pytest.raises(AllowlistError) as caught:
        load_allowlist(tmp_path / "demo-mismatch")
    assert "directory name" in str(caught.value)


def test_the_schema_is_inside_the_validator_vocabulary() -> None:
    """R13 — a future keyword addition must fail loudly here, not silently pass unenforced."""
    from contracts.jsonschema_min import Draft202012Validator

    schema = allowlist_schema()
    validator = Draft202012Validator(schema, documents={str(schema["$id"]): schema})
    assert validator.is_valid(
        {
            "group_id": "DEMO-OK",
            "schemes": ["https"],
            "hosts": [
                {"host": "a.example.test", "include_subdomains": False, "path_prefixes": ["/"]}
            ],
        }
    )
    assert not validator.is_valid({"group_id": "demo-ok", "schemes": ["https"], "hosts": []})


def test_the_directory_loader_caches_and_lists_groups() -> None:
    loader = DirectoryPolicyLoader(ALLOWLIST_FIXTURES)
    first = loader.load("DEMO-OK")
    assert loader.load("demo-ok") is first
    assert "DEMO-SUBDOMAINS" in loader.groups()


# -- the check matrix ------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("url", "code"),
    [
        ("https://docs.example.test/latest/doc.pdf", None),
        ("https://docs.example.test/series/1/doc.pdf", None),
        ("HTTPS://DOCS.EXAMPLE.TEST/latest/doc.pdf", None),
        ("https://docs.example.test./latest/doc.pdf", None),
        ("http://docs.example.test/latest/doc.pdf", "FETCH_DENIED_SCHEME"),
        ("file:///etc/passwd", "FETCH_DENIED_SCHEME"),
        ("gopher://docs.example.test/latest/", "FETCH_DENIED_SCHEME"),
        ("https://other.example.test/latest/doc.pdf", "FETCH_DENIED_HOST"),
        ("https://sub.docs.example.test/latest/doc.pdf", "FETCH_DENIED_HOST"),
        ("https://evil-docs.example.test/latest/doc.pdf", "FETCH_DENIED_HOST"),
        ("https://user@docs.example.test/latest/doc.pdf", "FETCH_DENIED_HOST"),
        ("https://docs.example.test:8443/latest/doc.pdf", "FETCH_DENIED_HOST"),
        ("https://127.0.0.1/latest/doc.pdf", "FETCH_DENIED_HOST"),
        ("https://[::1]/latest/doc.pdf", "FETCH_DENIED_HOST"),
        ("https://docs.example.test/other/doc.pdf", "FETCH_DENIED_PATH"),
        ("https://docs.example.test/", "FETCH_DENIED_PATH"),
        ("https://docs.example.test/latest/../other/doc.pdf", "FETCH_DENIED_PATH"),
        ("https://docs.example.test/latest/%2e%2e/other/doc.pdf", "FETCH_DENIED_PATH"),
        ("https://docs.example.test//other/doc.pdf", "FETCH_DENIED_PATH"),
        ("https://docs.example.test/latest/../../../etc/passwd", "FETCH_DENIED_PATH"),
    ],
)
def test_the_check_matrix(url: str, code: str | None) -> None:
    decision = group("demo-ok").check(url)
    assert decision.allowed is (code is None), decision.reason
    assert (decision.code if decision.code is None else str(decision.code)) == code


def test_a_unicode_confusable_host_is_denied() -> None:
    """`docs.example.tеst` with a Cyrillic е IDNA-encodes to a different label entirely."""
    decision = group("demo-ok").check("https://docs.example.t\u0435st/latest/doc.pdf")
    assert decision.allowed is False
    assert str(decision.code) == "FETCH_DENIED_HOST"


@pytest.mark.parametrize(
    ("url", "allowed"),
    [
        ("https://example.test/a", True),
        ("https://sub.example.test/a", True),
        ("https://deep.sub.example.test/a", True),
        ("https://evil-example.test/a", False),
        ("https://exampleXtest/a", False),
    ],
)
def test_include_subdomains_matches_on_a_label_boundary(url: str, allowed: bool) -> None:
    assert group("demo-subdomains").check(url).allowed is allowed


@pytest.mark.parametrize(
    ("url", "allowed"),
    [
        ("https://docs.example.test/public/a", True),
        ("https://docs.example.test/private/a", False),
        ("https://docs.example.test/admin", False),
        ("https://docs.example.test/admin/panel", False),
    ],
)
def test_deny_paths_win_over_path_prefixes(url: str, allowed: bool) -> None:
    decision = group("demo-deny-paths").check(url)
    assert decision.allowed is allowed
    if not allowed:
        assert str(decision.code) == "FETCH_DENIED_PATH"


def test_a_nonstandard_port_is_permitted_only_for_the_test_seam() -> None:
    policy = group("demo-ok")
    assert policy.check("https://docs.example.test:9000/latest/a").allowed is False
    assert policy.check("https://docs.example.test:9000/latest/a", allow_nonstandard_port=True).allowed


def test_the_decision_carries_the_matched_host_rule() -> None:
    decision = group("demo-ok").check("https://docs.example.test/latest/a")
    assert decision.host_rule is not None
    assert decision.host_rule.host == "docs.example.test"


# -- effective ceiling -----------------------------------------------------------------------


def test_an_approved_limit_raises_the_ceiling_and_a_request_limit_lowers_it() -> None:
    small = FetchLimits(max_document_bytes=1024)
    approved = group("demo-approved-limit").hosts[0]
    plain = group("demo-ok").hosts[0]

    assert effective_max_bytes(plain, small) == 1024
    assert effective_max_bytes(approved, small) == 4096
    assert effective_max_bytes(approved, small, 512) == 512
    assert effective_max_bytes(None, small) == 1024
    assert effective_max_bytes(plain, FetchLimits()) == limits_module.MAX_DOCUMENT_BYTES


# -- normalisation helpers -------------------------------------------------------------------


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("Example.Test", "example.test"),
        ("example.test.", "example.test"),
        ("EXAMPLE.TEST.", "example.test"),
    ],
)
def test_normalise_host(raw: str, expected: str) -> None:
    assert normalise_host(raw) == expected


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("/a/b", "/a/b"),
        ("//a/b", "/a/b"),
        ("/a/./b", "/a/b"),
        ("/a/../b", "/b"),
        ("/latest/", "/latest/"),
        ("", "/"),
        ("/../../etc", None),
    ],
)
def test_normalise_path(raw: str, expected: str | None) -> None:
    assert normalise_path(raw) == expected


# -- the YAML subset -------------------------------------------------------------------------


def test_the_yaml_subset_round_trips_the_documented_shapes() -> None:
    parsed = parse_yaml_subset(
        "a: 1\n"
        "b: \"two # not a comment\"  # a comment\n"
        "c: [x, y]\n"
        "d: null\n"
        "e: true\n"
        "list:\n"
        "  - one\n"
        "  - key: value\n"
        "    other: 2\n"
        "nested:\n"
        "  inner: text\n"
    )
    assert parsed == {
        "a": 1,
        "b": "two # not a comment",
        "c": ["x", "y"],
        "d": None,
        "e": True,
        "list": ["one", {"key": "value", "other": 2}],
        "nested": {"inner": "text"},
    }


@pytest.mark.parametrize(
    "text",
    [
        "a:\tb\n",
        "---\na: 1\n",
        "a: &anchor 1\n",
        "a: *alias\n",
        "a: !tag 1\n",
        "a: |\n  block\n",
        "a: >\n  folded\n",
        "a: {b: 1}\n",
        "a: 1\na: 2\n",
        "a: 'single'\n",
        "  a: 1\n",
        "just-a-word\n",
        'a: "unterminated\n',
    ],
)
def test_the_yaml_subset_rejects_everything_outside_it(text: str) -> None:
    with pytest.raises(YamlSubsetError):
        parse_yaml_subset(text)


def test_yaml_min_is_a_generic_parser() -> None:
    """It must contain no fetch- or allowlist-shaped vocabulary (the jsonschema_min precedent)."""
    from taxrag_pipeline_ingestion.fetch import yaml_min

    source = yaml_min.__file__
    assert source is not None
    text = open(source, encoding="utf-8").read().lower()
    for word in ("group_id", "path_prefixes", "include_subdomains", "approved_max_bytes"):
        assert word not in text
