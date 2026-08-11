// @ts-nocheck
// Vendored from @hyrious/marshal v0.3.3 (MIT) — https://github.com/hyrious/marshal
// Vendored to fix a negative multibyte Fixnum decoding bug in load.ts
// (see load.ts header). Remove if upstream releases a fixed version.
export { RE_IGNORECASE, RE_EXTENDED, RE_MULTILINE, S_DEFAULT, S_EXTENDS } from "./constants.js";
export * from "./ruby.js";
export * from "./load.js";
export * from "./dump.js";
