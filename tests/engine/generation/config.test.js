import { describe, expect, it } from 'vitest'
import {
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
    expect(Object.isFrozen(FEATURE_SOFT_CAPS)).toBe(true)
    expect(Object.isFrozen(PORTAL_LIMITS)).toBe(true)
    expect(Object.isFrozen(SECTION_LIMITS)).toBe(true)
  })

  it('keeps biome thresholds in a sensible ascending order', () => {
    expect(BIOME_THRESHOLDS.oceanMaxHeight).toBeLessThan(BIOME_THRESHOLDS.beachMaxHeight)
    expect(BIOME_THRESHOLDS.beachMaxHeight).toBeLessThan(BIOME_THRESHOLDS.mountainMinHeight)
    expect(BIOME_THRESHOLDS.mountainMinHeight).toBeLessThan(BIOME_THRESHOLDS.snowMinHeight)
  })

  // The planet view reads the grid as an equirectangular map: width spans
  // 360° of longitude, height spans 180° of latitude. Any other aspect
  // stretches every landmass when wrapped onto a sphere.
  it('keeps the grid at a 2:1 equirectangular aspect', () => {
    expect(GRID.width).toBe(GRID.height * 2)
  })
})
