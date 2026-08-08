"""Deterministic, offline, standard-library-only text segmentation (CRPS-03 rule 5.2, rule 6).

WHY THERE IS NO THIRD-PARTY SEGMENTER HERE
------------------------------------------
A uv workspace member's declared dependency is NOT installed by the root `uv sync --frozen`
(recorded as E1 by CRPS-01, which shipped `contracts/jsonschema_min.py` for the same reason), and a
model download during the offline build is forbidden (PRD §19.3, §20.3). So `nltk`, `blingfire`,
`pysbd` and `spacy` are all equally unavailable. A rule-based segmenter written here is available,
which is why `split_strategy` stays `"sentence"` rather than falling back to `"paragraph"`.

CONTRACT OF THIS MODULE
-----------------------
* Every function takes and returns ABSOLUTE half-open character spans `[start, end)` into *text*.
  Nothing here ever builds a substring for the caller, so chunk offsets are structurally exact and
  memory stays linear in the node.
* Every function is pure: no I/O, no module-level mutable state, no cache, no clock, no RNG, no
  locale dependence. Module-level compiled patterns are immutable and hold no result cache.
* Every pattern is linear — one character class under one quantifier, no nesting, no backreference,
  no overlapping alternation — because a hostile source document is exactly the input this pipeline
  exists to process (catastrophic backtracking is the realistic attack surface, not the network).

`SEGMENTER_VERSION` feeds `profile_fingerprint`, so ANY change to boundary behaviour here must bump
it: a rebuild that moves a boundary invalidates every recorded chunk hash and every embedding
(PRD §15.3).
"""

from __future__ import annotations

import re
import unicodedata

__all__ = [
    "SEGMENTER_VERSION",
    "hard_cut_points",
    "paragraph_spans",
    "sentence_spans",
    "trim_span",
]

#: Bump on ANY change to the boundaries this module produces. Feeds `profile_fingerprint`.
SEGMENTER_VERSION: str = "1.0.0"

#: A paragraph boundary is a blank line: a newline, optional horizontal/vertical blanks, a newline.
_PARAGRAPH_RE = re.compile(r"\n[ \t\r\f\v]*\n")

#: Sentence-final punctuation, Latin and CJK.
_SENTENCE_FINAL = frozenset(".!?。！？")

#: Marks that may trail the sentence-final punctuation and still belong to the same sentence.
_CLOSING_MARKS = frozenset("\"')]}»”’…")

#: Tokens that end in `.` without ending a sentence. Membership only — this set is NEVER iterated in
#: output-affecting code, so dict/set ordering under PYTHONHASHSEED cannot reach a boundary.
_ABBREVIATIONS: frozenset[str] = frozenset(
    {
        "s", "ss", "cl", "sch", "pt", "div", "subdiv", "reg", "r", "para", "no", "cth",
        "cf", "v", "ltd", "pty", "co", "mr", "mrs", "ms", "dr", "hon",
    }
)

#: How far a hard cut may be nudged left off a combining mark before the raw position is accepted.
_COMBINING_NUDGE_LIMIT = 8


def trim_span(text: str, start: int, end: int) -> tuple[int, int]:
    """The largest sub-span of `[start, end)` with no leading or trailing whitespace.

    Returns `(start, start)` when the span is empty or entirely whitespace; callers treat that as
    "no content", which is rule 5.4's zero-chunk case.
    """
    left, right = start, end
    while left < right and text[left].isspace():
        left += 1
    while right > left and text[right - 1].isspace():
        right -= 1
    if left >= right:
        return (start, start)
    return (left, right)


def paragraph_spans(text: str, start: int, end: int) -> list[tuple[int, int]]:
    """Trimmed paragraph spans within `[start, end)`, split on blank lines.

    Text with no blank line yields exactly one span: the trimmed `[start, end)`. Whitespace-only
    input yields an empty list.
    """
    spans: list[tuple[int, int]] = []
    cursor = start
    for match in _PARAGRAPH_RE.finditer(text, start, end):
        span = trim_span(text, cursor, match.start())
        if span[1] > span[0]:
            spans.append(span)
        cursor = match.end()
    span = trim_span(text, cursor, end)
    if span[1] > span[0]:
        spans.append(span)
    return spans


def _suppressed_by_preceding_token(text: str, start: int, dot: int) -> bool:
    """True when the word immediately before `text[dot]` makes it a non-boundary.

    Two cases, both common in legislative prose: a known abbreviation (`s.`, `Pty.`, `cf.`), and a
    single letter or digit, which is an enumerator such as `1.` or `(a).` rather than a sentence.
    `str.lower()` is Unicode-defined, not locale-defined, so this stays deterministic.
    """
    if text[dot] != ".":
        return False
    # Alphanumerics only. Walking back over `.` as well would make a run of dots quadratic, which is
    # precisely the algorithmic denial-of-service a hostile source document could aim for.
    left = dot
    while left > start and text[left - 1].isalnum():
        left -= 1
    token = text[left:dot].lower()
    if not token:
        return False
    if len(token) == 1 and token.isalnum():
        return True
    return token in _ABBREVIATIONS


def sentence_spans(text: str, start: int, end: int) -> list[tuple[int, int]]:
    """Trimmed sentence spans within `[start, end)`.

    A boundary is: a run of sentence-final punctuation, optionally followed by closing marks, then
    whitespace, then a further non-whitespace character inside the span. Requiring the whitespace is
    what keeps `s.123`, `1,234.56` and `e.g.` in one piece; the abbreviation and single-token rules
    above cover the rest. Sub-sentence splitting is only ever reached for a paragraph that already
    exceeds `max_chars`, so an occasional missed boundary costs a slightly different split point,
    never a wrong offset.
    """
    spans: list[tuple[int, int]] = []
    cursor = start
    index = start
    while index < end:
        character = text[index]
        if character not in _SENTENCE_FINAL:
            index += 1
            continue
        if _suppressed_by_preceding_token(text, start, index):
            index += 1
            continue
        after = index + 1
        while after < end and text[after] in _SENTENCE_FINAL:
            after += 1
        while after < end and text[after] in _CLOSING_MARKS:
            after += 1
        probe = after
        while probe < end and text[probe].isspace():
            probe += 1
        if probe >= end or probe == after:
            # No whitespace-separated successor: not a boundary. Keep scanning from `after` so the
            # punctuation run is examined once, which is what makes this loop linear.
            index = max(after, index + 1)
            continue
        span = trim_span(text, cursor, after)
        if span[1] > span[0]:
            spans.append(span)
        cursor = probe
        index = probe
    span = trim_span(text, cursor, end)
    if span[1] > span[0]:
        spans.append(span)
    return spans


def hard_cut_points(text: str, start: int, end: int, max_chars: int) -> list[int]:
    """Cut positions strictly inside `[start, end)` so that no piece exceeds *max_chars*.

    A hard cut is the last resort of rule 5.2 and is permitted only for a unit that is already
    longer than `max_chars`. Positions advance by `max_chars` and are then nudged LEFT off a
    combining mark (bounded by `_COMBINING_NUDGE_LIMIT` positions, after which the raw position is
    accepted) so a piece never begins with a mark orphaned from its base character. Both the advance
    and the nudge are deterministic and depend on nothing but *text*, the span and *max_chars*.
    """
    if max_chars <= 0:
        raise ValueError(f"max_chars must be positive, got {max_chars}")
    cuts: list[int] = []
    previous = start
    position = start + max_chars
    while position < end:
        candidate = position
        steps = 0
        while (
            candidate > previous
            and steps < _COMBINING_NUDGE_LIMIT
            and unicodedata.combining(text[candidate]) != 0
        ):
            candidate -= 1
            steps += 1
        if candidate <= previous:
            candidate = position
        cuts.append(candidate)
        previous = candidate
        position = candidate + max_chars
    return cuts
