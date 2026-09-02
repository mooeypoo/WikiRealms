import { BIOME } from '../../engine/generation/terrain.js'

/**
 * Foliage variants per biome. Each entry is a weighted probability of
 * being chosen when a land cell rolls for foliage. If chosen, `density`
 * decides whether it's actually placed at that cell (a second roll).
 * A biome not in the map has NO foliage (ocean, beach, mountain, snow).
 *
 * Kept as pure data so the values can be tuned and the pick logic
 * unit-tested without touching three.js. `size` and `color` flow through
 * to the sprite material; `kind` picks the texture (leaf shape).
 */
export const FOLIAGE_VARIANTS_BY_BIOME = Object.freeze({
  [BIOME.DESERT]: [
    { kind: 'scrub', color: 0x9a7d42, size: 1.5, density: 0.08, weight: 0.85 },
    { kind: 'scrub', color: 0xb08c50, size: 2.4, density: 0.02, weight: 0.15 },
  ],
  [BIOME.LIGHT_VEG]: [
    { kind: 'grass', color: 0xa7c86b, size: 1.8, density: 0.28, weight: 0.85 },
    { kind: 'grass', color: 0xe5c04d, size: 2.0, density: 0.03, weight: 0.15 },
  ],
  [BIOME.MEADOW]: [
    { kind: 'grass', color: 0x75ba55, size: 2.1, density: 0.48, weight: 0.75 },
    { kind: 'grass', color: 0xd66b6b, size: 2.0, density: 0.04, weight: 0.10 },
    { kind: 'scrub', color: 0x8e9f6a, size: 2.6, density: 0.05, weight: 0.15 },
  ],
  [BIOME.WOODLAND]: [
    { kind: 'tree', color: 0x3f793f, size: 3.8, density: 0.66, weight: 0.80 },
    { kind: 'canopy', color: 0x2f5e2f, size: 4.2, density: 0.06, weight: 0.12 },
    { kind: 'scrub', color: 0x8a7a55, size: 2.8, density: 0.04, weight: 0.08 },
  ],
  [BIOME.JUNGLE]: [
    { kind: 'canopy', color: 0x1f6937, size: 4.8, density: 0.80, weight: 0.85 },
    { kind: 'grass', color: 0xe5be3f, size: 2.2, density: 0.05, weight: 0.10 },
    { kind: 'tree', color: 0x2b7548, size: 4.4, density: 0.06, weight: 0.05 },
  ],
})

/**
 * Density scaling factors. Cells whose section is well-cited (relative
 * to the article's average) get denser foliage than the biome default;
 * sparsely-cited cells get sparser. Clamped so pathological articles
 * don't produce empty maps or overgrown blobs.
 */
export const FOLIAGE_DENSITY = Object.freeze({
  min: 0.5, // barren-section floor
  max: 1.6, // lush-section ceiling
})

/**
 * Picks which foliage variant to try placing at a cell in `biome`,
 * using `variantRoll` (0-1) to sample from the biome's weighted
 * distribution. Returns null for biomes without foliage (ocean, beach,
 * mountain, snow).
 *
 * @param {number} biome BIOME enum value
 * @param {number} variantRoll [0, 1)
 */
export function pickFoliageVariant(biome, variantRoll) {
  const variants = FOLIAGE_VARIANTS_BY_BIOME[biome]
  if (!variants || variants.length === 0) return null
  let cumulative = 0
  for (const v of variants) {
    cumulative += v.weight
    if (variantRoll < cumulative) return v
  }
  return variants[variants.length - 1] // safety for float rounding
}

/**
 * Density scale ∈ [FOLIAGE_DENSITY.min, FOLIAGE_DENSITY.max] based on
 * this cell's citations-per-sentence relative to the article's mean.
 * Cells in above-average sections get lusher foliage; below-average
 * sections get sparser. Returns 1 when the article-wide average is 0
 * (no citations to compare) or the cell has no cps assigned.
 *
 * @param {number} citationsPerSentence
 * @param {number} articleAverage
 */
export function computeFoliageDensityScale(citationsPerSentence, articleAverage) {
  if (!articleAverage || articleAverage <= 0) return 1
  const cps = Number(citationsPerSentence) || 0
  const ratio = cps / articleAverage
  return Math.min(FOLIAGE_DENSITY.max, Math.max(FOLIAGE_DENSITY.min, ratio))
}

/**
 * Deterministic per-cell hash yielding two independent-ish [0, 1) rolls
 * — one for variant pick, one for density check. Same hash mixing the
 * previous flat-density implementation used, just split by bit range so
 * the two decisions don't correlate.
 *
 * @param {number} gridX
 * @param {number} gridY
 * @param {number} seed world seed
 */
export function cellFoliageRolls(gridX, gridY, seed) {
  const hash = ((gridX * 73856093) ^ (gridY * 19349663) ^ seed) >>> 0
  return {
    variantRoll: (hash & 0xffff) / 0x10000,
    densityRoll: ((hash >>> 16) & 0xffff) / 0x10000,
  }
}

/**
 * Convenience: article-wide average citations-per-sentence across the
 * top-level sections, used as the denominator for
 * `computeFoliageDensityScale`. Pure — takes a peaks array, returns a
 * single number.
 *
 * @param {object[]} peaks
 */
export function computeArticleAverageCps(peaks) {
  if (!Array.isArray(peaks) || peaks.length === 0) return 0
  let sum = 0
  let count = 0
  for (const peak of peaks) {
    if ((peak.depth ?? 0) > 1) continue
    sum += peak.subtreeCitationsPerSentence ?? 0
    count++
  }
  return count > 0 ? sum / count : 0
}
