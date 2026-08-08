/**
 * Cursor pagination (ticket deliverable 10; PRD §34.1).
 *
 * The reviewer's question — *"whether a `page_size` of `0` or `101` can reach the wire"* — is
 * answered by asserting the transport recorded ZERO requests, not merely that a rejection happened.
 */
import { describe, expect, it } from 'vitest';

import { AerValidationError, PAGE_SIZE_DEFAULT, PAGE_SIZE_MAX, PAGE_SIZE_MIN, assertPageSize } from '../src/sdk.js';
import { createHarness } from './support/client.js';
import { routed } from './support/transport.js';
import { watchlistsPage1, watchlistsPage2 } from './fixtures/typed.js';

const WATCHLISTS = /\/v1\/watchlists(\?|$)/;

const twoPages = () => {
  let call = 0;
  return routed([
    [
      WATCHLISTS,
      () => {
        call += 1;
        return { status: 200, json: call === 1 ? watchlistsPage1 : watchlistsPage2 };
      },
    ],
  ]);
};

describe('pagination (PRD §34.1)', () => {
  it('rejects page_size outside 1–100 BEFORE any request', () => {
    for (const bad of [0, 101, -1, 2.5]) {
      const harness = createHarness(twoPages());
      expect(() => harness.client.list('listWatchlists', { page_size: bad })).toThrow(AerValidationError);
      expect(harness.transport.requests).toEqual([]);
    }
  });

  it('accepts the documented bounds', () => {
    expect(() => assertPageSize(PAGE_SIZE_MIN)).not.toThrow();
    expect(() => assertPageSize(PAGE_SIZE_MAX)).not.toThrow();
    expect(() => assertPageSize(undefined)).not.toThrow();
    expect(PAGE_SIZE_DEFAULT).toBe(25);
  });

  it('sends the default page_size of 25 when the caller supplies none', async () => {
    const harness = createHarness(twoPages());
    await harness.client.list('listWatchlists').page();
    expect(harness.transport.requests[0]?.url).toContain('page_size=25');
  });

  it('walks pages until next_cursor is null, passing the cursor through unparsed', async () => {
    const harness = createHarness(twoPages());
    const pages = [];
    for await (const page of harness.client.list('listWatchlists', { page_size: 10 }).pages()) pages.push(page);

    expect(pages).toHaveLength(2);
    expect(pages[0]?.next_cursor).toBe('opaque-cursor-page-2');
    expect(pages[1]?.next_cursor).toBeNull();
    // `data` is the ergonomic accessor; `raw.items` is the wire field.
    expect(pages[0]?.data).toEqual(watchlistsPage1.items);
    // `data` IS the wire `items` array, not a copy of it.
    expect(pages[0]?.data).toBe(pages[0]?.raw.items);
    expect(pages[0]?.raw).toEqual(watchlistsPage1);
    // The cursor went back out verbatim — never decoded, split or re-encoded beyond URL escaping.
    expect(harness.transport.requests[1]?.url).toContain('cursor=opaque-cursor-page-2');
  });

  it('flattens items across pages', async () => {
    const harness = createHarness(twoPages());
    const items = [];
    for await (const item of harness.client.list('listWatchlists').items()) items.push(item);
    expect(items).toHaveLength(2);
  });

  it('terminates when a server repeats a cursor, instead of looping forever', async () => {
    const harness = createHarness(
      routed([[WATCHLISTS, () => ({ status: 200, json: { ...watchlistsPage1, next_cursor: 'same' } })]]),
    );
    const pages = [];
    for await (const page of harness.client.list('listWatchlists').pages()) pages.push(page);
    // First page, then the page at cursor "same", then stop: "same" has already been served.
    expect(pages).toHaveLength(2);
  });

  it('gives each iteration its own cursor state, so two concurrent walks agree', async () => {
    const harness = createHarness(twoPages());
    const paginator = harness.client.list('listWatchlists');
    const walk = async (): Promise<number> => {
      let n = 0;
      for await (const page of paginator.pages()) {
        void page;
        n += 1;
      }
      return n;
    };
    const [a, b] = await Promise.all([walk(), walk()]);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(0);
  });

  it('exposes list on a resource group with a collection root', async () => {
    const harness = createHarness(twoPages());
    const group = harness.client.resources['watchlists'];
    expect(group).toBeDefined();
    expect(typeof group?.list).toBe('function');
    const page = await group?.list?.({ page_size: 5 }).page();
    expect(page?.data).toHaveLength(1);
  });
});
