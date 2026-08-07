# `LEGAL_REVIEW_PENDING` register

**No ticket may set a row `status` to anything other than `OPEN`.** Changing a status is a Founder
action and is recorded in [`CHANGELOG.md`](./CHANGELOG.md). PRD §11.2 requires `LEGAL_REVIEW_PENDING`
to "remain an explicit launch risk and be revisited when revenue permits"; PRD §27 fixes the
mitigation as draft policies plus a retained risk, not as reviewed law; PRD §26 makes the disclosure a
Definition-of-Done item. Paid legal review is explicitly **not** a release blocker.

**Disclosure is `INTERNAL_ONLY`.** This register, and the `LEGAL_REVIEW_PENDING` token itself, must
never appear on a customer surface. `check-policies.mjs` enforces that with the
`legal-review-pending-leak` rule.

This Markdown file is the human view. [`legal-review-register.json`](./legal-review-register.json) is
the machine view and the source; `LNCH-05` reads the JSON for its `DOD-SEC-04` closure record.
`check-policies.mjs` cross-checks the two (rule `register-drift`), so they cannot diverge silently.

One row exists for each of the four PRD §11.2 documents and for each of the three PRD §11.2 surfaces
(Web app, widget, exports).

| id | subject | risk | status | owner | review trigger | disclosure | PRD ref | first recorded |
|---|---|---|---|---|---|---|---|---|
| `LRP-DOC-TERMS-OF-SERVICE` | `terms-of-service.md` | The Terms of Service ship without paid legal review. Warranty, liability, indemnity, governing law and change-of-terms positions are unwritten, so a paying pilot customer would contract on incomplete terms and the founder would carry uncapped, unadvised exposure. | `OPEN` | Founder | when revenue permits | `INTERNAL_ONLY` | §11.2, §26, §27 | 2026-08-03 |
| `LRP-DOC-PRIVACY-POLICY` | `privacy-policy.md` | The Privacy Policy ships without paid legal review. Lawful basis, breach-notification commitments and the confirmed subprocessor and cross-border list are unwritten, so the disclosure PRD §10.2 requires may be incomplete and the Australian Privacy Principles position is unverified. | `OPEN` | Founder | when revenue permits | `INTERNAL_ONLY` | §10.2, §11.2, §19.2, §26 | 2026-08-03 |
| `LRP-DOC-ACCEPTABLE-USE-POLICY` | `acceptable-use-policy.md` | The Acceptable Use Policy ships without paid legal review. Its restrictions are transcribed product facts with no reviewed enforcement or remedy wording, and the coordinated-disclosure address for security testing does not yet exist. | `OPEN` | Founder | when revenue permits | `INTERNAL_ONLY` | §11.2, §21.1, §26 | 2026-08-03 |
| `LRP-DOC-DISCLAIMER` | `disclaimer.md` | The disclaimer copy, including the short_form and export_form strings every surface renders, ships without paid legal review. If the wording is legally insufficient, every rendered surface inherits the defect at once because all of them read these two fields. | `OPEN` | Founder | when revenue permits | `INTERNAL_ONLY` | §11.2, §8.9, §8.10, §26 | 2026-08-03 |
| `LRP-SURFACE-WEB-APP` | `web-app` | PRD §11.2 requires a clear disclaimer in the Web app. The rendered text is unreviewed draft copy, so a customer may read a research answer as advice on the surface where the most reading happens. | `OPEN` | Founder | when revenue permits | `INTERNAL_ONLY` | §11.2, §26 | 2026-08-03 |
| `LRP-SURFACE-WIDGET` | `widget` | PRD §11.2 requires a clear disclaimer in the widget, which renders inside a third-party site where the product's identity is least obvious. Unreviewed copy on an embedded surface carries the highest risk of being read as the host's own advice. | `OPEN` | Founder | when revenue permits | `INTERNAL_ONLY` | §11.2, §8.10, §26 | 2026-08-03 |
| `LRP-SURFACE-EXPORTS` | `exports` | PRD §11.2 requires a clear disclaimer in exports. An export is a detached artifact that outlives its context and may be forwarded to a third party, so unreviewed export_form copy travels furthest and cannot be corrected in place. | `OPEN` | Founder | when revenue permits | `INTERNAL_ONLY` | §11.2, §8.9, §26 | 2026-08-03 |

## How a row is closed

Only by the Founder, after a completed paid review, as a docs change that:

1. edits the row in `legal-review-register.json` **and** the matching row above;
2. adds a dated line to `CHANGELOG.md` naming what was reviewed and by whom;
3. bumps the `version` of every policy document the review changed.

`LNCH-05`'s `DOD-SEC-04` record must reflect whatever state this register is actually in. A ticket
that closes a row on its own authority is out of scope of this module and of PRD §11.2.
