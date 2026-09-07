import { describe, expect, it } from 'vitest'
import { LUSHNESS } from '../../../src/engine/generation/config.js'
import { BIOME, LUSHNESS_BANDS, classifyBiome, lushnessBand } from '../../../src/engine/generation/terrain.js'

describe('lushnessBand', () => {
  it('walks all six bands in order across the scale', () => {
    // 0 is the reserved "cites nothing" value; the rest samples the
    // middle of each even fifth.
    const sampled = [0, 0.1, 0.3, 0.5, 0.7, 0.9].map(lushnessBand)

    expect(sampled).toEqual([...LUSHNESS_BANDS])
  })

  it('reserves the dunes for a section that cites nothing at all', () => {
    expect(lushnessBand(0)).toBe(BIOME.DUNES)
  })

  it('does not put a barely-cited section in the dunes', () => {
    // The distinction the sixth band exists for. Anything above the
    // reserved 0 is a section that cites SOMETHING, however little, and
    // must not claim otherwise.
    expect(lushnessBand(LUSHNESS.citedFloor)).toBe(BIOME.STEPPE)
    expect(lushnessBand(0.0001)).toBe(BIOME.STEPPE)
  })

  it('puts the top of the scale in the jungle', () => {
    expect(lushnessBand(1)).toBe(BIOME.JUNGLE)
  })

  it('is monotone: a lusher scalar never gives a drier band', () => {
    let previous = -1
    for (let lushness = 0; lushness <= 1.0001; lushness += 0.01) {
      const band = lushnessBand(lushness)
      expect(band).toBeGreaterThanOrEqual(previous)
      previous = band
    }
  })

  it('treats a missing or non-numeric scalar as zero', () => {
    expect(lushnessBand(undefined)).toBe(BIOME.DUNES)
    expect(lushnessBand(null)).toBe(BIOME.DUNES)
    expect(lushnessBand(NaN)).toBe(BIOME.DUNES)
  })
})

describe('classifyBiome', () => {
  it('classifies low height as ocean', () => {
    expect(classifyBiome(0.1, 0.5)).toBe(BIOME.OCEAN)
  })

  it('classifies the shoreline as beach', () => {
    expect(classifyBiome(0.34, 0.5)).toBe(BIOME.BEACH)
  })

  it('classifies high height as snow', () => {
    expect(classifyBiome(0.9, 0.5)).toBe(BIOME.SNOW)
  })

  it('classifies mid-high height as mountain', () => {
    expect(classifyBiome(0.75, 0.5)).toBe(BIOME.MOUNTAIN)
  })

  it('classifies land by its lushness band', () => {
    expect(classifyBiome(0.5, 0)).toBe(BIOME.DUNES)
    expect(classifyBiome(0.5, 0.5)).toBe(BIOME.MEADOW)
    expect(classifyBiome(0.5, 0.9)).toBe(BIOME.JUNGLE)
  })

  it('still lets altitude override lushness entirely', () => {
    // KNOWN, and the next phase's subject: a well-cited summit reads as
    // the same bare rock as a barren one.
    expect(classifyBiome(0.75, 1)).toBe(BIOME.MOUNTAIN)
    expect(classifyBiome(0.75, 0)).toBe(BIOME.MOUNTAIN)
  })
})
