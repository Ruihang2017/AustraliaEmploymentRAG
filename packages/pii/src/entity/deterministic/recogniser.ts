/**
 * EVID-02 deliverable 2 — the shipped default recogniser (PRD §37.2 stage 4).
 *
 * NO MODEL ARTIFACT, SO NO FAILURE MODE. `readiness()` returns `'READY'` unconditionally, and that
 * is honest rather than optimistic: this recogniser loads nothing, opens nothing and depends on
 * nothing that can be missing. The port's other implementation
 * (`src/entity/runtime/recogniser.ts`) is the one whose readiness can degrade. Sub-PRD `Q-EVID-1`'s
 * own "Blocks" cell states the consequence this makes true: *"CI never needs a model"*.
 *
 * IT ONLY EVER APPENDS. PRD §37.2 puts the deterministic stage first and PRD §10.1 says the three
 * techniques *"MUST combine"*, not "may override": nothing here can shrink, re-categorise or
 * downgrade a finding produced by stage 3. `test/entity/override.test.ts` asserts it as a property.
 *
 * BYTE-STABLE OUTPUT. Candidates are deduplicated on `(field, start, end, category)` — including
 * against the findings already present, so a labelled name found by `EVID-01` is not reported twice —
 * and sorted by (field order, start, end). Overlapping `ADVISORY` spans in one field are MERGED,
 * because `src/deterministic/sanitize.ts` replaces advisory spans right-to-left with no overlap
 * handling, and two overlapping advisory findings would garble the sanitized payload.
 */
import type { PiiFinding } from '../../contract/finding.js';
import type { StageInput } from '../../contract/pipeline.js';
import type { ScanView } from '../../deterministic/normalise.js';
import { spanOfScanRange } from '../../deterministic/normalise.js';
import { findingAt } from '../../deterministic/detectors/shared.js';
import type { EntityRecogniser, EntityRuleName } from '../port.js';
import { candidatesIn, ruleByName } from './rules.js';

const NAME_CATEGORY = 'EMPLOYEE_OR_PRIVATE_INDIVIDUAL_NAME';

function severityOf(rule: EntityRuleName): 'BLOCKING' | 'ADVISORY' {
  return ruleByName(rule)?.severity ?? 'BLOCKING';
}

/** Merge overlapping/abutting advisory spans in one field into one span (see the header). */
function mergeAdvisory(view: ScanView, advisory: readonly PiiFinding[]): PiiFinding[] {
  const sorted = [...advisory].sort((left, right) => left.start - right.start);
  const merged: PiiFinding[] = [];
  for (const finding of sorted) {
    const last = merged[merged.length - 1];
    if (last && finding.start <= last.end) {
      merged[merged.length - 1] = { ...last, end: Math.max(last.end, finding.end) };
      continue;
    }
    merged.push(finding);
  }
  return merged.map((finding) => ({ ...finding, field: view.field }));
}

export function recogniseIn(
  view: ScanView,
  findings: readonly PiiFinding[],
): readonly PiiFinding[] {
  const blocking: PiiFinding[] = [];
  const advisory: PiiFinding[] = [];
  for (const candidate of candidatesIn(view, findings)) {
    const span = spanOfScanRange(view, candidate.start, candidate.end);
    const severity = severityOf(candidate.rule);
    const finding = findingAt(view, span, NAME_CATEGORY, severity);
    (severity === 'ADVISORY' ? advisory : blocking).push(finding);
  }
  return [...blocking, ...mergeAdvisory(view, advisory)];
}

/**
 * The default `EntityRecogniser`. A plain frozen object: no state, no cache, no counter, so two
 * concurrent `apps/api` requests cannot influence each other through it.
 */
export function createDeterministicRecogniser(): EntityRecogniser {
  return Object.freeze({
    recognise: (input: StageInput, findings: readonly PiiFinding[]): readonly PiiFinding[] => {
      const seen = new Set<string>();
      for (const finding of findings) {
        seen.add(`${finding.field} ${String(finding.start)} ${String(finding.end)} ${finding.category}`);
      }

      const added: PiiFinding[] = [];
      const order = new Map<string, number>();
      let index = 0;
      for (const [field, view] of input.views) {
        order.set(field, index);
        index += 1;
        for (const finding of recogniseIn(view, findings)) {
          const key = `${finding.field} ${String(finding.start)} ${String(finding.end)} ${finding.category}`;
          if (seen.has(key)) continue;
          seen.add(key);
          added.push(finding);
        }
      }

      added.sort((left, right) => {
        const byField =
          (order.get(left.field) ?? Number.MAX_SAFE_INTEGER) -
          (order.get(right.field) ?? Number.MAX_SAFE_INTEGER);
        if (byField !== 0) return byField;
        if (left.start !== right.start) return left.start - right.start;
        return left.end - right.end;
      });

      return added.length === 0 ? findings : [...findings, ...added];
    },
    // No artifact, no I/O, no failure mode — see the file header. This is the one implementation of
    // the port entitled to a constant `READY`.
    readiness: () => 'READY' as const,
  });
}
