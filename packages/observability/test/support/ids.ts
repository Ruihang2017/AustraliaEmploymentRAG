/**
 * Test-only id minting. Uses `packages/contracts`' factory directly so the tests exercise real
 * opaque ids rather than hand-written strings that happen to match the pattern.
 */
import { createIdFactory } from '../../../contracts/src/ids/index.js';

const factory = createIdFactory();

/** A well-formed `<kind>_<uuidv7>` id. `kind` need not be registered — the shape is what matters. */
export function id(kind: string): string {
  return `${kind}_${factory.newId('req').slice('req_'.length)}`;
}
