/**
 * The typed operation surface, DERIVED at runtime from the generated path/method map
 * (ticket deliverable 3 and 12; sub-PRD **D1**, **D8**).
 *
 * Nothing here enumerates operations by hand. `operations` — 90 entries of `{ method, path }` — is
 * walked once, so an operation added to `schemas/openapi/openapi.yaml` appears in this SDK with no
 * edit to this file, and an operation removed disappears the same way.
 *
 * **`/internal/v1` is excluded** (PRD §8.11: internal administration *"MUST NOT be shipped in customer
 * SDKs"*). The filter is applied here, once, and `test/no-internal.test.ts` asserts that no exported
 * invoker resolves to a path containing `/internal`.
 *
 * Request and response BODY types are not modelled here: they live in the generated core and are
 * applied by the ergonomic layer (`client.search`, `client.answers.*`) and by the caller's own type
 * argument (`client.operations.getWatchlist<WatchlistResponse>()`). Re-declaring 90 request/response
 * pairs in this package is exactly what sub-PRD **D1** forbids.
 */
import type { OperationCallOptions } from './call.js';
import type { Caller } from './call.js';
import type { CollectionResponse, OperationId } from './internal/contracts.js';
import { operations } from './internal/contracts.js';
import type { ListParams, Paginator } from './pagination.js';
import { createPaginator } from './pagination.js';

/** Invokes one operation. The response type is the caller's to supply from the generated core. */
export type OperationInvoker = <TResponse = unknown>(options?: OperationCallOptions) => Promise<TResponse>;

/** Paginates one collection operation (PRD §34.1). */
export type ListInvoker = <TItem = unknown>(params?: ListParams) => Paginator<TItem>;

export interface ResourceGroup {
  /** Every operation whose path starts at this resource, keyed by its generated `operationId`. */
  readonly operations: Readonly<Record<string, OperationInvoker>>;
  /** Present when the resource has a collection root (`GET /<resource>`). */
  readonly list?: ListInvoker;
}

/** `answer-jobs` -> `answerJobs`. */
export function toCamelCase(segment: string): string {
  return segment.replace(/-([a-z0-9])/g, (_m, c: string) => c.toUpperCase());
}

/** `/answer-jobs/{job_id}/cancel` -> `answer-jobs`. */
export function resourceSegment(path: string): string {
  return path.replace(/^\/+/, '').split('/')[0] ?? '';
}

/** PRD §8.11 — a path that is not part of the customer `/v1` surface. */
export const isInternalPath = (path: string): boolean => path.includes('/internal');

/** Every operation id this SDK is allowed to expose, in generated order. */
export function publicOperationIds(): readonly OperationId[] {
  return (Object.keys(operations) as OperationId[]).filter((id) => !isInternalPath(operations[id].path));
}

/** Whether an operation is the collection root of its resource (`GET /<resource>`). */
export function isCollectionRoot(id: OperationId): boolean {
  const operation = operations[id];
  return operation.method === 'GET' && operation.path === `/${resourceSegment(operation.path)}`;
}

export function createOperationInvokers(caller: Caller): Readonly<Record<OperationId, OperationInvoker>> {
  const map: Partial<Record<OperationId, OperationInvoker>> = {};
  for (const id of publicOperationIds()) {
    map[id] = <TResponse,>(options: OperationCallOptions = {}): Promise<TResponse> =>
      caller.call<TResponse>(id, options);
  }
  return Object.freeze(map as Record<OperationId, OperationInvoker>);
}

/** Builds the `list` paginator for a collection-root operation. */
export function createListInvoker(caller: Caller, id: OperationId): ListInvoker {
  return <TItem,>(params: ListParams = {}): Paginator<TItem> =>
    createPaginator<TItem>(
      ({ page_size, cursor, signal }) =>
        caller.call<CollectionResponse>(id, {
          query: { page_size, ...(cursor === undefined ? {} : { cursor }) },
          signal,
        }),
      params,
    );
}

/** Resource groups, keyed by the camel-cased first path segment. */
export function createResourceGroups(caller: Caller): Readonly<Record<string, ResourceGroup>> {
  const invokers = createOperationInvokers(caller);
  const groups = new Map<string, { operations: Record<string, OperationInvoker>; list?: ListInvoker }>();

  for (const id of publicOperationIds()) {
    const key = toCamelCase(resourceSegment(operations[id].path));
    if (key.length === 0) continue;
    let group = groups.get(key);
    if (!group) {
      group = { operations: {} };
      groups.set(key, group);
    }
    group.operations[id] = invokers[id];
    if (isCollectionRoot(id)) group.list = createListInvoker(caller, id);
  }

  const out: Record<string, ResourceGroup> = {};
  for (const [key, group] of groups) {
    out[key] = Object.freeze({
      operations: Object.freeze(group.operations),
      ...(group.list === undefined ? {} : { list: group.list }),
    });
  }
  return Object.freeze(out);
}
