// Connection wiring only (implementation-plan.md, Methodology Rule 5) — every
// behavior lives in handlers.js/tsHost.js/transform.js and is unit-tested
// there; nothing here but plumbing. vscode-languageserver already catches
// handler exceptions and answers JSON-RPC errors, so a bug degrades one
// request instead of crashing the process (a crash loop bricks the editor:
// the client only restarts the server a limited number of times).
import {
    createConnection,
    TextDocuments,
    ProposedFeatures,
    TextDocumentSyncKind,
} from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { parse_ety } from './parser.js';
import { createTsService } from './tsHost.js';
import { createState, processDocument, onHover, onDidClose, uriToPath } from './handlers.js';

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);
const state = createState();
const deps = { connection, parse_ety, tsService: null };

connection.onInitialize(params => {
    const rootUri = params.workspaceFolders?.[0]?.uri ?? params.rootUri;
    deps.tsService = createTsService({
        virtualDocs: state.virtualDocs,
        versions: state.versions,
        ...(rootUri ? { workspaceRoot: uriToPath(rootUri) } : {}),
    });
    return {
        capabilities: {
            textDocumentSync: TextDocumentSyncKind.Incremental,
            hoverProvider: true,
            // completionProvider is intentionally NOT declared — completion on
            // a // T: line lands inside comment trivia in the virtual document
            // and returns nothing (spec: "Deferred: Autocompletion", v2).
            //
            // diagnosticsProvider is NOT declared either: diagnostics use the
            // push model via connection.sendDiagnostics.
        },
    };
});

// TextDocuments fires onDidChangeContent for didOpen too, so this single hook
// covers both; an extra onDidOpen handler would double-process every open.
documents.onDidChangeContent(({ document }) => processDocument(state, deps, document));
documents.onDidClose(({ document }) => onDidClose(state, deps, document));
connection.onHover(params => onHover(state, deps, params));

documents.listen(connection);
connection.listen();
