const path = require("path")

module.exports = {
  // The repository intentionally contains API and web lockfiles.
  // Make tracing deterministic instead of allowing Next.js to guess the root.
  outputFileTracingRoot: path.join(__dirname, "../.."),
  // The developer-only Next.js route indicator distracts hotel staff during local demos.
  devIndicators: false,
}
