// Shared e2e helpers. Everything here polls: the language server starts
// asynchronously when the first JS file opens, diagnostics arrive debounced,
// and the TS program warms lazily — so assertions wait for state instead of
// sleeping fixed amounts.
const path = require('node:path');
const vscode = require('vscode');

const WORKSPACE = path.resolve(__dirname, '..', '..', '..', 'fixtures', 'workspace');

function fixtureUri(name) {
    return vscode.Uri.file(path.join(WORKSPACE, name));
}

async function openFixture(name) {
    const uri = fixtureUri(name);
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc);
    return uri;
}

// Poll fn until it returns a truthy value (returned) or the timeout elapses
// (throws, with the label in the message).
async function until(fn, label, { timeout = 20_000, interval = 250 } = {}) {
    const deadline = Date.now() + timeout;
    for (;;) {
        const result = await fn();
        if (result) return result;
        if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
        await new Promise(r => setTimeout(r, interval));
    }
}

// All hover text for a position, flattened to one string.
async function hoverText(uri, position) {
    const hovers = await vscode.commands.executeCommand('vscode.executeHoverProvider', uri, position);
    return (hovers ?? [])
        .flatMap(h => h.contents)
        .map(c => (typeof c === 'string' ? c : c.value))
        .join('\n');
}

module.exports = { fixtureUri, openFixture, until, hoverText };
