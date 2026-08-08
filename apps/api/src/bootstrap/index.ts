/**
 * The bootstrap surface. `RouteAreaConfig` is "exported from `apps/api/src/bootstrap`" per the A1
 * contract §3, so a route area's `index.ts` imports it from here and never from a deeper path.
 */
export type { ApiConfig, ApiProfile, EnvironmentLabel } from './config.js';
export {
  CONFIG_DEFAULTS,
  CRITICAL_KEY_PREFIX,
  ConfigValidationError,
  DECLARED_KEYS,
  loadConfig,
  resolveProfile,
  unknownCriticalKeys,
} from './config.js';

export type {
  LoadedRouteArea,
  RegisterRouteAreasOptions,
  RouteAreaAdmission,
  RouteAreaConfig,
} from './route-areas.js';
export {
  RouteAreaCollisionError,
  RouteAreaEntryError,
  defaultRouteAreasRoot,
  derivePrefix,
  discoverRouteAreas,
  registerRouteAreas,
} from './route-areas.js';

export {
  INBOUND_REQUEST_ID_PATTERN,
  injectRequestId,
  installRequestId,
  isAcceptableInboundRequestId,
  mintRequestId,
  resolveRequestId,
} from './request-id.js';

export type {
  ClosableApp,
  InstallShutdownOptions,
  ShutdownHandle,
  ShutdownLogger,
  UnrefableTimer,
} from './shutdown.js';
export { installShutdown } from './shutdown.js';
