"""Adapter location by directory convention (INGF-01 deliverable 9, sub-PRD D5).

`pipelines/adapters/<group-id>/adapter.py` exposing a module-level `ADAPTER: SourceAdapter`. There is
deliberately NO central manifest file, created or read: breakdown plan §2.1 **A1** settles the
identical question for HTTP routes ("registration by directory convention (autoload), never a shared
central manifest"), and with 52 adapter tickets a manifest would serialise all of them behind one
file. If the convention proves impractical, the writeback path is INGF-01's Feedback obligation 3
(ADR + D5/M5 + breakdown plan row) — never a silently introduced manifest.

Two known limitations, both intentional and both binding on modules `06`–`10`:

* `isinstance(x, SourceAdapter)` against a `runtime_checkable` Protocol checks METHOD PRESENCE ONLY,
  not signatures. A mis-shaped adapter passes this gate; arity and type conformance are `INGF-09`'s
  conformance kit. Widening this loader into a signature checker would duplicate that deliverable.
* Relative imports inside `adapter.py` are NOT supported — the module is loaded as a top-level
  module with no package and no `submodule_search_locations`. Shared adapter code under
  `pipelines/adapters/_shared/**` has no declared import path yet (sub-PRD M5, ADR candidate).

SECURITY: `load_adapter()` EXECUTES Python from disk. It is for in-repository adapter directories
only and must never be pointed at an untrusted or user-supplied path. It performs no download and
evaluates no remote content.
"""

from __future__ import annotations

import importlib.util
import re
import sys
from pathlib import Path
from typing import Iterator

from .protocol import SourceAdapter

__all__ = ["ADAPTER_ATTRIBUTE", "ADAPTER_MODULE_NAME", "AdapterLoadError", "iter_adapter_dirs", "load_adapter"]

#: The file every adapter group must contain (sub-PRD D5).
ADAPTER_MODULE_NAME = "adapter.py"

#: The module-level attribute every adapter group must expose (sub-PRD D5).
ADAPTER_ATTRIBUTE = "ADAPTER"

_SLUG = re.compile(r"[^0-9a-z]+")


class AdapterLoadError(RuntimeError):
    """An adapter directory does not satisfy the D5 convention."""


def iter_adapter_dirs(adapters_root: Path) -> Iterator[Path]:
    """Yield every loadable adapter group directory under *adapters_root*, sorted by name.

    Skips non-directories, `_`-prefixed directories (`_shared/**` is shared code owned by `SLEG-01`,
    `SINS-01`, `SCAS-01` and `SFUT-01`, not an adapter) and any directory without an `adapter.py`.
    Sorted so a run's group order is deterministic.

    An absent *adapters_root* yields nothing rather than raising: `pipelines/adapters/` is created by
    module `06`, and this framework must be testable before it exists.
    """
    root = Path(adapters_root)
    if not root.is_dir():
        return
    for child in sorted(root.iterdir(), key=lambda path: path.name):
        if not child.is_dir() or child.name.startswith("_"):
            continue
        if not (child / ADAPTER_MODULE_NAME).is_file():
            continue
        yield child


def _module_name(group_dir: Path) -> str:
    """A unique `sys.modules` name for this group.

    Never the bare name `adapter`: 52 groups each ship an `adapter.py`, and a shared module name
    would make them overwrite one another in `sys.modules`.
    """
    slug = _SLUG.sub("_", group_dir.name.lower()).strip("_")
    return f"taxrag_ingestion_adapter_{slug}"


def load_adapter(group_dir: Path) -> SourceAdapter:
    """Import `<group_dir>/adapter.py` and return its module-level `ADAPTER`.

    Raises `AdapterLoadError` — with the directory and the reason — when `adapter.py` is missing,
    when executing it fails, when `ADAPTER` is absent, or when `ADAPTER` does not satisfy
    `isinstance(x, SourceAdapter)`. The original exception is always chained; a failure is never
    swallowed.

    Repeat loads of the same directory are idempotent: an already-imported module with a matching
    `__file__` is reused rather than re-executed.
    """
    group_dir = Path(group_dir)
    module_path = group_dir / ADAPTER_MODULE_NAME
    if not module_path.is_file():
        raise AdapterLoadError(f"{group_dir}: no {ADAPTER_MODULE_NAME}")

    name = _module_name(group_dir)
    resolved = str(module_path.resolve())
    existing = sys.modules.get(name)
    if existing is not None and getattr(existing, "__file__", None) == resolved:
        module = existing
    else:
        spec = importlib.util.spec_from_file_location(name, resolved)
        if spec is None or spec.loader is None:
            raise AdapterLoadError(f"{group_dir}: cannot build an import spec for {module_path}")
        module = importlib.util.module_from_spec(spec)
        sys.modules[name] = module
        try:
            spec.loader.exec_module(module)
        except Exception as exc:  # noqa: BLE001 — every failure is reported as AdapterLoadError
            sys.modules.pop(name, None)
            raise AdapterLoadError(f"{group_dir}: {ADAPTER_MODULE_NAME} failed to import: {exc}") from exc

    try:
        adapter = getattr(module, ADAPTER_ATTRIBUTE)
    except AttributeError as exc:
        raise AdapterLoadError(
            f"{group_dir}: {ADAPTER_MODULE_NAME} defines no module-level {ADAPTER_ATTRIBUTE}"
        ) from exc

    if not isinstance(adapter, SourceAdapter):
        raise AdapterLoadError(
            f"{group_dir}: {ADAPTER_ATTRIBUTE} does not satisfy the SourceAdapter protocol "
            "(a PRD §40.7 boundary is missing)"
        )
    return adapter
