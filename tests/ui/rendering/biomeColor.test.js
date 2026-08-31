import { describe, expect, it } from 'vitest'
import { BIOME } from '../../../src/engine/generation/terrain.js'
import { biomeColor } from '../../../src/ui/rendering/biomeColor.js'

describe('biomeColor', () => {
  it('is deterministic for the same biome and height', () => {
    expect(biomeColor(BIOME.FOREST, 0.5)).toBe(biomeColor(BIOME.FOREST, 0.5))
  })

  it('returns a valid CSS rgb() string', () => {
    expect(biomeColor(BIOME.OCEAN, 0.2)).toMatch(/^rgb\(\d+, \d+, \d+\)$/)
  })

  it('produces different colors for different biomes at the same height', () => {
    const ocean = biomeColor(BIOME.OCEAN, 0.5)
    const forest = biomeColor(BIOME.FOREST, 0.5)
    const snow = biomeColor(BIOME.SNOW, 0.5)

    expect(ocean).not.toBe(forest)
    expect(forest).not.toBe(snow)
    expect(ocean).not.toBe(snow)
  })

  it('shades the same biome brighter as height increases', () => {
    function brightness(color) {
      const [r, g, b] = color.match(/\d+/g).map(Number)
      return r + g + b
    }

    const low = biomeColor(BIOME.PLAINS, 0.1)
    const high = biomeColor(BIOME.PLAINS, 0.9)

    expect(brightness(high)).toBeGreaterThan(brightness(low))
  })

  it('falls back to a neutral color for an unknown biome id', () => {
    expect(biomeColor(999, 0.5)).toMatch(/^rgb\(\d+, \d+, \d+\)$/)
  })
})
