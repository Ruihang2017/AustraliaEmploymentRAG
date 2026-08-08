# demo-no-adapter-py

A synthetic adapter group with no `adapter.py` (INGF-01 test fixture). `iter_adapter_dirs()` skips
it and `load_adapter()` raises `AdapterLoadError` for it.
