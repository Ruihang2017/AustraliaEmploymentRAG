# `docs/policies/` changelog

Every content change to a policy document bumps that document's frontmatter `version` and adds a line
here. `LNCH-02` and `LNCH-03` render the version and effective date, so a silent edit is visible
downstream. A change to a `legal-review-register` row status is a Founder action and is recorded here
too (see [`legal-review-register.md`](./legal-review-register.md)).

- **v0.1 — 2026-08-03 — initial structure; all documents `DRAFT_PENDING_FOUNDER_CONTENT`;
  `LEGAL_REVIEW_PENDING` opened for four documents and three surfaces.** (`LNCH-01`.) Ships the
  frontmatter schema, the four PRD §11.2 documents with every required section present as either a
  PRD-cited product fact or a `FOUNDER_INPUT_REQUIRED` marker, the claim-language rule set and
  required-strings map, the standing risk register and the dependency-free checker. No substantive
  legal text: warranties/liability/indemnity, governing law, changes to terms, parties/definitions,
  contact details, lawful basis, subprocessors, breach notification and the security-testing
  disclosure address are all outstanding Founder input.
