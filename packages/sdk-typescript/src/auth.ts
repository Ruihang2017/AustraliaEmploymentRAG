/**
 * Credential authentication (ticket deliverable 2; PRD §38.2, §38.4).
 *
 * Two variants, and only two:
 *
 * - `{ apiKey }`  -> `Authorization: Bearer <key>`
 * - `{ widgetSession }` -> the widget-session header (PRD §38.4 — a widget token is not an API key
 *   and must not be presented as one).
 *
 * **There is no cookie variant.** PRD §38.2: *"API keys do not use cookies."* No code path in this
 * package sets, reads or forwards a `Cookie` header; `test/no-cookie.test.ts` asserts that over the
 * whole of `src/**` and over every request the example run records.
 *
 * ## The credential never becomes a property
 *
 * `createAuthenticator` closes over the credential and returns functions. The returned object has no
 * field holding it, so `JSON.stringify(client)`, `String(client)`, `util.inspect(client)`, a thrown
 * error's `details`/`body`, and every telemetry record are structurally incapable of containing it —
 * rather than merely redacted at each site, which is the pattern that leaks when a new site is added
 * (PRD §22, §21.1; `test/credential-leak.test.ts`).
 */
import { AerValidationError } from './errors.js';
import { HEADER } from './http.js';

/** PRD §38.2 / §38.4 — a service credential or a widget session. No cookie, no session-id variant. */
export type AerAuth = { readonly apiKey: string } | { readonly widgetSession: string };

export interface Authenticator {
  /** Returns `headers` plus exactly one credential header. Never mutates its argument. */
  readonly applyAuth: (headers: Readonly<Record<string, string>>) => Record<string, string>;
  /** `api_key` or `widget_session` — the KIND, never the value. Safe to log. */
  readonly kind: 'api_key' | 'widget_session';
}

const REDACTED = '[redacted]';

/** The one place a credential string is validated. Its content is never quoted in the message. */
function requireCredential(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new AerValidationError(`auth.${field} must be a non-empty string`);
  }
  return value;
}

export function createAuthenticator(auth: AerAuth): Authenticator {
  if ('apiKey' in auth) {
    const credential = requireCredential(auth.apiKey, 'apiKey');
    return Object.freeze({
      kind: 'api_key' as const,
      applyAuth: (headers: Readonly<Record<string, string>>): Record<string, string> => ({
        ...headers,
        [HEADER.authorization]: `Bearer ${credential}`,
      }),
    });
  }

  const credential = requireCredential(auth.widgetSession, 'widgetSession');
  return Object.freeze({
    kind: 'widget_session' as const,
    applyAuth: (headers: Readonly<Record<string, string>>): Record<string, string> => ({
      ...headers,
      [HEADER.widgetSession]: credential,
    }),
  });
}

/**
 * The redacted view every stringification of the client goes through. Installed as `toJSON` and as
 * Node's custom-inspect symbol, so `JSON.stringify`, `console.log` and `util.inspect` all land here.
 */
export function redactedView(fields: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  return Object.freeze({ ...fields, auth: REDACTED });
}

/** Installs `toString`, `toJSON` and Node's inspect hook on an object, all returning the redacted view. */
export function installRedaction<T extends object>(
  target: T,
  fields: Readonly<Record<string, unknown>>,
): T {
  const view = (): Readonly<Record<string, unknown>> => redactedView(fields);
  const define = (key: string | symbol, value: unknown): void => {
    Object.defineProperty(target, key, { value, enumerable: false, configurable: true });
  };
  define('toJSON', view);
  define('toString', () => `[AerClient ${JSON.stringify(view())}]`);
  define(Symbol.for('nodejs.util.inspect.custom'), view);
  return target;
}
