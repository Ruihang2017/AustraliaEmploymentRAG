"""pytest entry point for the GOLD-01 dataset suite.

Everything real lives in `dataset_fixtures.py`, and the test modules import from THAT, not from
here — see its header for why a uniquely named helper module is required. Importing it here is what
puts `pipelines/evaluation/src` on `sys.path` before any test module is collected.
"""

from __future__ import annotations

import dataset_fixtures  # noqa: F401
