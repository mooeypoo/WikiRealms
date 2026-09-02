import { describe, expect, it } from 'vitest'
import {
  FOLIAGE_DENSITY,
  FOLIAGE_VARIANTS_BY_BIOME,
  cellFoliageRolls,
  computeArticleAverageCps,
  computeFoliageDensityScale,
  pickFoliageVariant,
} from '../../../src/ui/rendering/foliage.js'
import { BIOME } from '../../../src/engine/generation/terrain.js'

describe('FOLIAGE_VARIANTS_BY_BIOME', () => {
  it('defines variants only for the five vegetated biomes', () => {
    const keys = Object.keys(FOLIAGE_VARIANTS_BY_BIOME).map((k) => Number(k))
    expect(keys.sort()).toEqual(
      [BIOME.DESERT, BIOME.LIGHT_VEG, BIOME.MEADOW, BIOME.WOODLAND, BIOME.JUNGLE].sort(),
    )
  })

  it("each variant list's weights sum to approximately 1", () => {
    for (const [biome, variants] of Object.entries(FOLIAGE_VARIANTS_BY_BIOME)) {
      const total = variants.reduce((sum, v) => sum + v.weight, 0)
      expect(total).toBeCloseTo(1, 2)
    }
  })

  it('every variant declares kind, color, size, density, weight', () => {
    for (const variants of Object.values(FOLIAGE_VARIANTS_BY_BIOME)) {
      for (const v of variants) {
        expect(typeof v.kind).toBe('string')
        expect(typeof v.color).toBe('number')
        expect(typeof v.size).toBe('number')
        expect(typeof v.density).toBe('number')
        expect(typeof v.weight).toBe('number')
      }
    }
  })
})

describe('pickFoliageVariant', () => {
  it('returns null for biomes without foliage (ocean, beach, mountain, snow)', () => {
    expect(pickFoliageVariant(BIOME.OCEAN, 0.5)).toBeNull()
    expect(pickFoliageVariant(BIOME.BEACH, 0.5)).toBeNull()
    expect(pickFoliageVariant(BIOME.MOUNTAIN, 0.5)).toBeNull()
    expect(pickFoliageVariant(BIOME.SNOW, 0.5)).toBeNull()
  })

  it('returns the first variant when the roll falls below its weight', () => {
    // First MEADOW variant has weight 0.75 → any roll < 0.75 → grass
    const v = pickFoliageVariant(BIOME.MEADOW, 0.1)
    expect(v.kind).toBe('grass')
    expect(v.color).toBe(0x75ba55)
  })

  it('returns a later variant when the roll exceeds earlier weights', () => {
    // MEADOW weights are grass(0.75) + wildflower(0.10) + shrub(0.15).
    // Roll 0.9 lands in the shrub bucket.
    const v = pickFoliageVariant(BIOME.MEADOW, 0.9)
    expect(v.kind).toBe('scrub')
  })

  it('never returns undefined at roll=1 (safety fallback)', () => {
    for (const biomeKey of Object.keys(FOLIAGE_VARIANTS_BY_BIOME)) {
      const v = pickFoliageVariant(Number(biomeKey), 1 - 1e-9)
      expect(v).toBeTruthy()
    }
  })
})

describe('computeFoliageDensityScale', () => {
  it('returns 1 when the article-wide average is 0 or missing', () => {
    expect(computeFoliageDensityScale(0.2, 0)).toBe(1)
    expect(computeFoliageDensityScale(0.2, null)).toBe(1)
  })

  it('scales proportionally to the ratio of cell/article citations-per-sentence', () => {
    // Cell at 2x the average → clamped to max (1.6)
    expect(computeFoliageDensityScale(0.4, 0.2)).toBe(FOLIAGE_DENSITY.max)
    // Cell at the average → 1
    expect(computeFoliageDensityScale(0.2, 0.2)).toBeCloseTo(1)
    // Cell at 0.7x → 0.7
    expect(computeFoliageDensityScale(0.14, 0.2)).toBeCloseTo(0.7)
  })

  it('clamps to the barren-section floor for very low values', () => {
    expect(computeFoliageDensityScale(0.01, 0.5)).toBe(FOLIAGE_DENSITY.min)
    expect(computeFoliageDensityScale(0, 0.5)).toBe(FOLIAGE_DENSITY.min)
  })

  it('treats non-numeric cell values as 0', () => {
    expect(computeFoliageDensityScale('not-a-number', 0.5)).toBe(FOLIAGE_DENSITY.min)
    expect(computeFoliageDensityScale(undefined, 0.5)).toBe(FOLIAGE_DENSITY.min)
  })
})

describe('cellFoliageRolls', () => {
  it('is deterministic for the same (gridX, gridY, seed)', () => {
    const a = cellFoliageRolls(10, 20, 42)
    const b = cellFoliageRolls(10, 20, 42)
    expect(a).toEqual(b)
  })

  it('yields values in [0, 1)', () => {
    for (let x = 0; x < 20; x++) {
      for (let y = 0; y < 20; y++) {
        const { variantRoll, densityRoll } = cellFoliageRolls(x, y, 1234)
        expect(variantRoll).toBeGreaterThanOrEqual(0)
        expect(variantRoll).toBeLessThan(1)
        expect(densityRoll).toBeGreaterThanOrEqual(0)
        expect(densityRoll).toBeLessThan(1)
      }
    }
  })

  it('changes when the seed changes', () => {
    const a = cellFoliageRolls(5, 5, 1)
    const b = cellFoliageRolls(5, 5, 2)
    expect(a).not.toEqual(b)
  })

  it('has weak correlation between the two rolls across a sample grid', () => {
    // Not a rigorous independence test, just guards against the two
    // being trivially the same value.
    let same = 0
    for (let x = 0; x < 30; x++) {
      for (let y = 0; y < 30; y++) {
        const { variantRoll, densityRoll } = cellFoliageRolls(x, y, 7)
        if (Math.abs(variantRoll - densityRoll) < 0.01) same++
      }
    }
    // With independent uniform-ish rolls we'd expect ~1% collisions in
    // this window (0.01 tolerance out of [0, 1]) ≈ 9 out of 900. Give
    // ourselves a generous ceiling.
    expect(same).toBeLessThan(50)
  })
})

describe('computeArticleAverageCps', () => {
  it('averages subtreeCitationsPerSentence over top-level peaks only', () => {
    const peaks = [
      { depth: 1, subtreeCitationsPerSentence: 0.2 },
      { depth: 2, subtreeCitationsPerSentence: 0.9 }, // ignored
      { depth: 1, subtreeCitationsPerSentence: 0.4 },
    ]
    expect(computeArticleAverageCps(peaks)).toBeCloseTo(0.3)
  })

  it('returns 0 for an empty peaks list', () => {
    expect(computeArticleAverageCps([])).toBe(0)
    expect(computeArticleAverageCps(null)).toBe(0)
  })
})
