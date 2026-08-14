/**
 * EVID-07 deliverable 11 — the kill switch is an INPUT, never a thing this package owns.
 *
 * PRD §42.5 row 1: *"Model profile/provider → New affected generation returns unavailable | Cancel
 * safely at stage boundary; settle actual cost only"*. The state arrives from `DATA-07`/`INTL-09`;
 * this module only reads it. There is no setter, no toggle and no persistence here — a package that
 * could turn its own kill switch off is not a kill switch.
 *
 * The check runs BEFORE any transport call, so a switched-off profile performs no provider
 * interaction at all (`test/providers/killswitch.test.ts` asserts a call count of zero). "Cancel
 * safely at stage boundary" is the caller's job for work already in flight; this package's stage
 * boundary is the start of a call.
 */
import type { ModelProfileId } from '../profiles/types.js';

export interface GatewayKillSwitchState {
  readonly profiles?: readonly ModelProfileId[];
  readonly providers?: readonly string[];
}

/** No switch set is the safe-open default: an absent list is empty, never "everything". */
export const NO_KILL_SWITCH: GatewayKillSwitchState = Object.freeze({});

export type KillSwitchScope = 'PROFILE' | 'PROVIDER';

/** Which scope refused, or `null`. Returning the scope keeps `detail` honest about which switch fired. */
export function killSwitchScope(
  state: GatewayKillSwitchState,
  profileId: ModelProfileId,
  providerId: string,
): KillSwitchScope | null {
  if (state.profiles?.includes(profileId) === true) return 'PROFILE';
  if (state.providers?.includes(providerId) === true) return 'PROVIDER';
  return null;
}

export function isSwitchedOff(
  state: GatewayKillSwitchState,
  profileId: ModelProfileId,
  providerId: string,
): boolean {
  return killSwitchScope(state, profileId, providerId) !== null;
}
