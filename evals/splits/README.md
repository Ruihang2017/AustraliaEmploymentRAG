# `evals/splits` — frozen dataset contract data

Owned by `GOLD-01`. Everything here is data the checker reads; none of it is code, and none of it
lists a case id.

| File | What it is |
|---|---|
| `allocation.yaml` | The PRD §43.1 table as frozen data — ten category rows and the totals 360/120/120/600. `ALLOCATION_EXACT` compares the composed dataset against it **exactly**, never "at least". |
| `id-rules.yaml` | `EVAL-<CAT>-<NNN>`, the ten fixed codes, and the uniqueness/never-reuse rules (sub-PRD **D5**). |
| `blind-recipient.pub` | The **public** half of the blind-dataset recipient key. See the warning below. |
| `dataset-versions/<v>.json` | The sub-PRD **D8** version registry. Written by `version new`, never by hand. |
| `migrations/` | The sub-PRD **D8** migration records. Written by `migrate`, never by hand. |

**No case ids live here (sub-PRD D4).** Splits are *composed* from `evals/cases/<slug>/`, so ten
authoring tickets never contend on one file. `test_allocation_frozen.py::test_splits_hold_no_case_id`
asserts it, and that assertion is not a formality — a central index is what the decision avoids.

## `blind-recipient.pub` is a placeholder, and must be replaced before any real blind material is sealed

The committed value is a **development placeholder** whose private half is publicly derivable — the
file says exactly how. It protects nothing, by design, so it can never be mistaken for a key that
does. It exists only so the sealing mechanism is complete and reviewable.

Replacing it is the Founder's custodial act (GOLD-01's single `[human]` acceptance item; breakdown
plan §8 **Q6**; sub-PRD **D22**): generate an X25519 pair offline, publish only the public half here
with a `key_id` that does **not** start with `dev-`, and re-seal every blind envelope through a new
dataset version. The private half lives in the Founder's password manager or equivalent offline
encrypted storage with one encrypted recovery copy, and never in git, CI, ordinary environment
configuration or any agent environment. A Builder must never generate that pair inside an agent
session.

`GOLD-15` and `GOLD-17` must not run a blind stage until it has been replaced.
