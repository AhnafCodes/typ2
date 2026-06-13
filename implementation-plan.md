# ety LSP — Test-First Implementation Plan

Companion to `ety-lsp-spec.md`. The spec defines *what* and *why*; this plan defines *in what order* and *proven how*. Every milestone exits through one of the spec's Gates.

---

## Foundation Decision

**Base the server on Microsoft's official `lsp-sample`**
 ety's complexity budget is already spent on the Rust/N-API boundary, the virtual document manager, 
and the embedded TypeScript Language Service — hand-rolling the wire protocol on top of that is plumbing you'd be debugging instead of building ety. 
`lsp-sample` gives you `vscode-languageserver`'s `connection.listen()` and `documents.listen(connection)` for free, which is exactly what the spec's Phase 3 assumes.

What survives from `lsp-sample`: the client/server folder split, the connection bootstrap, the `TextDocuments` sync. 
What gets replaced entirely: its regex-based validation logic, its settings plumbing, its completion handler.
Three injections turn it into ety: the **Phase 1+2 interceptor** in `onDidChangeContent`, the **`ts.LanguageServiceHost`** serving virtual docs,
and the **line reverse-mapper** wrapping every response. Use the spec's compilation settings verbatim (ES2022, `lib`, `jsx: Preserve`, `moduleResolution: Bundler`) — not `lsp-sample` defaults or abbreviated variants.

---

## Methodology Rules

1. **Red first.** No production code is written without a failing test that demands it. Each step below names the tests to write *before* the implementation task.
2. **Gates are exit criteria, not suggestions.** A milestone is done when its Gate's assertions pass in CI, not when the code "looks right."
3. **Contract fixtures are shared.** The Rust parser and the Node transformer are developed against the *same* JSON fixture files (`fixtures/contract/*.json`: source in, expected `EtyAnnotation[]` out). This lets the Node side be built against a stubbed parser while Rust is still in progress.
4. **De-risk the unknown first.** The one externally-unverified assumption — `@type` on class methods — gets its fixture written and run at the *start* of Milestone 3, not the end.
5. **Pure functions get unit tests; handlers get extracted.** LSP handlers are written as exported pure functions `(state, request) → response` and unit-tested directly; the `connection.onX` wiring is a one-line shim covered by the e2e milestone.

---

## Repository Layout

```
ety/
├── crates/ety-parser/        # Rust napi-rs addon (Phase 1)
│   ├── src/lib.rs
│   └── tests/                # cargo unit tests (check_block etc.)
├── server/                   # Node LSP server (Phases 2–3)
│   ├── src/
│   │   ├── transform.js      # LineIndex, convertGenerics, splitters, toJsDocType, transformDocument
│   │   ├── handlers.js       # pure hover/diagnostics functions
│   │   ├── tsHost.js         # LanguageServiceHost + service
│   │   └── main.js           # connection wiring only
│   └── test/                 # vitest
├── client/                   # VS Code extension (Phase 4) — thin, from lsp-sample
├── fixtures/
│   ├── contract/             # shared parser contracts (source + expected annotations JSON)
│   ├── transform/            # source → expected virtual doc snapshots
│   └── workspace/            # .js files for e2e
└── .github/workflows/ci.yml  # cargo test → vitest → e2e
```

Test tooling: `cargo test` (Rust), `vitest` (Node — fast watch mode suits red-green loops), `@vscode/test-electron` (e2e).

---

## Milestone 0 — Harness and Walking Skeleton

**User story:** *As the developer, I can run one command and see red/green for every layer, and I can demo a hover end-to-end before the real parser exists.*

**Tests first:**
- `contract/basic-function.json` — the first contract fixture: a 5-line source with one `// T: (string) => User` function annotation and the exact expected `EtyAnnotation` (offsets computed by hand). Write the Node test that loads it and calls `parse_ety` — it fails because nothing exists. This failing test is the project's starting gun.
- `skeleton.e2e.test` — opens a fixture file, expects *any* hover response (will stay red until Milestone 4; marked `todo`).

**Implementation:**
1. Scaffold the monorepo, CI pipeline, and `lsp-sample`-derived client/server.
2. **Cleanup pass on the sample:** delete its regex validation logic, its settings/configuration plumbing, and its completion handler immediately — the scaffold should contain only the connection bootstrap and `TextDocuments` sync. Dead sample code left "for reference" becomes cognitive load in every review.
3. Create `parse_ety` as a **stub**: a JS function that reads the matching contract JSON and returns its expected annotations. The stub satisfies the contract tests' *shape* and unblocks Milestones 2–4 in parallel with Rust.
4. Wire `main.js` with the spec's capabilities block (hover only; no completion).

**Exit:** CI runs all three test layers; contract test passes against the stub; skeleton e2e is registered as pending.

> The stub is the "tracer bullet": the full pipe (change → transform → TS → mapped hover) can be demoed with hardcoded annotations long before Rust lands. Strict Gate order still holds for *completion* of each phase; the stub only decouples *start* order.

---

## Milestone 1 — Rust Parser → **Gate 1**

**User story:** *As the transformer, I receive exactly one correct, normalized annotation per physical `// T:` comment, as byte offsets.*

**Tests first (Rust unit, `cargo test`):**
- `check_block`: annotation between `{` and first statement → `Some`; comment after first statement → `None`; **empty body** `function f() {}` → `None` (the inverted-range guard).
- `check_inline`: trailing same-line → `Some`; next-line → `None`; two semicolon-separated declarations on one line → byte-range, not line, decides.
- `check_class_body`: `{T}` before first member → `Some`; empty class → `None`.
- Payload normalization: `//  T:   (string) => User  ` → exactly `(string) => User` (trimmed, post-`T:`).

**Tests first (Node contract, against real addon):**
- One contract fixture per node kind: function decl, arrow with block body, concise arrow + trailing var, function expression in const, method, class `{T}`, variable, property, `// T: import …`.
- **Dedupe fixture (Gate 1 mandate):** a class method (visitor double-fire via `visit_method_definition` + inner `visit_function`) asserts *exactly one* annotation per physical comment, deduped by `ety_start_offset`.
- **Statement-level variable fixtures:** `let x = 1, y = 2; // T: number` in single-line *and* multi-line form each yield exactly one annotation with `nodeStartOffset` at the `let` keyword (via `visit_variable_declaration` — per-declarator visits would inject JSDoc mid-statement on the multi-line form, a legal-but-inert placement TS ignores). A comment trailing a *non-final* line of a multi-line declaration yields **zero** annotations (documented silent-inert case).
- Field-casing fixture: assert the JS object exposes `nodeStartOffset` / `etyStartOffset` (napi-rs camelCase), not snake_case.
- Error-recovery fixture: source with a syntax error mid-file still yields annotations for the valid prefix (Oxc fault tolerance).

**Implementation:**
1. `napi-rs` scaffold; `EtyAnnotation` struct per spec.
2. Trivias scan + normalization; the three check functions; the visitor with `visit_function`, `visit_arrow_function_expression` (verify the exact method name against the *pinned* Oxc version before writing it), `visit_method_definition`, `visit_class`, `visit_variable_declaration` (statement-level, **not** per-declarator), `visit_property_definition`.
3. Dedupe pass by `ety_start_offset` before returning.
4. Swap the Milestone-0 stub for the real addon **behind the same contract tests** — green means the swap is invisible.

**Exit = Gate 1:** all contract fixtures pass against the compiled addon; dedupe fixtures green.

---

## Milestone 2 — Transformer → **Gate 2**

**User story:** *As TypeScript, I receive a virtual document that is the original plus inserted lines, and the maps to navigate between them never lie.*

**Tests first (pure-function units — this is the TDD sweet spot):**
- `LineIndex`: round-trip property — for every offset in a multi-line sample, `getOffset(getLineAndChar(o)) === o`.
- `convertGenerics` table test, one row per disambiguation case: `Map{string, User}` → generic; `{id: string}` → object; `{T}(…)` prefix → generic; **`Map {string}` (space) → object** (the #9 regression test); nesting `Map{string, {id: string}}`; string literal `'{}'` untouched.
- `extractParamList`: returns the `=>`-followed group only (`((string) => void)` → null); **constraint case** `<T extends () => void>(x: T) => T` finds the *second* group (the all-brackets regression test).
- `splitTopLevel`: nested generics/objects/callbacks don't split.
- `toJsDocType`: **port the 11-case harness already validated in this project** as the seed suite — positional naming, optional `?`, named-param passthrough, tuple/union guard, class `{T}` → `@template`, class `{T, U}`.
- `transformDocument` invariants:
  - *Verbatim superset*: removing all `jsdoc`/`import`-kind lines from the virtual doc reproduces the original exactly.
  - *Map relationship (Gate 2 wording)*: `oToV` maps every original line to its virtual code line; `vToO` restricted to code lines is its inverse; `vToO` is many-to-one overall.
  - *Delayed mapping trap*: the annotated line's `oToV` entry points to the line *after* its JSDoc block — written as an explicit test so no one "fixes" the off-by-one into existence.
  - *Hoisted imports*: each hoisted line has `vToO` → its real source line and **no** `oToV` entry; `lineKind` is `import` with the right `commentRange`.
  - *Shebang*: `#!` stays virtual line 0, imports follow it.
  - Snapshot tests in `fixtures/transform/`: source in, full virtual doc golden file out.

**Implementation:** the spec's Phase 2 code, function by function, each behind its failing tests.

**Exit = Gate 2:** all invariants and snapshots green, including shebang and the delayed-mapping trap test.

---

## Milestone 3 — TypeScript Engine → **Gate 3a**

**User story:** *As a user, my type mistakes are found — and we know on day one whether methods work.*

**Tests first — in this order:**
1. **THE method fixture (de-risk item #1):** a class with `@template T` and a method carrying injected `@type`, containing a deliberate type error in its body. Run `getSemanticDiagnostics` against the hand-built virtual doc.
   - **Green** → method support confirmed; proceed.
   - **Red** → stop; write failing tests for an `@param`/`@returns` generation branch (`kind === 'method'`, fed by `splitTopLevel`), implement it, update the spec's class notes. This decision is budgeted *here*, not discovered in the editor.
2. Function-declaration fixture: `@type` with type params applies positionally (confirms the known-good path in *your* pinned TS version).
3. **Version-trap test:** feed doc v1, get diagnostics; mutate the virtual doc *without* bumping the version → assert stale results returned (documents the trap); bump version → fresh results. This test encodes the `getScriptVersion` invariant.
4. Syntactic + semantic merge: a syntax-error fixture surfaces via `getSyntacticDiagnostics`.
5. Severity mapping: a TS suggestion-category diagnostic maps to `Hint`.
6. Cross-file: two open virtual docs, `// T: import` between them, types resolve; the importing doc alone → unknown-name diagnostic (documents the v1 limitation as a *test*, not just prose).

**Implementation:** `tsHost.js` with the spec's full `getCompilationSettings`; `versions` map honored.

**Exit = Gate 3a:** all six suites green, with the method question *resolved in writing* (test name records the outcome).

---

## Milestone 4 — LSP Handlers → **Gate 3b**

**User story:** *As a user typing in the editor, squigglies land on my real lines, hovering a comment does nothing weird, and fast typing doesn't lag.*

**Tests first (pure handler functions with synthetic state):**
- `pushDiagnostics`: code-line error → line remapped, character passed through; **injected-line error → range equals `commentRange`** (typo'd type name underlines the annotation, not the code); missing state → no-op (race guard); `version` included in the publish payload; `d.length` undefined → zero-width range, no NaN.
- `onHover`: token on code line → correct original range; **hover on `// T:` text → null** (the verbatim-comment-line no-op, as a test so the architecture claim is enforced); missing state → null.
- Debounce (fake timers): three `processDocument` calls within 200ms → one `pushDiagnostics`; `onDidClose` cancels the pending timer and clears all four maps + sends empty diagnostics.
- **`orchestration.integration.test` — the full `onDidChangeContent` flow.** The units above prove the parts; this proves the wiring. Real transformer + real TS service in-process, real (or contract-stub) parser, fake timers, a mock `connection` capturing publishes: simulate `didOpen` on a fixture with a deliberate type error → advance timers → assert exactly *one* publish whose range lands on the correct **original** line; simulate a `didChange` that fixes the error → advance timers → assert the follow-up publish is empty. This is the only test that exercises parse → transform → store → debounce → push as one motion without an editor.

**Error handling strategy (implemented in this milestone, asserted by tests):**
- `vscode-languageserver` already catches handler exceptions and returns JSON-RPC errors to the client; the server's rule on top of that is **log via `connection.console.error`, return `null` / no-op, never crash the process**. The client auto-restarts a crashed server only a limited number of times — a crash loop bricks the editor experience.
- A `parse_ety` throw (malformed addon input, future Rust panic surfaced as JS error) must **not** wipe document state: wrap the call in `processDocument`, log, and keep the *previous* virtual doc and maps so hover keeps answering from the last good parse. Stale-but-working beats dead. Test: throwing stub parser → state unchanged, error logged, no publish.
- `transformDocument` and the handlers are pure and total over their defined inputs; anything that can legitimately be absent (missing `lineMaps` entry) is a guarded early return, already tested above — not an exception path.

**Implementation:** `handlers.js` pure functions; `main.js` wires them to `connection` and `documents` in ≤ ~30 lines.

**Exit = Gate 3b (manual + automated):** in a real VS Code window, a deliberate type error squiggles the correct *original* line and a deliberate syntax error surfaces. Automate what's automatable; the visual check is the gate's spirit.

---

## Milestone 5 — Extension E2E → **Gate 4**

**User story:** *As a user, I install the extension and it just works on `.js` and `.jsx`.*

**Tests first (`@vscode/test-electron`):**
- Un-`todo` the Milestone-0 skeleton test: open `fixtures/workspace/box.js`, hover `value`, assert tooltip contains the resolved type.
- Diagnostics e2e: open a file with a known error, poll `vscode.languages.getDiagnostics`, assert line/character against the original file.
- Selector test: the same assertions on a `.jsx` fixture containing actual JSX (proves `jsx: Preserve` + `javascriptreact` selector together).

**Implementation:** the spec's Phase 4 client verbatim. If any logic creeps into the client, move it to the server — the e2e suite should never need client unit tests.

**Exit = Gate 4:** e2e green in CI (xvfb on Linux runners).

---

## Milestone 6 — Hardening and Regression Wall

Not a Gate — this is the moat that keeps the Gates honest.

- **Scanner consolidation:** the five depth-aware scanners (`closesBeforeParen`, `splitTopLevel`, `extractParamList`, the generic-stripper, the name-detector) share skip discipline. Refactor onto one tokenizer *only after* the table tests above exist — they are the safety net that makes the refactor mechanical. (This project already caught one drift bug — `extractParamList` missing bracket kinds — empirically; the consolidation prevents the next one.)
- **Adversarial table:** string literals with brackets, unicode identifiers, 10k-line file under a performance budget (parse + transform < 50ms on CI hardware; assert it).
- **CRLF policy (decided, not deferred): no normalization; `\n` is the sole line terminator everywhere; `\r` rides along as the last character of a line.** The binding constraint is that **both sides of the napi boundary must see identical bytes** — normalizing in Node but not Rust (or vice versa) silently desyncs every offset. With raw bytes and `\n`-termination, everything already works: `\r\n` contains `\n`, so `LineIndex`, Rust's `build_line_index`, `split('\n')`, and `check_inline`'s `find('\n')` all agree; the trailing `\r` sits at end-of-line where no LSP column ever points; payload trimming strips it from `ety` strings; and injected JSDoc lines having bare `\n` makes the *virtual* doc mixed-ending, which TypeScript accepts. Fixtures: a CRLF copy of a core transform fixture asserting identical line maps and diagnostics positions as its LF twin; a mixed-endings file.
- **Pin and record:** Oxc and TypeScript versions are pinned; the method-`@type` Gate 3a result is re-asserted on every dependency bump by CI, since both behaviors are version-sensitive.

---

## Sequencing Summary

| Order | Milestone | Gate | Can start after |
|-------|-----------|------|-----------------|
| 0 | Harness + walking skeleton | — | nothing |
| 1 | Rust parser | Gate 1 | M0 |
| 2 | Transformer | Gate 2 | M0 (stub parser) |
| 3 | TS engine | Gate 3a | M2 |
| 4 | LSP handlers | Gate 3b | M3 |
| 5 | Extension e2e | Gate 4 | M4 |
| 6 | Hardening | — | M5 |

M1 and M2 run in parallel (the contract fixtures + stub decouple them); everything downstream is strictly ordered. The single most valuable test in the whole plan is Milestone 3's method fixture — write it the same day the TS host compiles.