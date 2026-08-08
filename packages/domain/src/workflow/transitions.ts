/**
 * The PRD §32.6 allowed-transition table as data (FND-08 deliverable 1).
 *
 * PRD §32.6 (docs/PRD.md lines 1674-1682) has seven rows, two of which use wildcards ("Any active
 * state", "Any non-archived"). `ARCHIVED` is the only non-active state, so both wildcards denote
 * `{DRAFT, IN_REVIEW, CUSTOMER_REVIEWED, REVIEW_REQUIRED}` minus the self-transition, giving exactly
 * **twelve** ordered pairs. That expansion is an interpretation; it is stated in the FND-08 ticket's
 * Background and transcribed alongside the verbatim rows in
 * `test/workflow/prd-32-6-transitions.json`, so a reviewer can check it against the PRD by hand.
 *
 * Every other ordered pair of the five states — including all five self-transitions — is invalid.
 * The machine is closed by construction: `canTransition` does a `Map` lookup and has no fallback
 * branch, so adding a `RecordWorkflowState` member in FND-03 without adding its rows fails the
 * enum-coverage test rather than silently allowing or denying (FND-08 acceptance item 9).
 */
import type { WorkflowActor } from './actors.js';
import type { WorkflowCondition } from './conditions.js';
import type { RecordWorkflowState } from './contracts.js';

export interface WorkflowTransition {
  readonly from: RecordWorkflowState;
  readonly to: RecordWorkflowState;
  /** The §32.6 Actor column for the row this pair was expanded from. */
  readonly allowedActors: readonly WorkflowActor[];
  /** The §32.6 Condition column for that row — every one of these must be satisfied. */
  readonly conditions: readonly WorkflowCondition[];
  /** The PRD §32.6 table row (1-7) this ordered pair was expanded from — the fixture replay key. */
  readonly prdRow: 1 | 2 | 3 | 4 | 5 | 6 | 7;
}

/** Deep-freeze one row: `Object.freeze` is shallow, and a frozen array of mutable rows is not frozen. */
function freezeTransition(transition: WorkflowTransition): WorkflowTransition {
  Object.freeze(transition.allowedActors);
  Object.freeze(transition.conditions);
  return Object.freeze(transition);
}

/**
 * Contextually types the table literal as `WorkflowTransition[]` (so a typo in a state, actor or
 * condition is a compile error rather than a widened `string`) and deep-freezes the result.
 */
function defineTransitions(list: readonly WorkflowTransition[]): readonly WorkflowTransition[] {
  return Object.freeze(list.map(freezeTransition));
}

/**
 * Exactly the twelve ordered pairs, in the order of the FND-08 ticket's expansion table.
 *
 * Actors and conditions are taken verbatim from the §32.6 row that generated each pair, which is why
 * `IN_REVIEW → DRAFT` lists `reviewer` before `owner` (the row reads "reviewer/owner") while
 * `REVIEW_REQUIRED → IN_REVIEW` lists `owner` before `reviewer` ("owner/reviewer").
 */
export const TRANSITIONS: readonly WorkflowTransition[] = defineTransitions([
    // Row 1 — | `DRAFT` | `IN_REVIEW` | owner/researcher | reviewer assigned; at least one saved answer |
    {
      from: 'DRAFT',
      to: 'IN_REVIEW',
      allowedActors: ['owner', 'researcher'],
      conditions: ['REVIEWER_ASSIGNED', 'AT_LEAST_ONE_SAVED_ANSWER'],
      prdRow: 1,
    },
    // Row 2 — | `IN_REVIEW` | `DRAFT` | reviewer/owner | reason required |
    {
      from: 'IN_REVIEW',
      to: 'DRAFT',
      allowedActors: ['reviewer', 'owner'],
      conditions: ['REASON_REQUIRED'],
      prdRow: 2,
    },
    // Row 3 — | `IN_REVIEW` | `CUSTOMER_REVIEWED` | reviewer | explicit disclaimer acknowledgement |
    {
      from: 'IN_REVIEW',
      to: 'CUSTOMER_REVIEWED',
      allowedActors: ['reviewer'],
      conditions: ['DISCLAIMER_ACKNOWLEDGED'],
      prdRow: 3,
    },
    // Row 4 — | Any active state | `REVIEW_REQUIRED` | system/admin/reviewer | correction, source
    //          change or material issue; reason required |   (expanded: DRAFT, IN_REVIEW,
    //          CUSTOMER_REVIEWED; REVIEW_REQUIRED → REVIEW_REQUIRED excluded as a self-transition)
    {
      from: 'DRAFT',
      to: 'REVIEW_REQUIRED',
      allowedActors: ['system', 'admin', 'reviewer'],
      conditions: ['MATERIAL_TRIGGER', 'REASON_REQUIRED'],
      prdRow: 4,
    },
    {
      from: 'IN_REVIEW',
      to: 'REVIEW_REQUIRED',
      allowedActors: ['system', 'admin', 'reviewer'],
      conditions: ['MATERIAL_TRIGGER', 'REASON_REQUIRED'],
      prdRow: 4,
    },
    {
      from: 'CUSTOMER_REVIEWED',
      to: 'REVIEW_REQUIRED',
      allowedActors: ['system', 'admin', 'reviewer'],
      conditions: ['MATERIAL_TRIGGER', 'REASON_REQUIRED'],
      prdRow: 4,
    },
    // Row 5 — | `REVIEW_REQUIRED` | `IN_REVIEW` | owner/reviewer | replacement/rerun linked |
    {
      from: 'REVIEW_REQUIRED',
      to: 'IN_REVIEW',
      allowedActors: ['owner', 'reviewer'],
      conditions: ['REPLACEMENT_OR_RERUN_LINKED'],
      prdRow: 5,
    },
    // Row 6 — | Any non-archived | `ARCHIVED` | owner/admin | confirmation; watches optionally
    //          retained |   ("watches optionally retained" is a flag on the transition input
    //          (`retainWatches`), not a separate transition — see apply-transition.ts)
    {
      from: 'DRAFT',
      to: 'ARCHIVED',
      allowedActors: ['owner', 'admin'],
      conditions: ['CONFIRMATION'],
      prdRow: 6,
    },
    {
      from: 'IN_REVIEW',
      to: 'ARCHIVED',
      allowedActors: ['owner', 'admin'],
      conditions: ['CONFIRMATION'],
      prdRow: 6,
    },
    {
      from: 'CUSTOMER_REVIEWED',
      to: 'ARCHIVED',
      allowedActors: ['owner', 'admin'],
      conditions: ['CONFIRMATION'],
      prdRow: 6,
    },
    {
      from: 'REVIEW_REQUIRED',
      to: 'ARCHIVED',
      allowedActors: ['owner', 'admin'],
      conditions: ['CONFIRMATION'],
      prdRow: 6,
    },
    // Row 7 — | `ARCHIVED` | `DRAFT` | owner/admin | reason required |
    {
      from: 'ARCHIVED',
      to: 'DRAFT',
      allowedActors: ['owner', 'admin'],
      conditions: ['REASON_REQUIRED'],
      prdRow: 7,
    },
]);

/**
 * The index key for an ordered pair. Takes `string` rather than `RecordWorkflowState` on purpose:
 * `canTransition` is total over untrusted input and must be able to key an unknown value without a
 * cast. `->` cannot occur inside a state member (they are UPPER_SNAKE), so the key is unambiguous.
 */
export const transitionKey = (from: string, to: string): string => `${from}->${to}`;

/**
 * A `Map`, never an object literal: an object-literal index makes
 * `canTransition({ from: '__proto__', ... })` reachable through the prototype chain and could silently
 * authorise a write.
 *
 * Throws on a duplicate `from → to` pair naming it: "closed by construction" means an ambiguous table
 * cannot load at all. Exported so a test can prove the guard fires.
 */
export function buildTransitionIndex(
  list: readonly WorkflowTransition[],
): ReadonlyMap<string, WorkflowTransition> {
  const index = new Map<string, WorkflowTransition>();
  for (const transition of list) {
    const key = transitionKey(transition.from, transition.to);
    if (index.has(key)) {
      throw new Error(`duplicate workflow transition ${key} in TRANSITIONS`);
    }
    index.set(key, transition);
  }
  return index;
}

export const TRANSITION_INDEX: ReadonlyMap<string, WorkflowTransition> =
  buildTransitionIndex(TRANSITIONS);
