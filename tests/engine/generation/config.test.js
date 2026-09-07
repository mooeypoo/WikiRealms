import { describe, expect, it } from 'vitest'
import {
  ALTITUDE,
  BIOME_THRESHOLDS,
  FEATURE_SOFT_CAPS,
  GRID,
  PORTAL_LIMITS,
  SECTION_LIMITS,
} from '../../../src/engine/generation/config.js'

describe('generation engine config', () => {
  it('exposes a single frozen source of truth for each tunable group', () => {
    expect(Object.isFrozen(GRID)).toBe(true)
    expect(Object.isFrozen(BIOME_THRESHOLDS)).toBe(true)
    expect(Object.isFrozen(ALTITUDE)).toBe(true)
    expect(Object.isFrozen(FEATURE_SOFT_CAPS)).toBe(true)
    expect(Object.isFrozen(PORTAL_LIMITS)).toBe(true)
    expect(Object.isFrozen(SECTION_LIMITS)).toBe(true)
  })

  it('keeps the waterline below the shoreline', () => {
    expect(BIOME_THRESHOLDS.oceanMaxHeight).toBeLessThan(BIOME_THRESHOLDS.beachMaxHeight)
  })

  it('stacks the altitude bands in the order they happen on a mountain', () => {
    // Trees thin out before stone starts showing, and snow settles on
    // ground that is already rocky.
    expect(ALTITUDE.treelineStart).toBeLessThan(ALTITUDE.treelineEnd)
    expect(ALTITUDE.treelineStart).toBeLessThan(ALTITUDE.rockStart)
    expect(ALTITUDE.rockStart).toBeLessThan(ALTITUDE.rockFull)
    expect(ALTITUDE.rockStart).toBeLessThan(ALTITUDE.snowStart)
    expect(ALTITUDE.snowStart).toBeLessThan(ALTITUDE.snowFull)
    expect(BIOME_THRESHOLDS.beachMaxHeight).toBeLessThan(ALTITUDE.treelineStart)
  })

  it('overlaps the rock and snow bands, so no altitude is one surface', () => {
    // A gap would put back the uniform grey shelf the thresholds made.
    expect(ALTITUDE.snowStart).toBeLessThan(ALTITUDE.rockFull)
  })

  // The planet view reads the grid as an equirectangular map: width spans
  // 360° of longitude, height spans 180° of latitude. Any other aspect
  // stretches every landmass when wrapped onto a sphere.
  it('keeps the grid at a 2:1 equirectangular aspect', () => {
    expect(GRID.width).toBe(GRID.height * 2)
  })
})
