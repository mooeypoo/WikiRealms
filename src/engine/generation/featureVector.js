/**
 * Turns a normalized Article (see docs/model.md) into a bounded feature
 * vector used as terrain generation input. Pure and deterministic: the
 * same article always yields the same feature vector.
 *
 * All features are normalized to the [0, 1] range so terrain rules can
 * treat them uniformly regardless of the underlying article's scale.
 */

function clamp01(value) {
  return Math.min(1, Math.max(0, value))
}

/**
 * Maps a raw count onto [0, 1] using a soft cap, so a handful of extra
 * links/categories/images doesn't swing the value drastically.
 * @param {number} count
 * @param {number} softCap value at which the feature approaches 1
 */
function normalizeCount(count, softCap) {
  return clamp01((count ?? 0) / softCap)
}

/**
 * @param {object} article Article (docs/model.md)
 * @returns {{ summaryLength: number, categoryDensity: number, linkDensity: number, imageDensity: number }}
 */
export function extractFeatureVector(article) {
  const summaryLength = normalizeCount(article.summary?.length ?? 0, 1200)
  const categoryDensity = normalizeCount(article.categories?.length ?? 0, 15)
  const linkDensity = normalizeCount(article.links?.length ?? 0, 150)
  const imageDensity = normalizeCount(article.images?.length ?? 0, 20)

  return { summaryLength, categoryDensity, linkDensity, imageDensity }
}
