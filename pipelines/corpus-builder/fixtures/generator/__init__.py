"""The CRPS-08 synthetic fixture generator.

IMPORT CONVENTION. `pipelines/corpus-builder/fixtures` goes on `sys.path` and these modules are
imported as `generator.synthetic_corpus`, `generator.build_fixture`, `generator.cli`. The package
qualifier matters: pytest imports test modules by bare basename in this repository (no test
directory is a package), so an unqualified `build_fixture` would be one collision away from
whichever module was imported last.

`pipelines/corpus-builder/fixtures/` ITSELF MUST NEVER GET AN `__init__.py`.
`tools/workspace-assertions.mjs::assertSkeleton()` asserts each uv workspace member holds exactly
one immediate child directory containing `__init__.py`; for this member that is
`taxrag_pipeline_corpus_builder/`. A second one fails `pnpm test` repository-wide.
"""

from __future__ import annotations

__all__: tuple[str, ...] = ()
