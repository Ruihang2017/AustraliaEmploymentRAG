---
id: acceptable-use-policy
title: "Acceptable Use Policy"
version: "0.1.0"
status: DRAFT_PENDING_FOUNDER_CONTENT
effective_date: null
owner: Founder
legal_review: LEGAL_REVIEW_PENDING
last_reviewed: null
applies_to: [web-app, public-site, api]
prd_basis:
  - "§8.9"
  - "§8.10"
  - "§10.1"
  - "§11.1"
  - "§11.2"
  - "§12.4"
  - "§20.2"
  - "§21.1"
  - "§24.4"
  - "§38.4"
  - "§38.5"
  - "§41.4"
  - "§42.5"
---

# Acceptable Use Policy

Draft. Every section below is either a statement of a product fact fixed by the PRD, with its section
cited inline, or a single `FOUNDER_INPUT_REQUIRED` marker. No clause here was invented.

## No employee PII

Actual employee names, private contact and address data, TFNs, bank details, employee and payroll
identifiers, precise birth dates and identifying combinations must not be submitted; the server blocks
them at the PII boundary before logging, persistence or provider calls (PRD §10.1). Customers must not
bypass a positive employee-PII finding (PRD §10.1). Employer names, ABNs, public business information,
public case parties and necessary role, duty and location facts may be submitted (PRD §10.1).

## No use as legal representation

The product provides information, evidence-grounded research and conditional guidance, not legal
representation (PRD §11.2). It does not state that a customer is definitely compliant (PRD §11.2).

## Source material, licensing and redistribution

Unclear rights default to metadata, limited quotation and official links (PRD §11.1). Third-party
commercial headnotes must not be reproduced and government endorsement must not be implied
(PRD §11.1). Customer exports carry the same restrictions and licensing rules restrict excerpt length;
hidden prompts and reasoning, secrets and internal licensing notes are excluded from exports
(PRD §11.1, PRD §8.9).

## Credential handling

Service credentials use a public prefix plus at least 256 bits of random secret, and only a
memory-hard or hash verifier is stored. Keys carry exact scopes, expiry and optional IP, rate or
budget restrictions; rotation creates a new key, and an optional maximum 24-hour overlap is explicit
and auditable (PRD §38.4). Widget sessions are signed, opaque-to-client authorisation tokens with a
maximum 15-minute lifetime, bound to organisation, service account, pseudonymous external user,
allowed origins, allowed features, environment, credit ceiling and unique token identifier
(PRD §38.4). Long-lived service credentials must not enter the browser, and the widget stores no token
in localStorage (PRD §8.10). Application secrets are encrypted and API and webhook credentials are
hashed, with rotation and revocation (PRD §21.1).

## Sandbox use

There is one strictly isolated sandbox organisation in production and no permanently running paid
staging server (PRD §20.2). Integration testing uses that sandbox with synthetic data: onboarding
requires the customer to complete a synthetic test and to create no long-lived browser secret
(PRD §41.4).

## Rate, quota and concurrency limits

Search burst, API calls, concurrent Quick, concurrent Deep, concurrent export, webhook endpoints and
widget session creation each have a trial boundary, a paid-pilot boundary and a separate system hard
protection (PRD §38.5). Default per-organisation concurrency is two Quick, one Deep and one export,
with separate API and search burst limits and isolated webhook queues (PRD §24.4). Rate-limit
responses carry `Retry-After`, limit, remaining and reset metadata without disclosing other tenants,
and search, answer credits, advanced-task credits, API calls and provider cost are separate ledgers
(PRD §38.5). Customer variable model cost is prepaid or BYOK (PRD §24.4).

## Security testing

<!-- FOUNDER_INPUT_REQUIRED: supply the coordinated-disclosure address and the written-permission process for security testing, and state the scope that is never in bounds. PRD §21.1 requires a security.txt and a vulnerability-reporting address, but no address exists anywhere in the repository. LNCH-01 plan OQ-1 records that this section was specified as prose plus a marker; a section may not be both, so it ships marker-only. -->

## Enforcement

Enforcement uses the scoped kill switches of PRD §42.5: model profile or provider, Deep Research,
corpus release or source or jurisdiction, ingestion and promotion, webhooks, tenant or key, and global
generation. A tenant or key switch denies only the named scope, preserves records and audit and
deletes nothing. Kill switches expire or require review at the recorded time and no switch bypasses
retention or audit (PRD §42.5). Incidents follow the `INVESTIGATING`, `IDENTIFIED`, `MITIGATING`,
`MONITORING` and `RESOLVED` states (PRD §12.4).
