/**
 * `FND-05`'s committed webhook delivery, loaded verbatim.
 *
 * The expected signature is a COMMITTED literal (`signing.json#expectedSignature`), so the assertions
 * compare against it rather than against `verify(sign(x))` — a round trip passes even when the signing
 * input is wrong, which is exactly the defect PRD §34.8 replay evidence exists to catch.
 *
 * The secrets below are `FND-05`'s fixture constants. NOT A CREDENTIAL: they authorise nothing, they
 * are issued by nothing, and no deployment may use them.
 */
import { contractsEventFixture, rawBody } from './repo.js';

export interface SigningFixture {
  readonly secret: string;
  readonly rotatedSecret: string;
  readonly timestampSeconds: number;
  readonly expectedSignature: string;
}

export function loadSigning(): SigningFixture {
  return JSON.parse(contractsEventFixture('signing.json')) as SigningFixture;
}

/** The `X-AER-*` header bag, parsed from `FND-05`'s committed header file. */
export function loadHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const line of contractsEventFixture('alert-created.signed.headers.txt').split('\n')) {
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    headers[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
  }
  return headers;
}

/** The delivery body as SENT: normalised to LF, with the committed trailing newline removed. */
export function loadRawBody(): string {
  return rawBody(contractsEventFixture('alert-created.signed.json'));
}
