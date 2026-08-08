"""NEGATIVE CONTROL for the architecture scan — imports a tenant/customer package (PRD §39.1).

Never imported at runtime by any test; it is only AST-parsed.
"""

from __future__ import annotations

from packages.database import client  # noqa: F401  — the violation this fixture proves is detected

ADAPTER = None
