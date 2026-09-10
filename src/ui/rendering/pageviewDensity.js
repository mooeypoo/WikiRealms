/**
 * How busy an article is → how many fish the oceans host.
 *
 * Categories still pick WHICH species appear; this only scales COUNT.
 * Log-compressed so a viral page does not flood the map and a quiet stub
 * is not empty forever — and so Everest and a niche biography stay in
 * one readable band.
 *
 * Free of three.js / adapters: pure arithmetic for tests.
 */

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
 * Sea fauna always appears when there is ocean — pageviews only change
 * how many fish swim, not whether the seas wake at all.
 *
 * @param {number|null|undefined} [_pageviews]
 * @param {number} [_densityScale]
 */
export function allowSeaCreatures(_pageviews, _densityScale) {
  return true
}

/** @deprecated Fauna is water-only; threshold no longer gates spawning. */
export const SEA_PAGEVIEW_THRESHOLD = 0
