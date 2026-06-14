# ety

**Types in comments for plain JavaScript.** Write ordinary `.js`/`.jsx` — no build step, no `.ts` files — and put your types in `// T:` comments. ety is a language server that gives you TypeScript's diagnostics and hovers on top of untouched JavaScript source.

```javascript
let count = 0;               // T: number
const cache = new Map();     // T: Map{string, User}

function createUser(name, role) {
// T: (name: string, role?: Role) => User
    return { name, role };
}
```

`count = "oops"` now squiggles. Hovering `createUser` shows the full signature. The file on disk stays plain JavaScript that runs anywhere.

## How it works

ety never rewrites your file. It builds a **virtual document** by inserting JSDoc lines above your annotations, hands that to the TypeScript Language Service, and maps the results back to your real source.

```
.js source ──► Rust parser (Oxc) ──► annotations ──► transformer ──► virtual doc
   ▲                                                                      │
   │                                                                      ▼
   └────── LSP diagnostics / hover ◄──── line maps ◄──── TypeScript Language Service
```

Three invariants make the mapping trivial and robust:

- **Immutable source** — the user's bytes are never edited.
- **Additive overlay** — insertions are always *whole lines* (injected JSDoc, hoisted imports), so character columns on code lines are identical between the real and virtual documents.
- **Line-only mapping** — because columns never shift, the entire source map is two line-number maps (`vToO` / `oToV`). No intra-line offset tracking.

A type error inside an injected JSDoc line is remapped onto the `// T:` comment you can actually edit, so the squiggle always lands on real, editable text.

## Annotation syntax

Generics use `{}` instead of `<>` to avoid JSX/HTML conflicts: `Box{T}` → `Box<T>`, `Map{K, V}` → `Map<K, V>`.

The one disambiguation rule:

| Form | Meaning | Example |
|------|---------|---------|
| `{` **immediately after** an identifier | generic args | `Map{string}` → `Map<string>` |
| `{…}` **immediately followed by** `(` | generic param list | `{T}(T[]) => T[]` → `<T>(T[]) => T[]` |
| anything else | object type, verbatim | `{ id: string }` |

> **The one constraint:** never put a space between a type name and its generic args. `Map{string}` is a generic; `Map {string}` is an object type. Identifiers are unicode-aware, so `Бокс{string}` works too.

Placement is strict — the parser never looks *above* a node:

- **Rule 1 (trailing):** variables, properties, and types use a trailing `// T:` on the *same line*, after the statement ends.
- **Rule 2 (inside-block):** functions and classes use `// T:` on the *first line inside* the body.

Imports get their own form, hoisted to the top of the virtual document:

```javascript
// T: import { User, Role } from './types'
```

## Project layout

```
crates/ety-parser/   Rust (Oxc) → napi addon: extracts // T: annotations from the AST
server/              Node LSP server
  src/transform.js     virtual-doc builder + the {} scanners (pure, no I/O)
  src/tsHost.js        TypeScript Language Service host
  src/handlers.js      diagnostics + hover, as pure (state, deps) functions
  src/main.js          connection wiring only
client/              VS Code extension (launches the server over IPC)
fixtures/            contract (napi boundary), transform (golden), workspace (e2e)
```

It's an npm workspaces monorepo (`crates/ety-parser`, `server`, `client`).

## Build & test

```bash
npm install
npm run build:parser   # compiles the Rust napi addon (requires the Rust toolchain)
npm test               # 120 Node unit/integration tests (vitest)
cargo test --manifest-path crates/ety-parser/Cargo.toml   # 20 Rust tests
npm run test:e2e       # 5 end-to-end tests in a real VS Code (downloads VS Code once)
```

CI (`.github/workflows/ci.yml`) runs all three layers on every push; e2e runs headless under xvfb on Linux.

### Pinned dependencies

Both are pinned exactly and guarded by tests that fail loudly on drift, because behavior is version-sensitive:

- **Oxc** `=0.135.0` (parser)
- **TypeScript** `6.0.3` (language service)

## Try it in VS Code

The end-to-end suite is the turnkey demo — it launches a real VS Code with the
extension loaded against `fixtures/workspace/` and asserts hover and diagnostics:

```bash
npm install && npm run build:parser && npm run test:e2e
```

For an interactive session, add a `.vscode/launch.json` with a `"Run Extension"`
configuration (`extensionDevelopmentPath` pointing at `client/`), press
<kbd>F5</kbd>, then open any `.js`/`.jsx` file in the dev host: add a `// T:`
annotation and introduce a type error — it squiggles on the right line, and
hovering an annotated symbol shows its type.

## v1 limitations

- **Imported files must be open** for their types to resolve. (Closed files are read raw from disk without their annotations; v2 plans *transform-on-read*.)
- **No autocompletion inside `// T:`** — completion would land in comment trivia in the virtual document. Hover and diagnostics are the core and don't depend on it.
