---
id: terms-of-service
title: "Terms of Service"
version: "0.1.0"
status: DRAFT_PENDING_FOUNDER_CONTENT
effective_date: null
owner: Founder
legal_review: LEGAL_REVIEW_PENDING
last_reviewed: null
applies_to: [web-app, public-site, api]
prd_basis:
  - "§10.1"
  - "§10.2"
  - "§10.3"
  - "§10.4"
  - "§11.1"
  - "§11.2"
  - "§12.4"
  - "§13.2"
  - "§13.3"
  - "§20.2"
  - "§24.2"
  - "§24.3"
  - "§24.4"
  - "§38.4"
  - "§38.5"
  - "§41.4"
  - "§42.5"
---

# Terms of Service

Draft. Every section below is either a statement of a product fact fixed by the PRD, with its section
cited inline, or a single `FOUNDER_INPUT_REQUIRED` marker. No clause here was invented.

## Parties and definitions

<!-- FOUNDER_INPUT_REQUIRED: name the contracting entities (supplier legal name and ABN, and the customer entity) and define the defined terms this document uses. PRD §45.5 classifies this as a Product change requiring founder approval; it cannot be derived from the PRD. -->

## What the service is and is not

The product provides information, evidence-grounded research and conditional guidance, not legal
representation (PRD §11.2). It does not state that a customer is definitely compliant (PRD §11.2).
Clear disclaimers are included in the Web app, widget and exports (PRD §11.2); the exact strings are
the `short_form` and `export_form` fields of `disclaimer.md`.

## Eligibility and invite-only access

Access is by invitation. The trial is an invitation-only 14-day trial with five users, one service
account, 1,000 Search, 20 Quick, two Deep, five watchlists, 500 API calls and a sandbox widget. After
expiry, records remain read-only for 30 days unless earlier deletion is requested, and trial usage
cannot exceed the founder-funded circuit breaker (PRD §24.2).

## Pilot scope and limits

The default paid-pilot scope and its numeric limits are the product facts of PRD §24.3. They are
restated once, in the onboarding pack owned by `LNCH-04`; this document references them rather than
duplicating them. The first customer contract may adjust them manually, and public self-service
pricing is deferred (PRD §24.3).

## Acceptable use

Use of the product is governed by the Acceptable Use Policy in `acceptable-use-policy.md`. Its rules
are the restrictions PRD §10.1, §11.1, §20.2, §38.4 and §38.5 already fix, not additional terms
invented here.

## Customer content, ownership and use

Customer queries and records are not used for training, evaluation or manual product analysis by
default; anonymised improvement or shadow use requires explicit opt-in (PRD §10.2). Provider
configurations use no-training and zero or approved minimal retention (PRD §10.2). Subprocessors and
transient cross-border processing are disclosed (PRD §10.2). The server is the authoritative PII
boundary before logging, persistence or provider calls, and customers must not submit actual employee
names, private contact or address data, TFNs, bank details, employee or payroll identifiers, precise
birth dates or identifying combinations (PRD §10.1).

## Retention and deletion

Research Records and Answer Snapshots are retained until customer deletion or organisation closure.
Ordinary application logs are retained 14 days. Security and audit events are retained 12 months.
Deleted customer records have a 30-day recoverable period and are then deleted from primary storage.
Deleted data in backups ages out within a further maximum of 30 days. Organisation closure is an
export followed by deletion within 30 days. API request and response bodies are not logged by default
(PRD §10.3). Ephemeral content expires one hour after completion, failure or cancellation and no later
than 24 hours after creation, does not enter Litestream, daily or weekly backups, exports or support
tools, and is not recoverable after expiry (PRD §10.4).

## Availability and support position

Availability is a 99.5% internal objective; there is no contractual SLA (PRD §13.2). If a performance
goal cannot be met without violating evidence quality, cost or safety, the product preserves
correctness and surfaces delay or degraded status (PRD §13.2). Support is by email and in-app issue
reporting, with a public status page independent of the origin server. The target response is within
two business days, critical incidents are handled on a best-effort same-business-day basis, and there
is no phone or 24/7 support (PRD §13.3).

## Fees, invoicing and payment

The first paid pilot is contracted and invoiced manually: the Founder provides manual pilot terms, the
privacy, acceptable-use and disclaimer copy, the limits, the support position and the no-SLA position,
and the commercial criterion is met on voluntary payment or invoice acceptance (PRD §41.4). Customer
variable model cost is prepaid or BYOK; the system does not create unsecured founder liability
(PRD §24.4).

## Warranties, liability and indemnity

<!-- FOUNDER_INPUT_REQUIRED: author the warranty position, the limitation and exclusion of liability, and the indemnity position. PRD §45.5 makes this a Product change requiring founder approval, and the LNCH-01 Non-goals forbid a coding agent from drafting it. A plausible-looking invented clause is worse than an empty one. -->

## Suspension, kill switches and termination

Kill switches are scoped, and each scope has a defined admission behaviour and treatment of existing
work: model profile or provider, Deep Research, corpus release or source or jurisdiction, ingestion
and promotion, webhooks, tenant or key, and global generation. A tenant or key switch denies only the
named scope and preserves records and audit. Kill switches expire or require review at the recorded
time, and no switch deletes content or bypasses retention or audit (PRD §42.5). Incident states are
`INVESTIGATING`, `IDENTIFIED`, `MITIGATING`, `MONITORING` and `RESOLVED` (PRD §12.4).

## Governing law and jurisdiction

<!-- FOUNDER_INPUT_REQUIRED: choose the governing law, the jurisdiction for disputes and the dispute-resolution path. PRD §45.5 Product change; no PRD section fixes it. -->

## Changes to these terms

<!-- FOUNDER_INPUT_REQUIRED: set the notice period for a change to these terms and the mechanism by which a changed version takes effect for an existing pilot customer. PRD §45.5 Product change. Note that the document version and effective date in the frontmatter are rendered by LNCH-02 and LNCH-03, so a change is visible downstream. -->

## Contact

<!-- FOUNDER_INPUT_REQUIRED: supply the contact entity, postal address and the notice and support email addresses. PRD §13.3 fixes the support channels (email and in-app issue reporting) but no address exists anywhere in the repository. -->
