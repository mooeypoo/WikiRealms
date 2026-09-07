import { BIOME } from '../../engine/generation/terrain.js'

/**
 * Foliage variants per biome. Each entry is a weighted probability of
 * being chosen when a land cell rolls for foliage. If chosen, `density`
 * decides whether it's actually placed at that cell (a second roll).
 *
 * A biome not in the map has NO foliage: ocean, beach, mountain, snow —
 * and DUNES, which means the section cites nothing and should read as
 * bare ground rather than as sparse cover.
 *
 * Kept as pure data so the values can be tuned and the pick logic
 * unit-tested without touching three.js. `size` and `color` flow through
 * to the sprite material; `kind` picks the texture (leaf shape).
 */
export const FOLIAGE_VARIANTS_BY_BIOME = Object.freeze({
  [BIOME.STEPPE]: [
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
 * Density scaling factors, applied on top of a variant's own `density`.
 *
 * The scale is a straight lerp across the lushness scalar, chosen so
 * lushness 0.5 — a section citing at exactly its article's own rate —
 * lands on 1.0 and leaves the biome default untouched.
 */
export const FOLIAGE_DENSITY = Object.freeze({
  min: 0.4, // lushness 0
  max: 1.6, // lushness 1
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
 * Density scale ∈ [FOLIAGE_DENSITY.min, FOLIAGE_DENSITY.max] from this
 * cell's lushness.
 *
 * Reads the same scalar the ground colour and the band name read, which
 * is the point: foliage used to normalize citations-per-sentence against
 * the article average on its own, while the biome under it classified on
 * absolute thresholds, so the two disagreed about what "lush" meant.
 *
 * @param {number} lushness [0, 1] from lushness.js
 */
export function computeFoliageDensityScale(lushness) {
  const value = Math.min(1, Math.max(0, Number(lushness) || 0))
  return FOLIAGE_DENSITY.min + (FOLIAGE_DENSITY.max - FOLIAGE_DENSITY.min) * value
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
