/**
 * Whether this browser can render the world in 3D.
 *
 * Extracted so the app can decide WHICH view to mount, rather than mounting
 * the 3D one and letting it discover the bad news for itself. That decision
 * is what makes docs/ux-vision.md D1 work: Planet and Flat are one axis in
 * 3D, and the 2D canvas is a rendering fallback reached by capability or by
 * choice — never a third peer view.
 */

let cached = null

export function detectWebGLSupport() {
  if (typeof document === 'undefined') return false

  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'))
  } catch {
    // Some browsers throw rather than return null when WebGL is blocked.
    return false
  }
}

/** The same answer for the life of the page; probing repeatedly leaks contexts. */
export function supportsWebGL() {
  if (cached === null) cached = detectWebGLSupport()
  return cached
}

/** Test seam. */
export function resetWebGLSupport() {
  cached = null
}
