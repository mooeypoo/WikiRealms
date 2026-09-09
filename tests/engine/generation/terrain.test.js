import { describe, expect, it } from 'vitest'
import { ALTITUDE, BIOME_THRESHOLDS, LUSHNESS, SHORE } from '../../../src/engine/generation/config.js'
import {
  BIOME,
  LUSHNESS_BANDS,
  classifyBiome,
  lushnessBand,
  rockCover,
  frostCover,
  sandCover,
  seaFloorCover,
  snowCover,
  treelineFactor,
} from '../../../src/engine/generation/terrain.js'

describe('BIOME', () => {
  it('is exactly the ground a world can have', () => {
    // Pinned because a removed member does not fail loudly: BIOME.MISSING
    // is `undefined`, a Uint8Array coerces that to 0, and a test asserting
    // "these two biomes differ" then compares ocean to ocean. That has
    // happened three times in this file's neighbours — BIOME.PLAINS,
    // BIOME.FOREST and BIOME.MOUNTAIN all outlived the code that made
    // them, in tests that passed.
    expect(Object.keys(BIOME).sort()).toEqual(
      ['BEACH', 'DUNES', 'JUNGLE', 'LIGHT_VEG', 'MEADOW', 'OCEAN', 'SNOW', 'STEPPE', 'WOODLAND'].sort(),
    )
    expect(Object.values(BIOME).every((id) => Number.isInteger(id))).toBe(true)
  })

  it('numbers the lushness bands in order, so a band id can be compared', () => {
    for (let i = 1; i < LUSHNESS_BANDS.length; i++) {
      expect(LUSHNESS_BANDS[i]).toBeGreaterThan(LUSHNESS_BANDS[i - 1])
    }
  })
})

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

  it('classifies land by its lushness band', () => {
    expect(classifyBiome(0.5, 0)).toBe(BIOME.DUNES)
    expect(classifyBiome(0.5, 0.5)).toBe(BIOME.MEADOW)
    expect(classifyBiome(0.5, 0.9)).toBe(BIOME.JUNGLE)
  })

  it('keeps a summit’s band, so altitude no longer erases what it cites', () => {
    // Altitude used to REPLACE the band: a well-cited summit and a barren
    // one both became the same bare rock. Rock is cover now (rockCover),
    // and the band underneath still says what the section cites.
    expect(classifyBiome(0.95, 1)).toBe(BIOME.JUNGLE)
    expect(classifyBiome(0.95, 0)).toBe(BIOME.DUNES)
    expect(classifyBiome(0.75, 0.5)).toBe(BIOME.MEADOW)
  })
})

describe('rockCover', () => {
  it('is nothing below the band and complete above it', () => {
    expect(rockCover(ALTITUDE.rockStart)).toBe(0)
    expect(rockCover(0.2)).toBe(0)
    expect(rockCover(ALTITUDE.rockFull)).toBeCloseTo(1)
    expect(rockCover(1)).toBeCloseTo(1)
  })

  it('rises with no step anywhere, so peaks carry no contour line', () => {
    // The threshold this replaces drew a visible line across every peak
    // in the world at exactly one height.
    let previous = rockCover(0)
    for (let height = 0.01; height <= 1.0001; height += 0.01) {
      const current = rockCover(height)
      expect(current).toBeGreaterThanOrEqual(previous)
      expect(current - previous).toBeLessThan(0.12)
      previous = current
    }
  })
})

describe('sandCover', () => {
  it('is complete at the waterline and gone above the band', () => {
    expect(sandCover(BIOME_THRESHOLDS.oceanMaxHeight)).toBeCloseTo(1)
    expect(sandCover(SHORE.sandFadeFrom)).toBeCloseTo(1)
    expect(sandCover(SHORE.sandFadeTo)).toBeCloseTo(0)
    expect(sandCover(1)).toBe(0)
  })

  it('is centred on the threshold it replaces, so the coast does not move', () => {
    // The property that matters, and the one an earlier cut of this got
    // wrong: a band running upwards FROM the threshold softens the edge
    // and carries the sand inland with it. Centred, the two halves of
    // the curve cancel and the total cover is what the classification
    // covered — same sand, softer edge.
    expect(sandCover(BIOME_THRESHOLDS.beachMaxHeight)).toBeCloseTo(0.5, 5)

    const step = 0.0005
    let area = 0
    for (let h = 0; h <= 1; h += step) area += sandCover(h) * step
    // The classification's own area: full sand from 0 to beachMaxHeight.
    expect(area).toBeCloseTo(BIOME_THRESHOLDS.beachMaxHeight, 2)
  })

  it('stays complete below the waterline, since a shelf is still sand', () => {
    // seaFloorCover is what takes the sand back down there, not this.
    expect(sandCover(0.1)).toBeCloseTo(1)
    expect(sandCover(0)).toBeCloseTo(1)
  })

  it('falls without ever going back up', () => {
    // Monotone is the shape claim; how big a move it makes across one
    // grid cell is a question about colour, and is asserted where the
    // colour is composed. See groundRgbAt's tests.
    let previous = sandCover(0)
    for (let height = 0.005; height <= 1.0001; height += 0.005) {
      const current = sandCover(height)
      expect(current).toBeLessThanOrEqual(previous + 1e-9)
      previous = current
    }
  })

  it('passes through the middle of its band rather than jumping it', () => {
    const quarter = SHORE.sandFadeFrom + (SHORE.sandFadeTo - SHORE.sandFadeFrom) * 0.25
    expect(sandCover(quarter)).toBeGreaterThan(0.7)
    expect(sandCover(quarter)).toBeLessThan(1)
  })
})

describe('seaFloorCover', () => {
  it('is nothing at the waterline and complete below the shelf', () => {
    expect(seaFloorCover(BIOME_THRESHOLDS.oceanMaxHeight)).toBeCloseTo(0)
    expect(seaFloorCover(SHORE.seaFloorFull)).toBeCloseTo(1)
    expect(seaFloorCover(0)).toBeCloseTo(1)
  })

  it('takes nothing back on dry land', () => {
    expect(seaFloorCover(BIOME_THRESHOLDS.beachMaxHeight)).toBe(0)
    expect(seaFloorCover(0.5)).toBe(0)
  })

  it('rises without ever going back down', () => {
    let previous = seaFloorCover(1)
    for (let height = 0.995; height >= -0.0001; height -= 0.005) {
      const current = seaFloorCover(height)
      expect(current).toBeGreaterThanOrEqual(previous - 1e-9)
      previous = current
    }
  })

  it('is no steeper than the fade above it, which it once was', () => {
    // The sand and the deep blue are further apart than the sand and any
    // land band, so this band carrying the narrower width made it the
    // steepest thing on the coast. See SHORE.seaFloorFull.
    const sandWidth = SHORE.sandFadeTo - SHORE.sandFadeFrom
    const floorWidth = BIOME_THRESHOLDS.oceanMaxHeight - SHORE.seaFloorFull

    expect(floorWidth).toBeGreaterThanOrEqual(sandWidth)
  })

  it('does not overlap the rock band, so the two covers cannot fight', () => {
    // Their order in groundRgbAt is then for reading rather than for
    // arithmetic, which is what that comment claims.
    expect(seaFloorCover(ALTITUDE.rockStart)).toBe(0)
    expect(rockCover(SHORE.sandFadeTo)).toBe(0)
  })
})

describe('snowCover', () => {
  it('is nothing below the band and complete above it', () => {
    expect(snowCover(ALTITUDE.snowStart)).toBe(0)
    expect(snowCover(ALTITUDE.snowFull)).toBeCloseTo(1)
  })

  it('starts before the rock band has finished', () => {
    // Overlapping on purpose: otherwise there is a height at which the
    // ground is uniformly one surface, which is the shelf the old
    // thresholds produced.
    expect(snowCover(ALTITUDE.rockFull)).toBeGreaterThan(0)
  })

  it('rises with no step anywhere', () => {
    let previous = snowCover(0)
    for (let height = 0.01; height <= 1.0001; height += 0.01) {
      const current = snowCover(height)
      expect(current).toBeGreaterThanOrEqual(previous)
      expect(current - previous).toBeLessThan(0.12)
      previous = current
    }
  })
})

describe('frostCover', () => {
  it('puts snow on crowns well below where it lies on the ground', () => {
    // The two bands are separate on purpose. A crown is a thin exposed
    // thing that takes rime long before open ground holds a covering,
    // and at these heights the slope is already more scree than soil.
    expect(ALTITUDE.frostStart).toBeLessThan(ALTITUDE.snowStart)
    expect(frostCover(ALTITUDE.snowStart)).toBeGreaterThan(snowCover(ALTITUDE.snowStart))
  })

  it('reaches full cover while trees can still be standing', () => {
    // The invariant that was violated in the version this replaces: the
    // band where snow appears has to overlap the band where trees
    // survive, or the effect exists only in the shader. Both ends of the
    // frost band sit under the treeline, so there is real depth of
    // overlap rather than a shared edge.
    expect(ALTITUDE.frostFull).toBeLessThan(ALTITUDE.treelineEnd)
    expect(treelineFactor(ALTITUDE.frostFull, 0)).toBeGreaterThan(0)
  })

  it('rises with no step anywhere', () => {
    let previous = frostCover(0)
    for (let height = 0.01; height <= 1.0001; height += 0.01) {
      const current = frostCover(height)
      expect(current).toBeGreaterThanOrEqual(previous)
      expect(current - previous).toBeLessThan(0.12)
      previous = current
    }
  })
})

describe('treelineFactor', () => {
  it('leaves low ground fully planted', () => {
    expect(treelineFactor(0.4, 0.5)).toBe(1)
    expect(treelineFactor(ALTITUDE.treelineStart, 0)).toBe(1)
  })

  it('reaches nothing above the treeline', () => {
    expect(treelineFactor(ALTITUDE.treelineEnd, 0)).toBeCloseTo(0)
    expect(treelineFactor(1, 0)).toBe(0)
  })

  it('thins rather than shears: mid-band keeps some of its foliage', () => {
    // Above the old threshold, foliage was not thinned but deleted.
    const middle = (ALTITUDE.treelineStart + ALTITUDE.treelineEnd) / 2
    const factor = treelineFactor(middle, 0)

    expect(factor).toBeGreaterThan(0.2)
    expect(factor).toBeLessThan(0.8)
  })

  it('lifts a well-cited section’s treeline above a barren one’s', () => {
    const height = ALTITUDE.treelineEnd - 0.02

    expect(treelineFactor(height, 1)).toBeGreaterThan(treelineFactor(height, 0))
  })

  it('never inverts: more lushness never means less foliage at a height', () => {
    for (let height = 0.4; height <= 1; height += 0.05) {
      let previous = -1
      for (let lushness = 0; lushness <= 1.0001; lushness += 0.1) {
        const factor = treelineFactor(height, lushness)
        expect(factor).toBeGreaterThanOrEqual(previous)
        previous = factor
      }
    }
  })

  it('treats a missing lushness as barren', () => {
    expect(treelineFactor(0.7)).toBe(treelineFactor(0.7, 0))
  })
})
