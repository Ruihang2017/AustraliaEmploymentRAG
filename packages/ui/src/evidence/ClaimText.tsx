/**
 * Claim-linked prose (ticket Deliverable 4; PRD §32.3).
 *
 * Each material sentence is one element carrying its claim id, an accessible name that includes the
 * claim's support status, and a keyboard-operable control that raises `onSelectClaim`.
 *
 * THIS PACKAGE COMPUTES NO OFFSETS. Highlight ranges arrive in props from `packages/citations`
 * (`EVID-02`). They are applied by slicing the given text — and slicing legal text with a number
 * from another module is a hazard (risk R3), so every range is validated first: within bounds,
 * non-reversed, non-overlapping. A bad range is a NAMED ERROR, never a garbled quote, because
 * PRD §34.2 requires the rendered quote to equal the source substring.
 */
import type { ReactNode } from 'react';

import type { Claim, ClaimSupport, OpaqueId } from '../contracts.js';
import type { PassageHighlight } from './types.js';

/** Thrown when a supplied highlight range cannot be applied faithfully. */
export class InvalidHighlightRangeError extends Error {
  constructor(reason: string) {
    super(`ClaimText: ${reason}. Highlight offsets come from packages/citations (EVID-02).`);
    this.name = 'InvalidHighlightRangeError';
  }
}

const SUPPORT_TEXT = {
  DIRECTLY_SUPPORTED: 'directly supported',
  SUPPORTED_BY_INFERENCE: 'supported by inference',
  CONDITIONAL: 'conditional',
  CONTRADICTED: 'contradicted',
  NOT_SUPPORTED: 'not supported',
} satisfies Record<ClaimSupport, string>;

/**
 * Validates and returns the ranges in ascending order.
 *
 * Exported so the property can be unit-tested without a renderer.
 */
export function validateHighlights(
  highlights: readonly PassageHighlight[],
  textLength: number,
): readonly PassageHighlight[] {
  const ordered = [...highlights].sort((a, b) => a.start - b.start);
  let previousEnd = 0;
  for (const range of ordered) {
    if (!Number.isInteger(range.start) || !Number.isInteger(range.end)) {
      throw new InvalidHighlightRangeError('a highlight offset is not an integer');
    }
    if (range.start < 0 || range.end > textLength) {
      throw new InvalidHighlightRangeError(
        `a highlight range [${range.start}, ${range.end}) is outside the text (length ${textLength})`,
      );
    }
    if (range.end <= range.start) {
      throw new InvalidHighlightRangeError(
        `a highlight range [${range.start}, ${range.end}) is empty or reversed`,
      );
    }
    if (range.start < previousEnd) {
      throw new InvalidHighlightRangeError(
        `highlight ranges overlap at offset ${range.start}`,
      );
    }
    previousEnd = range.end;
  }
  return ordered;
}

/** Splits `text` into highlighted and plain runs. Never drops or duplicates a character. */
function runs(
  text: string,
  highlights: readonly PassageHighlight[],
): readonly { readonly value: string; readonly claimId?: OpaqueId }[] {
  const ordered = validateHighlights(highlights, text.length);
  const pieces: { value: string; claimId?: OpaqueId }[] = [];
  let cursor = 0;
  for (const range of ordered) {
    if (range.start > cursor) pieces.push({ value: text.slice(cursor, range.start) });
    pieces.push({ value: text.slice(range.start, range.end), claimId: range.claimId });
    cursor = range.end;
  }
  if (cursor < text.length) pieces.push({ value: text.slice(cursor) });
  return pieces;
}

export type ClaimTextProps = {
  readonly claims: readonly Claim[];
  /** Controlled by the owning screen; this package holds no selection state (risk R7). */
  readonly selectedClaimId?: OpaqueId;
  readonly onSelectClaim: (claimId: OpaqueId) => void;
  /**
   * Source-passage highlights, keyed to a claim. Computed elsewhere; applied verbatim here.
   * Ranges are indices into the corresponding claim's own `text`.
   */
  readonly highlights?: Readonly<Record<string, readonly PassageHighlight[]>>;
};

export function ClaimText(props: ClaimTextProps): ReactNode {
  return (
    <div className="tui-claim-text">
      {props.claims.map((claim) => {
        const selected = claim.id === props.selectedClaimId;
        const claimHighlights = props.highlights?.[claim.id] ?? [];
        return (
          <p className="tui-claim-text__sentence" key={claim.id}>
            <button
              type="button"
              className="tui-claim-text__claim"
              data-claim-id={claim.id}
              aria-pressed={selected}
              aria-label={`Claim ${claim.sequence}: ${claim.text} — ${SUPPORT_TEXT[claim.support_status]}`}
              onClick={() => props.onSelectClaim(claim.id)}
            >
              {runs(claim.text, claimHighlights).map((run, index) =>
                run.claimId === undefined ? (
                  <span key={index}>{run.value}</span>
                ) : (
                  <mark className="tui-claim-text__highlight" key={index}>
                    {run.value}
                  </mark>
                ),
              )}
            </button>
          </p>
        );
      })}
    </div>
  );
}
