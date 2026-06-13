// Programmatic mocha runner loaded by @vscode/test-electron inside the
// extension host.
const path = require('node:path');
const fs = require('node:fs');
const Mocha = require('mocha');

function run() {
    const mocha = new Mocha({ ui: 'bdd', color: true, timeout: 30_000 });
    for (const f of fs.readdirSync(__dirname).filter(n => n.endsWith('.e2e.test.js')).sort()) {
        mocha.addFile(path.resolve(__dirname, f));
    }

    return new Promise((resolve, reject) => {
        mocha.run(failures =>
            failures ? reject(new Error(`${failures} e2e test(s) failed`)) : resolve()
        );
    });
}

module.exports = { run };
