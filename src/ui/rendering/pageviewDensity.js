/**
 * How busy an article is → how many creatures the world hosts.
 *
 * Categories still pick WHICH families appear; this only scales COUNT.
 * Log-compressed so a viral page does not flood the map and a quiet stub
 * is not empty forever — and so Everest and a niche biography stay in
 * one readable band.
 *
 * Free of three.js / adapters: pure arithmetic for tests.
 */

/** Below this many 30-day views, oceans stay empty (land may still host a few). */
export const SEA_PAGEVIEW_THRESHOLD = 8000

/**
 * Maps a 30-day pageview total to a density scale in [0.12, 1].
 *
 * `null` / missing → a quiet default (fetch soft-failed or not yet wired).
 *
 * @param {number|null|undefined} pageviews
 * @returns {number}
 */
export function pageviewDensityScale(pageviews) {
  if (pageviews == null || !Number.isFinite(pageviews) || pageviews < 0) return 0.28
  if (pageviews === 0) return 0.12

  // log10(100)≈2 … log10(10_000_000)≈7 covers stubs through mega-pages.
  const log = Math.log10(pageviews + 1)
  const u = Math.min(1, Math.max(0, (log - 2) / 5))
  return 0.12 + u * 0.88
}

/**
 * Whether sea leviathans should appear for this popularity.
 *
 * When pageviews are known, the hard threshold wins — quiet articles stay
 * land-only even if the log curve would otherwise look "busy enough".
 * Unknown metrics fall back to the density scale alone.
 *
 * @param {number|null|undefined} pageviews
 * @param {number} [densityScale]
 */
export function allowSeaCreatures(pageviews, densityScale = pageviewDensityScale(pageviews)) {
  if (pageviews != null && Number.isFinite(pageviews)) {
    return pageviews >= SEA_PAGEVIEW_THRESHOLD
  }
  return densityScale >= 0.45
}
