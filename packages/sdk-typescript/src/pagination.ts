/**
 * Cursor pagination (ticket deliverable 10; PRD §34.1).
 *
 * PRD §34.1 fixes `page_size` 1–100, default 25, with an opaque `next_cursor` that *"clients never
 * parse"*. Both properties are enforced here:
 *
 * - `page_size` is validated CLIENT-SIDE, before any request. An invalid value never reaches the
 *   wire (`test/pagination.test.ts` asserts the fake transport recorded zero calls). This is a
 *   convenience, not a security control — the server validates too.
 * - The cursor is carried as an opaque string. Nothing here decodes, splits, base64s or inspects it.
 *
 * `pages()` and `items()` each build their OWN cursor state, so two concurrent iterations of the same
 * paginator cannot skip or repeat a page by sharing a mutable cursor.
 */
import { AerValidationError } from './errors.js';
import type { CollectionResponse, Cursor } from './internal/contracts.js';
import type { AerAbortSignal } from './internal/runtime.js';
import { AerAbortedError } from './errors.js';

export const PAGE_SIZE_MIN = 1;
export const PAGE_SIZE_MAX = 100;
export const PAGE_SIZE_DEFAULT = 25;

/** Throws `AerValidationError` before any request when `pageSize` is outside PRD §34.1's bound. */
export function assertPageSize(pageSize: number | undefined): void {
  if (pageSize === undefined) return;
  if (!Number.isInteger(pageSize) || pageSize < PAGE_SIZE_MIN || pageSize > PAGE_SIZE_MAX) {
    throw new AerValidationError(
      `page_size must be an integer between ${PAGE_SIZE_MIN} and ${PAGE_SIZE_MAX} (PRD §34.1)`,
    );
  }
}

/**
 * One page.
 *
 * `data` is the ergonomic accessor the ticket names (deliverable 10); the wire field the generated
 * `CollectionResponse` declares is `items`, and `raw` is that response untouched. Both are exposed
 * deliberately: `data` is what the parity manifest records for both SDKs, `raw` is what a caller
 * reaches for when it wants the envelope (`request_id`, `schema_version`). Plan **OQ-4** asks
 * `PLTF-03` to mirror the name.
 */
export interface Page<T> {
  readonly data: readonly T[];
  readonly next_cursor: Cursor;
  readonly raw: CollectionResponse;
}

export interface ListParams {
  readonly page_size?: number | undefined;
  readonly cursor?: Cursor | undefined;
  readonly signal?: AerAbortSignal | undefined;
}

/** Fetches exactly one page. Supplied by `client.ts`; the paginator never builds a request itself. */
export type PageFetcher = (params: {
  readonly page_size: number;
  readonly cursor: string | undefined;
  readonly signal: AerAbortSignal | undefined;
}) => Promise<CollectionResponse>;

export interface Paginator<T> {
  /** The first page (or the page at the supplied cursor). */
  page(): Promise<Page<T>>;
  /** Every page, in order, until `next_cursor` is `null`. */
  pages(): AsyncIterable<Page<T>>;
  /** Every item of every page, flattened. */
  items(): AsyncIterable<T>;
}

const toPage = <T>(response: CollectionResponse): Page<T> => ({
  data: response.items as readonly T[],
  next_cursor: response.next_cursor,
  raw: response,
});

/**
 * Builds a paginator over `fetchPage`.
 *
 * The loop stops on `next_cursor: null` and ALSO stops when the server hands back a cursor it has
 * already served in this iteration — otherwise a buggy server turns a `for await` into an infinite
 * loop that silently re-delivers the same page forever.
 */
export function createPaginator<T>(fetchPage: PageFetcher, params: ListParams = {}): Paginator<T> {
  assertPageSize(params.page_size);
  const pageSize = params.page_size ?? PAGE_SIZE_DEFAULT;
  const startCursor = params.cursor ?? undefined;
  const signal = params.signal;

  const fetchAt = async (cursor: string | undefined): Promise<Page<T>> => {
    if (signal?.aborted) throw new AerAbortedError();
    const response = await fetchPage({ page_size: pageSize, cursor, signal });
    return toPage<T>(response);
  };

  async function* pages(): AsyncIterable<Page<T>> {
    // Local to this generator call: two concurrent iterations never share cursor state.
    const seen = new Set<string>();
    let cursor: string | undefined = startCursor;
    for (;;) {
      const page: Page<T> = await fetchAt(cursor);
      yield page;
      const next = page.next_cursor;
      if (next === null || next === undefined) return;
      if (seen.has(next)) return;
      seen.add(next);
      cursor = next;
    }
  }

  async function* items(): AsyncIterable<T> {
    for await (const page of pages()) {
      for (const item of page.data) yield item;
    }
  }

  return Object.freeze({
    page: () => fetchAt(startCursor),
    pages,
    items,
  });
}
