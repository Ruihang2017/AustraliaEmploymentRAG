/**
 * An incremental `text/event-stream` parser (WHATWG SSE, as used by PRD §34.4).
 *
 * It is fed arbitrary byte chunks and yields whole frames. The properties that matter, each of which
 * has a test:
 *
 * - a frame split across chunk boundaries is reassembled;
 * - `id:`, `event:`, `data:` and `retry:` are recognised; a comment line (`:`) is ignored;
 * - multi-line `data:` is joined with `\n`, per the specification;
 * - CRLF, LF and CR are all accepted as line terminators;
 * - a frame larger than `maxFrameBytes` is rejected rather than buffered without bound — an
 *   unterminated stream must not be able to exhaust the caller's memory.
 */
import { AerStreamError } from '../errors.js';
import { createTextDecoder } from '../internal/runtime.js';

export interface SseFrame {
  readonly id: string | null;
  readonly event: string | null;
  readonly data: string;
  readonly retryMs: number | null;
}

/** 1 MiB. A PRD §34.4 frame is a few hundred bytes; this is four orders of magnitude of headroom. */
export const DEFAULT_MAX_FRAME_BYTES = 1024 * 1024;

export interface SseParserOptions {
  readonly maxFrameBytes?: number | undefined;
}

export class SseParser {
  private buffer = '';
  private readonly decoder = createTextDecoder();
  private readonly maxFrameBytes: number;

  constructor(options: SseParserOptions = {}) {
    this.maxFrameBytes = options.maxFrameBytes ?? DEFAULT_MAX_FRAME_BYTES;
  }

  /** Feeds one chunk and returns every complete frame it terminated. */
  push(chunk: Uint8Array): SseFrame[] {
    this.buffer += this.decoder.decode(chunk, { stream: true });
    return this.drain(false);
  }

  /** Flushes the decoder at end of stream. A trailing unterminated block is discarded, by design. */
  end(): SseFrame[] {
    this.buffer += this.decoder.decode();
    return this.drain(true);
  }

  private drain(atEnd: boolean): SseFrame[] {
    const frames: SseFrame[] = [];
    // Normalise line terminators once; the specification treats CRLF, LF and CR alike.
    this.buffer = this.buffer.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    for (;;) {
      const boundary = this.buffer.indexOf('\n\n');
      if (boundary === -1) break;
      const block = this.buffer.slice(0, boundary);
      this.buffer = this.buffer.slice(boundary + 2);
      const frame = parseBlock(block);
      if (frame) frames.push(frame);
    }
    if (atEnd && this.buffer.trim().length > 0) {
      const frame = parseBlock(this.buffer.replace(/\n+$/, ''));
      this.buffer = '';
      if (frame) frames.push(frame);
    }
    if (this.buffer.length > this.maxFrameBytes) {
      throw new AerStreamError(
        `an SSE frame exceeded ${this.maxFrameBytes} bytes without terminating; the stream was closed`,
      );
    }
    return frames;
  }
}

/** One `\n\n`-delimited block -> a frame, or `null` when the block carried only comments. */
export function parseBlock(block: string): SseFrame | null {
  let id: string | null = null;
  let event: string | null = null;
  let retryMs: number | null = null;
  const dataLines: string[] = [];
  let sawField = false;

  for (const rawLine of block.split('\n')) {
    if (rawLine.length === 0 || rawLine.startsWith(':')) continue;
    const colon = rawLine.indexOf(':');
    const field = colon === -1 ? rawLine : rawLine.slice(0, colon);
    let value = colon === -1 ? '' : rawLine.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    sawField = true;
    switch (field) {
      case 'id':
        id = value;
        break;
      case 'event':
        event = value;
        break;
      case 'data':
        dataLines.push(value);
        break;
      case 'retry': {
        const parsed = Number(value);
        retryMs = Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
        break;
      }
      default:
        // Unknown field: the specification requires it to be ignored.
        break;
    }
  }

  if (!sawField) return null;
  return { id, event, data: dataLines.join('\n'), retryMs };
}
