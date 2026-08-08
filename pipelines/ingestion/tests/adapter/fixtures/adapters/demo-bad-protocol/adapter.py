"""A synthetic group whose `ADAPTER` is missing `extract_relations` (INGF-01 fixture)."""

from __future__ import annotations


class IncompleteAdapter:
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

    def validate(self, ctx, candidate, prior):
        raise NotImplementedError


ADAPTER = IncompleteAdapter()
