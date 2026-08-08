"""A VALID adapter module inside a `_`-prefixed directory (INGF-01 fixture).

`iter_adapter_dirs()` must skip it because of the `_` prefix (sub-PRD D5: `_shared/**` is shared
code, not an adapter group) — not because it is unloadable. Making this fixture valid is what proves
the skip rule is the prefix and nothing else.
"""

from __future__ import annotations


class SharedNotAnAdapter:
    meta = None

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


ADAPTER = SharedNotAnAdapter()
