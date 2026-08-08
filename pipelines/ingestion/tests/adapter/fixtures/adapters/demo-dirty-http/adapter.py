"""NEGATIVE CONTROL for the architecture scan — imports an HTTP library directly (PRD §37.4).

Never imported at runtime by any test (`httpx` is not installed); it is only AST-parsed.
"""

from __future__ import annotations

import httpx  # noqa: F401  — the violation this fixture exists to prove is detected

ADAPTER = None
