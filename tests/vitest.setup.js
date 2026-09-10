/**
 * jsdom's canvas.getContext emits a virtualConsole "jsdomError" (and returns
 * null) when the optional `canvas` package is missing. That floods App tests
 * that mount WorldView's 2D fallback. Stubbing keeps the same null return
 * without the noise; suites that need a real context already guard and skip.
 */
HTMLCanvasElement.prototype.getContext = function getContext() {
  return null
}
