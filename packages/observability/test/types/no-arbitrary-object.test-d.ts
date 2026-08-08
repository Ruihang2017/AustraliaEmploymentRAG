/**
 * The TYPE-LEVEL half of RUNT-07 acceptance item 2 — "No public API accepts an arbitrary object …
 * asserted at the type level and by a source scan."
 *
 * Compiled by `pnpm typecheck`, not by vitest (`.test-d.ts` does not match vitest's include glob):
 * `packages/observability/tsconfig.json` lists `test` in `include`, so every `@ts-expect-error`
 * below is checked on every typecheck run. If any of these calls ever STOPS being an error, the
 * unused-directive becomes an error itself and this file goes red — which is the point.
 */
import { createLogger } from '../../src/logger.js';
import { createDefaultRegistry } from '../../src/metrics.js';
import { createMemorySink } from '../../src/sinks.js';

const log = createLogger({ sink: createMemorySink(), process: 'app' });
const registry = createDefaultRegistry();

// A permitted call, for contrast.
log.info('request.completed', { latency_ms: 12 });
log.child({ operation: 'search' }).warn('request.rejected', { status: 'rejected' });

// @ts-expect-error an arbitrary object is not a permitted field bag
log.info('request.completed', { anything: 1 });

// @ts-expect-error an Error is not a permitted field bag
log.info('request.rejected', new Error('boom'));

// @ts-expect-error there is no message parameter
log.info('request.completed', 'the taxpayer asked about div 7a');

// @ts-expect-error exactOptionalPropertyTypes: omit a field, never pass undefined
log.info('request.completed', { request_id: undefined });

// @ts-expect-error the event code is a closed vocabulary, not a free string
log.info('something.i.made.up');

// @ts-expect-error a field value must satisfy its declared kind
log.info('request.completed', { latency_ms: '12ms' });

// @ts-expect-error status is a closed vocabulary
log.info('request.completed', { status: 'kind-of-ok' });

// @ts-expect-error a nested object is not a field value
log.info('request.completed', { request_id: { id: 'req_x' } });

// @ts-expect-error there is no escape hatch named extra
log.info('request.completed', { extra: { anything: true } });

// @ts-expect-error a metric label bag holds strings, not arbitrary values
registry.increment('http_requests_total', { operation: 'search', status: {} });

export {};
