"""`python -m dataset …` — see `cli.py`'s header for why the ticket's `evaluation.dataset` module
path is not satisfiable as written, and what is shipped instead (build report OQ-1)."""

from __future__ import annotations

from .cli import main

if __name__ == "__main__":
    raise SystemExit(main())
