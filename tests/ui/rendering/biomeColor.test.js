import { describe, expect, it } from 'vitest'
import { BIOME, LUSHNESS_BANDS } from '../../../src/engine/generation/terrain.js'
import { biomeColor } from '../../../src/ui/rendering/biomeColor.js'

describe('biomeColor', () => {
  it('is deterministic for the same biome and height', () => {
    expect(biomeColor(BIOME.WOODLAND, 0.5)).toBe(biomeColor(BIOME.WOODLAND, 0.5))
  })

  it('returns a valid CSS rgb() string', () => {
    expect(biomeColor(BIOME.OCEAN, 0.2)).toMatch(/^rgb\(\d+, \d+, \d+\)$/)
  })

  it('produces different colors for different biomes at the same height', () => {
    const ocean = biomeColor(BIOME.OCEAN, 0.5)
    const woodland = biomeColor(BIOME.WOODLAND, 0.5)
    const snow = biomeColor(BIOME.SNOW, 0.5)

    expect(ocean).not.toBe(woodland)
    expect(woodland).not.toBe(snow)
    expect(ocean).not.toBe(snow)
  })

  it('gives every one of the six lushness bands its own colour', () => {
    // The two greens at the top of the ramp used to be 16 units apart,
    // which is why "dense" and "lush" were indistinguishable on screen.
    const colors = LUSHNESS_BANDS.map((biome) => biomeColor(biome, 0.6))

    expect(new Set(colors).size).toBe(LUSHNESS_BANDS.length)
  })

  it('separates adjacent bands by a visible amount', () => {
    function channels(color) {
      return color.match(/\d+/g).map(Number)
    }

    for (let i = 1; i < LUSHNESS_BANDS.length; i++) {
      const previous = channels(biomeColor(LUSHNESS_BANDS[i - 1], 0.6))
      const current = channels(biomeColor(LUSHNESS_BANDS[i], 0.6))
      const distance = Math.hypot(...previous.map((c, k) => c - current[k]))

      expect(distance).toBeGreaterThan(25)
    }
  })

  it('shades the same biome brighter as height increases', () => {
    function brightness(color) {
      const [r, g, b] = color.match(/\d+/g).map(Number)
      return r + g + b
    }

    const low = biomeColor(BIOME.MEADOW, 0.1)
    const high = biomeColor(BIOME.MEADOW, 0.9)

    expect(brightness(high)).toBeGreaterThan(brightness(low))
  })

  it('falls back to a neutral color for an unknown biome id', () => {
    expect(biomeColor(999, 0.5)).toMatch(/^rgb\(\d+, \d+, \d+\)$/)
  })
})
