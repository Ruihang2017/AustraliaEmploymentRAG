# CRPS-05 golden embedding manifest

`embedding-manifest.json` here is the manifest produced by an end-to-end stub build over the
committed corpus fixture (`embedding_fixtures.build_corpus`, default tier selection). It is
compared member-for-member by `test_embed_golden.py`.

Regenerate with:

```
PYTHONPATH=pipelines/embeddings/src uv run python \
    pipelines/embeddings/tests/fixtures/golden/regenerate.py
```

Never hand-edit it. A diff here is a behaviour change, and reviewing the diff is the point.

## Three members are normalised out of the comparison, and why

| Member | Why it cannot be pinned |
|---|---|
| `built_at` | A timestamp. The ticket's own criterion says "excluding timestamps". |
| `vector_file.sha256` | The stub VECTORS are deterministic, but the USearch FILE's bytes depend on the library build and the platform — CI is `ubuntu-latest`, development is Windows. A golden that embedded this hash would fail on one of the two. It is additionally unavailable whenever the backend is absent (see `test_embed_vector_file.py` on the FND-01 dependency gap), in which case the fake writer's own serialisation is hashed instead. |
| `vector_file.byte_size` | Same reason: it is a property of the file format, not of the embedding run. |

`vector_file.count` is NOT normalised out. It is the number of vectors, which is a property of the
run and is exactly what acceptance item 6 ties to the `chunk_embedding` row count — pinning it is
the point of keeping the rest of `vector_file` in the comparison.

This is recorded as a ticket writeback candidate: the `[fixture]` acceptance criterion says
"reproduces the recorded golden manifest (excluding timestamps)", and two more members have to be
excluded for the reason above.
