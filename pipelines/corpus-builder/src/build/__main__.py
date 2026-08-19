"""`python -m build` — see `cli.py` for the invocation and the exit codes."""

from __future__ import annotations

from .cli import main

if __name__ == "__main__":
    raise SystemExit(main())
