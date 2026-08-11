/**
 * The brand symbol shared by `context.ts` (which sets it) and the modules that verify it.
 *
 * It lives in its own module so `repository.ts` and `transaction.ts` can check it without
 * `context.ts` having to export it — an exported brand is not a brand, because anything that can
 * import it can mint a context.
 *
 * The symbol is module-local state, not a global registry symbol: `Symbol.for('...')` would be
 * reachable from any code in the process and would defeat the whole mechanism.
 */
const TENANT_CONTEXT_BRAND = Symbol('taxrag.tenantContext');

/**
 * Seals `value` as a genuine context: brand it, then freeze it.
 *
 * The brand is defined **non-enumerable** on purpose. That is what makes the obvious forgery fail:
 * `{ ...realContext, organizationId: 'other-org' }` copies only enumerable own properties, so the
 * spread silently drops the brand and {@link hasTenantContextBrand} rejects the result. A forgery
 * has to reach into this module to succeed, and nothing outside the package can.
 */
export function brandTenantContext<T extends object>(value: T): T {
  Object.defineProperty(value, TENANT_CONTEXT_BRAND, {
    value: true,
    enumerable: false,
    writable: false,
    configurable: false,
  });
  return Object.freeze(value);
}

/** `true` only for a value produced by {@link brandTenantContext}. */
export function hasTenantContextBrand(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Record<symbol, unknown>)[TENANT_CONTEXT_BRAND] === true
  );
}
