// @vscode/test-electron entry point: downloads VS Code, loads the extension
// in development mode, opens fixtures/workspace, and runs the mocha suite.
const path = require('node:path');
const { runTests } = require('@vscode/test-electron');

async function main() {
    try {
        await runTests({
            extensionDevelopmentPath: path.resolve(__dirname, '..'),
            extensionTestsPath: path.resolve(__dirname, 'suite', 'index.js'),
            launchArgs: [
                path.resolve(__dirname, '..', '..', 'fixtures', 'workspace'),
                '--disable-extensions',
            ],
        });
    } catch (err) {
        console.error('e2e tests failed:', err);
        process.exit(1);
    }
}

main();
