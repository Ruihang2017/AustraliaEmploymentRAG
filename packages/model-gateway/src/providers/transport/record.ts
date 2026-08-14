/**
 * EVID-07 deliverable 6, record mode — *"exists, is off by default, requires an explicit environment
 * flag plus a real key, and is never exercised in CI."*
 *
 * HOW THAT IS GUARANTEED HERE, and it is stronger than a flag: this package cannot read an
 * environment variable, cannot open a socket and cannot write a file. `recordingTransport` is a
 * DECORATOR — the host must hand it both a live transport it built itself and a sink it built itself.
 * There is no default for either. So "off by default" is not a boolean somebody can flip in this
 * package; it is the absence of anything to flip.
 *
 * The sink receives the recorded response and the FINGERPRINT KEY — never the request body. Writing
 * the assembled payload to a cassette would put evidence text and sanitized customer facts into a
 * committed artefact (plan §6 risk 5), which is exactly what the fingerprint design avoids.
 */
import { cassetteKeyOf } from './cassette.js';
import type { Cassette } from './cassette.js';
import type { Transport, TransportRequest, TransportResponse } from './types.js';

export type CassetteSink = (cassette: Cassette) => void;

export function recordingTransport(inner: Transport, sink: CassetteSink): Transport {
  return async (request: TransportRequest): Promise<TransportResponse> => {
    const response = await inner(request);
    sink({ key: cassetteKeyOf(request), response });
    return response;
  };
}
