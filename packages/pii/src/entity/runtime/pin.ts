/**
 * EVID-02 deliverable 3 — the artifact pin, as data only.
 *
 * PRD §21.1: *"Pinned dependencies/images, lockfiles, SBOM, scans, signed manifests and **no
 * arbitrary runtime plugin/model/code download**."* A pin is therefore a VERSION AND A DIGEST that
 * must be satisfied before anything loads, and there is no field for a URL, a mirror, a fallback or
 * an "allow unverified" flag — the absences are the point.
 *
 * `ENTITY_ARTIFACT_PINS` IS DELIBERATELY EMPTY. `docs/adr/0001-local-pii-entity-runtime.md` records
 * the decision: ship the rule/gazetteer recogniser for v1, define the runtime as a port plus a
 * verified loader contract, and select no artifact. An empty tuple is what "no artifact is approved"
 * looks like as code — a future artifact is added here, in the same commit as its ADR amendment, and
 * `test/entity/runtime-loader.test.ts` already enforces the verification order it will have to pass.
 */
import { deepFreeze } from '../../contract/freeze.js';

export interface ArtifactPin {
  /** Stable identity of the artifact, e.g. `pii-entity-ner`. */
  readonly id: string;
  /** Exact version. A range is not a pin. */
  readonly version: string;
  readonly digestAlgorithm: 'sha256';
  /** Lower-case hex, as the host's digest function produces it. */
  readonly digest: string;
  readonly sizeBytes: number;
  /** SPDX identifier, or the licence name as published. Recorded in the ADR too. */
  readonly licence: string;
}

/** Empty by decision, not by omission — see the file header and ADR 0001. */
export const ENTITY_ARTIFACT_PINS: readonly ArtifactPin[] = deepFreeze([] as const);
