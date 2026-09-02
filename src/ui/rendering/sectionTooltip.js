/**
 * Pure screen-space projection math for turning a world position into the
 * DOM pixel position of a tooltip anchor, plus the sizing / density
 * classifications the tooltip needs to render.
 *
 * Kept framework-agnostic (no Vue, no three.js, no DOM) so it's testable
 * with plain numbers — the three.js consumer (WorldView3D.vue) just
 * hands over the projected clip-space vector and the canvas rect.
 */

/**
 * Converts a clip-space vector (post-projection: x,y ∈ [-1, 1], z is
 * depth) plus the renderer canvas's bounding rect into pixel-space DOM
 * coordinates relative to the canvas top-left, and reports whether the
 * point is BEHIND the camera (in which case the tooltip should hide).
 *
 * @param {{ x: number, y: number, z: number, w?: number }} clip result of Vector3.applyMatrix4(camera.projectionMatrix * matrixWorldInverse * localToWorld)
 * @param {{ width: number, height: number }} canvasRect
 * @returns {{ screenX: number, screenY: number, isBehindCamera: boolean, isOnScreen: boolean }}
 */
export function projectClipToScreen(clip, canvasRect) {
  // z outside [-1, 1] means the clip space wasn't normalized, or point is
  // beyond the near/far planes. We only care about behind-the-camera here
  // (z > 1 after projection means behind the near plane in three.js's
  // convention when Vector3.project() is used).
  const isBehindCamera = clip.z < -1 || clip.z > 1
  const screenX = (clip.x * 0.5 + 0.5) * canvasRect.width
  const screenY = (1 - (clip.y * 0.5 + 0.5)) * canvasRect.height
  const isOnScreen = !isBehindCamera && clip.x >= -1 && clip.x <= 1 && clip.y >= -1 && clip.y <= 1
  return { screenX, screenY, isBehindCamera, isOnScreen }
}

/**
 * Density classification for the tooltip's citation-per-sentence dot.
 * Buckets: barren (< 0.05), light (< 0.15), moderate (< 0.3), dense (< 0.5),
 * lush (≥ 0.5). Thresholds mirror CITATION_PER_SENTENCE's adjusted
 * thresholds so the tooltip's semantic maps 1:1 with the biome logic.
 *
 * @param {number} citationsPerSentence
 * @returns {'barren' | 'light' | 'moderate' | 'dense' | 'lush'}
 */
export function classifyCitationDensity(citationsPerSentence) {
  const value = Number(citationsPerSentence) || 0
  if (value < 0.05) return 'barren'
  if (value < 0.15) return 'light'
  if (value < 0.3) return 'moderate'
  if (value < 0.5) return 'dense'
  return 'lush'
}

/**
 * Rough "words" estimate from own-size (character count). Wikipedia's
 * average English-prose word length is ~5.1 chars including trailing
 * space, so dividing by 5.5 undershoots slightly — matches the "words
 * of actual prose" reading better than a tighter divisor would.
 *
 * @param {number} ownSizeChars
 */
export function estimateWordCount(ownSizeChars) {
  const chars = Math.max(0, Number(ownSizeChars) || 0)
  return Math.round(chars / 5.5)
}

/**
 * Formats an integer with thousands separators for the tooltip's size
 * chip (e.g. 1200 -> "1,200 words"). Pure so it's testable without
 * relying on the browser's locale defaults.
 *
 * @param {number} n
 */
export function formatWords(n) {
  const int = Math.max(0, Math.round(Number(n) || 0))
  // Manual thousands grouping so tests don't depend on Intl.NumberFormat
  // being English-locale-only on every runner.
  return `${int.toLocaleString('en-US')} word${int === 1 ? '' : 's'}`
}

/**
 * Counts a peak's direct subsections by walking the peaks array from the
 * top-level peak's index forward until the next top-level (or the end).
 * Uses peak.depth to detect the boundary.
 *
 * Works because flattenPeaks emits a depth-first order:
 *   [topA, subA1, subA1a, subA2, topB, subB1, ...]
 * Counting direct children means: peaks after topA whose sectionIndex
 * points to topA (Phase 1 stamp) and whose depth is exactly topA.depth + 1.
 *
 * @param {object[]} peaks
 * @param {number} topLevelIndex peaks-array index of the top-level section
 * @returns {number}
 */
export function countDirectSubsections(peaks, topLevelIndex) {
  if (!Array.isArray(peaks) || topLevelIndex < 0 || topLevelIndex >= peaks.length) return 0
  const parent = peaks[topLevelIndex]
  if (!parent) return 0
  const parentDepth = parent.depth ?? 1
  let count = 0
  for (let i = topLevelIndex + 1; i < peaks.length; i++) {
    const p = peaks[i]
    if ((p.depth ?? 0) <= parentDepth) break // hit next top-level (or shallower)
    if (p.sectionIndex === topLevelIndex && (p.depth ?? 0) === parentDepth + 1) count++
  }
  return count
}

/**
 * Builds the render model for the section tooltip from a peak object and
 * the surrounding peaks array. Pure — the Vue component just displays
 * these fields.
 *
 * @param {object} peak the hovered top-level peak (must have title, ownSize/subtreeSize, citationsPerSentence, sectionIndex, depth)
 * @param {object[]} peaks full peaks array (for subsection count)
 * @returns {{ title: string, subsectionCount: number, wordsLabel: string, densityBucket: string }}
 */
export function buildTooltipModel(peak, peaks) {
  if (!peak) return { title: '', subsectionCount: 0, wordsLabel: '', densityBucket: 'barren' }
  // Use subtreeSize when meaningfully larger — sections whose prose lives
  // in their subsections have ownSize=0 but a real subtreeSize.
  const size = Math.max(peak.subtreeSize ?? 0, peak.ownSize ?? 0)
  const words = estimateWordCount(size)
  return {
    title: peak.title ?? 'Untitled section',
    subsectionCount: countDirectSubsections(peaks ?? [], peak.sectionIndex ?? -1),
    wordsLabel: formatWords(words),
    densityBucket: classifyCitationDensity(
      peak.subtreeCitationsPerSentence ?? peak.citationsPerSentence ?? 0,
    ),
  }
}
