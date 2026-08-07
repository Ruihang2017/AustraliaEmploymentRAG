---
id: privacy-policy
title: "Privacy Policy"
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
  - "§10.2"
  - "§10.3"
  - "§10.4"
  - "§19.2"
  - "§21.1"
  - "§21.2"
  - "§22"
  - "§41.4"
---

# Privacy Policy

Draft. Every section below is either a statement of a product fact fixed by the PRD, with its section
cited inline, or a single `FOUNDER_INPUT_REQUIRED` marker. No clause here was invented.

## What we collect and why

The service holds the organisation and user records needed to provide access, the queries and Research
Records a customer creates, and bounded operational telemetry. Operational logs are bounded JSON
records that may include technical identifiers and hashes, operation, status, latency, cost and
versions, and they exclude research and evidence content, PII text, credentials, assertions and
provider payloads (PRD §22). API request and response bodies are not logged by default (PRD §10.3).
Full-content debug logs and crash dumps are disabled by default (PRD §22).

## The PII boundary and what customers must not submit

The server is the authoritative PII boundary before logging, persistence or provider calls (PRD §10.1).
Actual employee names, private contact and address data, TFNs, bank details, employee and payroll
identifiers, precise birth dates and identifying combinations are blocked and must not be submitted
(PRD §10.1). Employer names, ABNs, public business information, public case parties and necessary
role, duty and location facts may be accepted (PRD §10.1). Customers must not bypass a positive
employee-PII finding, and if authoritative detection is unavailable free-text Ask, Compare and
Coverage fail closed (PRD §10.1).

## Lawful basis and purpose

<!-- FOUNDER_INPUT_REQUIRED: state the lawful basis and the purposes for which personal information is handled, including whether the operating entity is an APP entity and how the Australian Privacy Principles are applied. This is a legal position; PRD §45.5 makes it a Product change requiring founder approval. -->

## Customer content is not training or evaluation data

Customer queries and records are not used for training, evaluation or manual product analysis by
default. Anonymised improvement or shadow use requires explicit opt-in (PRD §10.2).

## Model providers, no-training and minimal-retention configuration

Provider configurations use no-training and zero or approved minimal retention (PRD §10.2). Evidence
is delimited as data, source instructions cannot select tools, URLs, providers or scope, and the model
has no arbitrary Web, shell, database or customer-data tools (PRD §21.1). SDK telemetry does not
contain research content (PRD §8.10).

## Subprocessors and cross-border processing

<!-- FOUNDER_INPUT_REQUIRED: confirm the definitive list of subprocessors (hosting, object storage, model providers, email and status page) and every transient cross-border processing location. PRD §10.2 requires both to be disclosed, but the list cannot be derived from the PRD. LNCH-01 plan OQ-1 records that this section was specified as prose plus a marker; a section may not be both, so it ships marker-only. -->

## Data location

Cloudflare R2 stores only public or rebuildable legal artifacts, normalised text, candidate and
archived corpus releases and indexes, and does not contain customer identities, Research Records,
answers, exports or backups. AWS S3 Sydney stores encrypted mutable customer-database recovery
material under `backups/` and private customer export artifacts under `exports/` with a seven-day
lifecycle, under separate least-privilege permissions (PRD §19.2). This split exists because R2 is
cost-effective for public corpus and egress but its Oceania placement hint is not an Australian
residency guarantee (PRD §19.2). This policy therefore makes no Australian data-residency promise.

## Retention schedule

Research Records and Answer Snapshots are retained until customer deletion or organisation closure.
Ordinary application logs are retained 14 days. Security and audit events are retained 12 months.
Deleted customer records have a 30-day recoverable period and are then deleted from primary storage.
Deleted data in backups ages out within a further maximum of 30 days. Organisation closure is an
export followed by deletion within 30 days. API request and response bodies are not logged by default.
Public legal sources and non-customer evaluation data may be retained long term (PRD §10.3). Ephemeral
content expires one hour after completion, failure or cancellation and no later than 24 hours after
creation, and does not enter Litestream, daily or weekly backups, exports or support tools (PRD §10.4).
Private export artifacts are delivered through short-lived signed URLs and deleted after seven days by
default (PRD §8.9).

## Security summary

Controls include secure HttpOnly SameSite cookies, CSRF protection, a strict content security policy,
encoding and sanitisation, exact widget origins, MFA for Owner, Admin and internal administrators,
recent authentication for sensitive operations, encrypted application secrets, hashed API and webhook
credentials with rotation and revocation, source allowlists with HTTPS and redirect checks, isolated
parser and OCR processes, pinned dependencies with lockfiles and signed manifests, and a published
`security.txt` and vulnerability-reporting address (PRD §21.1). All tenant access is scoped to a
TenantContext, and cross-organisation internal access uses a separate recent-MFA, reason-required,
audited path (PRD §21.2). This summary deliberately discloses no deployment topology.

## Access, correction, deletion and organisation closure

Deleted customer records have a 30-day recoverable period and are then deleted from primary storage;
deleted data in backups ages out within a further maximum of 30 days. Organisation closure is an
export followed by deletion within 30 days (PRD §10.3). Plan, limits, retention and region disclosures
are made when the organisation workspace is created during onboarding (PRD §41.4).

## Breach notification

<!-- FOUNDER_INPUT_REQUIRED: state the eligible-data-breach assessment process and the notification commitments, including timing, recipients and the regulator notified. This is a legal position; PRD §45.5 makes it a Product change requiring founder approval. -->

## Contact

<!-- FOUNDER_INPUT_REQUIRED: supply the privacy contact address and the complaints escalation path, including the external escalation route. No address exists anywhere in the repository. -->
