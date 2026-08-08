# Vendored OpenAPI 3.1 meta-schema

`FND-04`'s Harness paragraph requires the meta-schema to be *"vendored or pinned so validation runs
offline"*, and acceptance item 1 (*"validates against the OpenAPI 3.1 meta-schema"*) must therefore
hold with no network access. This directory holds the vendored copy, and nothing in this repository
fetches a schema at runtime.

| Field | Value |
|---|---|
| File | `oas-3.1-schema-2022-10-07.json` |
| Source | <https://spec.openapis.org/oas/3.1/schema/2022-10-07> |
| `$id` | `https://spec.openapis.org/oas/3.1/schema/2022-10-07` |
| Revision | `2022-10-07` — the dated, immutable OAS 3.1 schema release |
| Dialect | JSON Schema 2020-12 (`$schema: https://json-schema.org/draft/2020-12/schema`) |
| Licence | Apache License 2.0 — the OpenAPI Initiative licenses the OpenAPI Specification and its schemas under Apache-2.0 (<https://github.com/OAI/OpenAPI-Specification/blob/main/LICENSE>) |
| Vendored on | 2026-08-08 |
| Modification | Re-serialised as `JSON.stringify(schema, null, 2)` with a trailing newline and LF line endings. **No key, value or structure was changed.** |

This is the *"description of OpenAPI v3.1.x documents **without** schema validation"* variant: it
validates the document's OpenAPI structure and treats every Schema Object as an opaque JSON Schema.
That is the right variant here because the Schema Objects are validated separately and far more
strictly — `packages/contracts/test/openapi/prd-34-examples.test.ts` compiles each one with Ajv 2020
and validates the PRD §34 normative example against it.

The file is self-contained: it uses `$dynamicAnchor`/`$dynamicRef` internally and carries **no**
external `$ref`, so Ajv's 2020-12 entry point (`ajv/dist/2020`) compiles it without any network or
companion document.

## Updating it

A meta-schema bump is an explicit, reviewed commit, exactly like a baseline advance
(`../baseline/README.md`): download the new dated revision, re-serialise it the same way, update the
table above, and run `pnpm --filter @taxrag/contracts test`. It is never a side effect of
`pnpm generate` — `packages/contracts/src/openapi/generate.mjs` writes only under
`packages/contracts/src/generated/`, which `test/generated/determinism.test.ts` asserts.

## Source and licence impact

`FND-04`'s acceptance item 16 originally read *"source/licence impact (none)"*. Vendoring this file
falsifies that, so the ticket and sub-PRD decision **D28** record the corrected statement: **one
vendored Apache-2.0 schema document**, redistributed unmodified apart from re-serialisation, plus the
three pinned `devDependencies` (`ajv`, `ajv-formats`, `yaml`) the Harness requires.
