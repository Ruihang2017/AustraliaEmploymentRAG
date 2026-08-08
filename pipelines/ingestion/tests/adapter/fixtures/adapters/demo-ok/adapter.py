"""A synthetic, conforming adapter group (INGF-01 test fixture — not a real source).

Implements the eight PRD §40.7 boundaries and exposes module-level `ADAPTER`, so it is both the
positive control for `load_adapter()` and the clean control for the architecture scan. Stdlib only:
no HTTP library, no sqlite, no `packages.*` import.
"""

from __future__ import annotations

from taxrag_pipeline_ingestion.adapter import AdapterMeta


class DemoAdapter:
    meta = AdapterMeta(
        group_id="DEMO_OK",
        adapter_key="demo_ok",
        jurisdiction="AU_CTH",
        authority_id="DEMO",
        adapter_version="0.0.1",
        supported_content_types=("text/html",),
        declared_quarantine_reasons=(),
    )

    def discover(self, ctx, cursor, since):
        return ()

    def fetch(self, ctx, descriptor, validators):
        raise NotImplementedError

    def identify(self, ctx, artifact):
        raise NotImplementedError

    def parse(self, ctx, artifact):
        raise NotImplementedError

    def normalise(self, ctx, parsed, identity):
        raise NotImplementedError

    def extract_events(self, ctx, normalised):
        return ()

    def extract_relations(self, ctx, normalised):
        return ()

    def validate(self, ctx, candidate, prior):
        raise NotImplementedError


ADAPTER = DemoAdapter()
