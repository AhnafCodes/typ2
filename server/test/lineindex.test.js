// LineIndex unit tests (Milestone 2, plan: "round-trip property — for every
// offset in a multi-line sample, getOffset(getLineAndChar(o)) === o").
//
// LineIndex exists because the TS Compiler API speaks absolute byte offsets,
// not { line, character } — accessing .character on a TS diagnostic start
// would silently be undefined. Both directions are needed.
import { describe, it, expect } from 'vitest';
import { LineIndex } from '../src/transform.js';

const SAMPLE = 'let a = 1;\nconst bb = 2;\n\n    indented;\nlast';

describe('LineIndex', () => {
    it('records a start offset for every line', () => {
        const idx = new LineIndex(SAMPLE);
        // Lines: 0:"let a = 1;" 1:"const bb = 2;" 2:"" 3:"    indented;" 4:"last"
        expect(idx.lineStarts).toEqual([0, 11, 25, 26, 40]);
    });

    it('round-trips every offset in the sample', () => {
        const idx = new LineIndex(SAMPLE);
        for (let o = 0; o < SAMPLE.length; o++) {
            const { line, character } = idx.getLineAndChar(o);
            expect(idx.getOffset(line, character)).toBe(o);
        }
    });

    it('maps a newline offset to the end of its own line', () => {
        const idx = new LineIndex(SAMPLE);
        // offset 10 is the '\n' terminating line 0 ("let a = 1;" is 10 chars)
        expect(idx.getLineAndChar(10)).toEqual({ line: 0, character: 10 });
        // offset 11 is the first char of line 1
        expect(idx.getLineAndChar(11)).toEqual({ line: 1, character: 0 });
    });

    it('handles an empty line between content lines', () => {
        const idx = new LineIndex(SAMPLE);
        expect(idx.getLineAndChar(25)).toEqual({ line: 2, character: 0 });
    });

    it('handles a document with no trailing newline', () => {
        const idx = new LineIndex('only');
        expect(idx.lineStarts).toEqual([0]);
        expect(idx.getLineAndChar(3)).toEqual({ line: 0, character: 3 });
    });

    it('CRLF input: \\r rides along as the last character of a line', () => {
        // CRLF policy (spec/M6): no normalization anywhere; '\n' is the sole
        // terminator, so '\r' sits at end-of-line where no LSP column points.
        const idx = new LineIndex('a\r\nb\r\n');
        expect(idx.lineStarts).toEqual([0, 3, 6]);
        expect(idx.getLineAndChar(1)).toEqual({ line: 0, character: 1 }); // the \r
        expect(idx.getLineAndChar(3)).toEqual({ line: 1, character: 0 });
    });
});
