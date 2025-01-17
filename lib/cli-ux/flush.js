"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.flush = void 0;
const errors_1 = require("../errors");
function timeout(p, ms) {
    function wait(ms, unref = false) {
        return new Promise((resolve) => {
            const t = setTimeout(() => resolve(null), ms);
            if (unref)
                t.unref();
        });
    }
    return Promise.race([p, wait(ms, true).then(() => (0, errors_1.error)('timed out'))]);
}
async function _flush() {
    const p = new Promise((resolve) => {
        process.stdout.once('drain', () => resolve(null));
    });
    const flushed = process.stdout.write('');
    if (flushed)
        return;
    return p;
}
async function flush(ms = 10000) {
    await timeout(_flush(), ms);
}
exports.flush = flush;
