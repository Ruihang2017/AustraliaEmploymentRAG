---
id: disclaimer
title: "Product disclaimer"
version: "0.1.0"
status: DRAFT_PENDING_FOUNDER_CONTENT
effective_date: null
owner: Founder
legal_review: LEGAL_REVIEW_PENDING
last_reviewed: null
applies_to: [web-app, widget, exports, public-site]
prd_basis:
  - "§11.1"
  - "§11.2"
  - "§6.5"
  - "§6.6"
  - "§8.9"
  - "§8.10"
  - "§12.1"
  - "§12.3"
  - "§13.4"
  - "§15.2"
  - "§44.4"
short_form: >-
  This product provides information, evidence-grounded research and conditional
  guidance, not legal representation. It does not state that a customer is
  definitely compliant. Check each cited source against the official publication
  before relying on it.
export_form: >-
  This export was produced by taxrag. The product provides information,
  evidence-grounded research and conditional guidance, not legal representation,
  and it does not state that a customer is definitely compliant. The export
  reflects the recorded legal date and corpus release and is not regenerated
  against current law. Source freshness, source licensing and source coverage
  limits apply. Check each cited source against the official publication before
  relying on it.
---

# Product disclaimer

The four statements of PRD §11.2 are the body of this document. `short_form` and `export_form` in the
frontmatter above are the exact strings every surface renders; no surface composes its own wording
(see `claim-language/required-strings.json`).

## What this product does

The product provides information, evidence-grounded research and conditional guidance, not legal
representation (PRD §11.2). Clear disclaimers are included in the Web app, widget and exports
(PRD §11.2), and the disclaimer, citations and product-source indicator are not removable by customer
theming (PRD §8.10).

## What it does not do

It is not legal representation (PRD §11.2). It does not state that a customer is definitely compliant
(PRD §11.2).

## Point-in-time and legal-date limits

Every query carries a `legal_as_at` date, and an Answer Snapshot also carries `knowledge_cutoff_at`
and `corpus_release_id` (PRD §15.2). At MVP launch, point-in-time retrieval supports 2026-27, 2025-26
and 2024-25 (PRD §6.6). Future and proposed material — bills, explanatory memoranda, enacted but not
commenced amendments, draft instruments, consultations and commencement proclamations — is stored and
searchable but separated from current-law answers and visibly labelled (PRD §6.5). An export preserves
the legal date, corpus release, claims, citations, assumptions, limitations and correction status, and
is not regenerated against current law (PRD §8.9).

## Source freshness limits

The target is to detect official change within 24 hours and normally process, validate and publish
within a further 24 hours (PRD §12.1). Sources without reliable delta mechanisms are shown as
`FRESHNESS_LIMITED` rather than a false guarantee (PRD §12.1). Customer-visible source metadata
separates last discovery check, last successful change scan, last full reconciliation, last content
ingestion and freshness status (PRD §12.1).

## Source licensing limits

Unclear rights default to metadata, limited quotation and official links (PRD §11.1). Third-party
commercial headnotes are not reproduced and government endorsement is not implied (PRD §11.1).
Customer exports apply the same restrictions, and licensing rules restrict excerpt length in exports
(PRD §11.1, PRD §8.9).

## Coverage limits

The capacity figures of PRD §13.4 are a tested system baseline, not a single-customer entitlement or
unlimited-capacity promise. Where a source group is in a technically or licensing-limited state, that
limitation is visible and relevant answers safely warn or refuse; a source category that is not
implemented is never silently described as covered (PRD §44.4).

## What to do if something looks wrong

Incorrect citations, outdated sources, wrong jurisdiction or date, unsupported claims, missing
authority and privacy issues can be reported at answer, claim, citation and source level (PRD §12.3).
A confirmed error creates a Correction, preserves the original answer, creates or links a replacement
Answer Snapshot, runs impact analysis and notifies affected customers when required (PRD §12.3).
