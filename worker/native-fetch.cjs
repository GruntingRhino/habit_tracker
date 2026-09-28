// Bundling swaps grammy's node-fetch/abort-controller polyfills for Node's built-ins.
module.exports = globalThis.fetch;
module.exports.default = globalThis.fetch;
