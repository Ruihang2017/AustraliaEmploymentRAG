"""NEGATIVE CONTROL for the architecture scan — touches the corpus database (PRD §40.7).

Never imported at runtime by any test; it is only AST-parsed.
"""

from __future__ import annotations

import sqlite3  # noqa: F401  — the violation this fixture exists to prove is detected

CORPUS = "corpus.sqlite"
ADAPTER = None
