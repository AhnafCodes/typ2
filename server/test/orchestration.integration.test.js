// Milestone 4, the wiring proof: parse → transform → store → debounce → push
// as ONE motion, without an editor. Real Rust parser, real transformer, real
// TS service over the shared state maps; only the connection and the clock
// are fake. The unit tests prove the parts — this proves the composition.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parse_ety } from '../src/parser.js';
import { createTsService } from '../src/tsHost.js';
import { createState, processDocument, DEBOUNCE_MS } from '../src/handlers.js';

const PATH = '/virtual/orchestrated.js';

const BROKEN = 'let count = 0; // T: number\ncount = "oops";\n';
const FIXED  = 'let count = 0; // T: number\ncount = 5;\n';

describe('onDidChangeContent orchestration', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('didOpen with a type error → one publish on the correct ORIGINAL line; the fixing didChange → empty publish', () => {
        const state = createState();
        const deps = {
            connection: { sendDiagnostics: vi.fn(), console: { error: vi.fn() } },
            parse_ety,
        };
        deps.tsService = createTsService({ virtualDocs: state.virtualDocs, versions: state.versions });

        // didOpen (TextDocuments surfaces it as onDidChangeContent, version 1)
        processDocument(state, deps, { uri: PATH, version: 1, getText: () => BROKEN });
        expect(deps.connection.sendDiagnostics).not.toHaveBeenCalled(); // debounced
        vi.advanceTimersByTime(DEBOUNCE_MS);
        expect(deps.connection.sendDiagnostics).toHaveBeenCalledTimes(1);

        const publish = deps.connection.sendDiagnostics.mock.calls[0][0];
        expect(publish.uri).toBe(PATH);
        expect(publish.version).toBe(1);
        expect(publish.diagnostics).toHaveLength(1);
        // `count = "oops"` sits on ORIGINAL line 1 (virtual line 2, below the
        // injected JSDoc) — the squiggle must land on the original.
        expect(publish.diagnostics[0].range).toEqual({
            start: { line: 1, character: 0 },
            end: { line: 1, character: 5 },
        });
        expect(publish.diagnostics[0].severity).toBe(1);
        expect(publish.diagnostics[0].message).toMatch(/not assignable to type 'number'/);

        // didChange that fixes the error
        processDocument(state, deps, { uri: PATH, version: 2, getText: () => FIXED });
        vi.advanceTimersByTime(DEBOUNCE_MS);
        expect(deps.connection.sendDiagnostics).toHaveBeenCalledTimes(2);
        expect(deps.connection.sendDiagnostics.mock.calls[1][0]).toMatchObject({
            uri: PATH,
            version: 2,
            diagnostics: [],
        });
    });
});
