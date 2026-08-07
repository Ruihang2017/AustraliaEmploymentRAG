/**
 * The public surface of the opaque-identifier conventions (PRD §34.1).
 *
 * Downstream modules import from this barrel and never deep-import a file. Every relative specifier
 * carries a `.js` extension because the workspace compiles with `moduleResolution: "nodenext"`
 * (tsconfig.base.json).
 */
export * from './resource-prefixes.js';
export * from './uuidv7.js';
export * from './id.js';
