// Real napi-rs addon (Milestone 1) — replaced the Milestone-0 contract stub
// behind the same contract tests; a green suite means the swap is invisible.
//
// Contract: parse_ety(source) -> EtyAnnotation[] with napi-rs camelCased
// fields (nodeStartOffset, etyStartOffset, etyEndOffset, kind, name, ety).
// Build the addon with `npm run build:parser` (napi build, release).
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// The napi-generated loader resolves the platform-specific .node binary.
const { parse_ety } = require('../../crates/ety-parser/index.js');

export { parse_ety };
