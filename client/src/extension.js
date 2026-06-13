// The extension has exactly one job: launch the server and wire the protocol.
// No type logic lives here (spec Phase 4). CommonJS because the VS Code
// extension host loads CJS entry points.
//
// Deviation from the spec's Phase 4 snippet, on purpose: inside the extension
// host `process.execPath` is the VS Code/Electron binary, not node, so the
// spec's `command: process.execPath` form would not spawn a node server. We
// use lsp-sample's `module` form instead — the client forks the module with
// node and IPC transport.
const path = require('node:path');
const { LanguageClient, TransportKind } = require('vscode-languageclient/node');

let client;

function activate() {
    const serverModule = path.resolve(__dirname, '..', '..', 'server', 'src', 'main.js');

    client = new LanguageClient(
        'ety',
        'ety Language Server',
        {
            run: { module: serverModule, transport: TransportKind.ipc },
            debug: { module: serverModule, transport: TransportKind.ipc },
        },
        {
            documentSelector: [
                { scheme: 'file', language: 'javascript' },
                { scheme: 'file', language: 'javascriptreact' }, // .jsx — {} generics exist to avoid JSX conflicts
            ],
        }
    );
    client.start();
}

function deactivate() {
    return client?.stop();
}

module.exports = { activate, deactivate };
