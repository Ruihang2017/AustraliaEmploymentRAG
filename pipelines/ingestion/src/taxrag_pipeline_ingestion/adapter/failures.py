"""Area-local failure-code registry (INGF-01 deliverable 10, sub-PRD D4, PRD §12.2 / ADM-001).

There is deliberately NO shared enum module. `INGF-05` (quarantine) and `INGF-06` (parsing) are
concurrent siblings and, later, 52 adapter tickets declare their own quarantine reasons; a single
enum file would be a permanent write conflict between them. Each area instead calls
`register_failure_codes()` at import time with its own codes and the operator action for each
(PRD §40.8 item 10: every failure code carries the action an operator must take).

The registry is process-global mutable state. Two consequences are handled here and must not be
"simplified" away:

* mutation is guarded by a module-level lock and a batch is validated in full BEFORE anything is
  committed, so a rejected batch can never leave a half-registered area behind;
* registration is idempotent for an IDENTICAL definition, because a module can legitimately be
  imported more than once under different `sys.path` entries.

`failure_code_registry()` returns a read-only view over a copy, so a caller cannot mutate the
registry through the value it is handed.
"""

from __future__ import annotations

import re
import threading
from dataclasses import dataclass
from types import MappingProxyType
from typing import Mapping, NewType

__all__ = [
    "CODE_PATTERN",
    "DuplicateFailureCodeError",
    "FailureCode",
    "InvalidFailureCodeError",
    "RegisteredCode",
    "failure_code_registry",
    "register_failure_codes",
]

#: A failure code as carried by quarantine rows, `ValidationFinding.code` and
#: `AdapterMeta.declared_quarantine_reasons` (PRD §12.2, ADM-001). A `NewType` over `str`: it is a
#: stable operator-visible token, never a per-release enum member.
FailureCode = NewType("FailureCode", str)

#: Codes are SCREAMING_SNAKE so they survive logs, dashboards and CSV exports unambiguously.
CODE_PATTERN = re.compile(r"^[A-Z][A-Z0-9_]*$")


class InvalidFailureCodeError(ValueError):
    """A code, area or operator action is malformed (PRD §12.2, ADM-001)."""


class DuplicateFailureCodeError(ValueError):
    """A code is already registered with a different area or a different operator action."""


@dataclass(frozen=True, slots=True)
class RegisteredCode:
    """One registry entry: the owning area and the operator action (PRD §40.8 item 10, ADM-001)."""

    area: str
    operator_action: str


_REGISTRY: dict[FailureCode, RegisteredCode] = {}
_LOCK = threading.Lock()


def register_failure_codes(area: str, codes: Mapping[FailureCode, str]) -> None:
    """Register *codes* for *area*; the mapping value is the operator action (ADM-001).

    Raises `InvalidFailureCodeError` when *area* is blank, a code does not match
    `^[A-Z][A-Z0-9_]*$`, or an operator action is blank. Raises `DuplicateFailureCodeError` when a
    code is already registered with a different area or action. Identical re-registration is a
    no-op, so repeated imports are safe.

    The whole batch is validated before any of it is committed: a rejected batch leaves the registry
    exactly as it was.
    """
    if not isinstance(area, str) or not area.strip():
        raise InvalidFailureCodeError("area must be a non-empty string")

    pending: dict[FailureCode, RegisteredCode] = {}
    for code, action in codes.items():
        if not isinstance(code, str) or not CODE_PATTERN.match(code):
            raise InvalidFailureCodeError(
                f"failure code {code!r} does not match {CODE_PATTERN.pattern} (area {area!r})"
            )
        if not isinstance(action, str) or not action.strip():
            raise InvalidFailureCodeError(
                f"failure code {code!r} (area {area!r}) has no operator action; ADM-001 requires one"
            )
        pending[FailureCode(code)] = RegisteredCode(area=area, operator_action=action)

    with _LOCK:
        for code, entry in pending.items():
            existing = _REGISTRY.get(code)
            if existing is not None and existing != entry:
                raise DuplicateFailureCodeError(
                    f"failure code {code!r} is already registered by area {existing.area!r}; "
                    f"area {entry.area!r} cannot redefine it"
                )
        _REGISTRY.update(pending)


def failure_code_registry() -> Mapping[FailureCode, RegisteredCode]:
    """An immutable snapshot of the registry: code -> (area, operator action)."""
    with _LOCK:
        return MappingProxyType(dict(_REGISTRY))
