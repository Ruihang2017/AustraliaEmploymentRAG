/**
 * EVID-02 deliverable 3 — the optional pinned-model recogniser, behind the same port.
 *
 * OFF BY DEFAULT, WITHOUT AN ENVIRONMENT READ. Nothing constructs this: `PII_STAGES` (the exported
 * default in `src/context/stages.ts`) always holds the deterministic recogniser, and a model arrives
 * only when a caller passes one to `createPiiStages`. That is stronger than the ticket's *"enabling
 * it is explicit configuration"* — there is no switch to leave on by mistake — and it is why this
 * ticket needs no exception to the determinism acceptance item (PRD §39.1, §45.2).
 *
 * IT NEVER FALLS BACK TO SILENCE-AS-SUCCESS. When the load outcome is not `READY`, or when a model
 * call throws, the recogniser appends nothing and `readiness()` says so. It never accepts, never
 * suppresses and never re-categorises: like every stage-4 implementation it can only append.
 *
 * `EntityModelPort` IS STRUCTURAL. No library type crosses into this package (and none could — see
 * `loader.ts`), so swapping the runtime the ADR selects is a change at the host, not here.
 */
import type { PiiFinding } from '../../contract/finding.js';
import type { StageInput } from '../../contract/pipeline.js';
import { findingAt } from '../../deterministic/detectors/shared.js';
import type { EntityReadiness, EntityRecogniser } from '../port.js';
import type { LoadOutcome } from './loader.js';

export interface EntityModelSpan {
  /** NFC character offsets over the field value — the same space `PiiFinding` uses. */
  readonly start: number;
  readonly end: number;
  readonly label: string;
  readonly score: number;
}

export type EntityModelPort = (text: string) => readonly EntityModelSpan[];

/** Labels this recogniser treats as a person. Anything else is ignored, not guessed at. */
export const PERSON_LABELS: readonly string[] = Object.freeze(['PER', 'PERSON', 'B-PER', 'I-PER']);

/** Below this the span is not reported. A score never *removes* a finding — see the header. */
export const MINIMUM_SCORE = 0.5;

export function createRuntimeRecogniser(
  model: EntityModelPort,
  outcome: LoadOutcome,
): EntityRecogniser {
  // Instance-local, never module-scope: two recognisers, and two concurrent requests through one
  // recogniser, cannot influence each other's findings — only this instance's reported readiness.
  let degraded = false;

  const recognise = (input: StageInput, findings: readonly PiiFinding[]): readonly PiiFinding[] => {
    if (outcome.state !== 'READY') return findings;
    const added: PiiFinding[] = [];
    for (const view of input.views.values()) {
      let spans: readonly EntityModelSpan[];
      try {
        spans = model(view.nfc);
      } catch {
        degraded = true;
        return findings;
      }
      for (const span of spans) {
        if (!PERSON_LABELS.includes(span.label)) continue;
        if (span.score < MINIMUM_SCORE) continue;
        if (!Number.isInteger(span.start) || !Number.isInteger(span.end)) continue;
        if (span.start < 0 || span.end > view.nfc.length || span.end <= span.start) continue;
        added.push(
          findingAt(
            view,
            { start: span.start, end: span.end },
            'EMPLOYEE_OR_PRIVATE_INDIVIDUAL_NAME',
          ),
        );
      }
    }
    return added.length === 0 ? findings : [...findings, ...added];
  };

  const readiness = (): EntityReadiness => {
    if (outcome.state !== 'READY') return 'UNAVAILABLE';
    return degraded ? 'DEGRADED' : 'READY';
  };

  return { recognise, readiness };
}
