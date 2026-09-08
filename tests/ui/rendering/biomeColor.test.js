import { describe, expect, it } from 'vitest'
import { ALTITUDE } from '../../../src/engine/generation/config.js'
import { BIOME, LUSHNESS_BANDS } from '../../../src/engine/generation/terrain.js'
import {
  SNOW_RGB,
  biomeColor,
  biomeGroundRgb,
  biomeRgb,
  biomeSnowCover,
  rockColor,
} from '../../../src/ui/rendering/biomeColor.js'

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

describe('altitude cover', () => {
  function channels(color) {
    return color.match(/\d+/g).map(Number)
  }

  function distance(a, b) {
    const [x, y] = [channels(a), channels(b)]
    return Math.hypot(...x.map((c, i) => c - y[i]))
  }

  it('keeps a well-cited summit distinguishable from a barren one', () => {
    // The point of the whole phase. Altitude used to replace the band, so
    // every summit in every world was the same grey.
    const lushSummit = biomeColor(BIOME.JUNGLE, 0.84)
    const barrenSummit = biomeColor(BIOME.DUNES, 0.84)

    expect(distance(lushSummit, barrenSummit)).toBeGreaterThan(25)
  })

  it('tints high rock towards green for a well-cited section', () => {
    const [, lushGreen] = channels(biomeColor(BIOME.JUNGLE, 0.84))
    const [barrenRed, barrenGreen] = channels(biomeColor(BIOME.DUNES, 0.84))
    const [lushRed] = channels(biomeColor(BIOME.JUNGLE, 0.84))

    // Damp, lichened stone reads cooler and greener than dry scree.
    expect(lushGreen - lushRed).toBeGreaterThan(barrenGreen - barrenRed)
  })

  it('leaves low land untouched by rock', () => {
    // Band colours have to survive at the altitudes most land sits at, or
    // every world reads grey.
    expect(biomeColor(BIOME.MEADOW, 0.45)).toBe(biomeColor(BIOME.MEADOW, 0.45))
    const low = channels(biomeColor(BIOME.MEADOW, ALTITUDE.rockStart))
    const shaded = channels(biomeColor(BIOME.MEADOW, ALTITUDE.rockStart))

    expect(low).toEqual(shaded)
  })

  it('changes smoothly with height, drawing no contour line', () => {
    // Walking up a peak one hundredth of the height range at a time.
    // The bound is a fraction of the WHOLE climb rather than an absolute
    // number of RGB units, because that is what "contour line" means: a
    // single step carrying a visible share of the total change. The
    // thresholds this replaces switched band colour to grey rock in one
    // step worth about a quarter of the climb, at exactly 0.7, on every
    // peak in the world.
    const climb = distance(biomeColor(BIOME.WOODLAND, 0), biomeColor(BIOME.WOODLAND, 1))
    let worst = 0
    let previous = biomeColor(BIOME.WOODLAND, 0)

    for (let height = 0.01; height <= 1.0001; height += 0.01) {
      const current = biomeColor(BIOME.WOODLAND, height)
      worst = Math.max(worst, distance(previous, current))
      previous = current
    }

    expect(worst / climb).toBeLessThan(0.1)
  })

  it('goes white at the very top, whatever the band', () => {
    for (const biome of [BIOME.DUNES, BIOME.MEADOW, BIOME.JUNGLE]) {
      const [r, g, b] = channels(biomeColor(biome, 1))
      expect(Math.min(r, g, b)).toBeGreaterThan(230)
    }
  })

  it('leaves the polar caps flat white rather than stacking cover on them', () => {
    // Cap cells arrive as SNOW at low height; they are ice floes, not
    // summits, and must not pick up rock.
    const [r, g, b] = channels(biomeColor(BIOME.SNOW, 0.4))

    expect(Math.min(r, g, b)).toBeGreaterThan(150)
  })

  it('takes no cover on water, however the bands move', () => {
    expect(biomeColor(BIOME.OCEAN, 0.9)).toBe(biomeColor(BIOME.OCEAN, 0.9))
    const [r, g, b] = channels(biomeColor(BIOME.OCEAN, 0.9))
    expect(b).toBeGreaterThan(r)
  })
})

describe('biomeRgb', () => {
  it('is the same answer biomeColor gives, as numbers', () => {
    // The whole point of the split: one palette, two spellings. If these
    // ever disagree the 2D map and the 3D mesh have drifted apart.
    for (const biome of [BIOME.OCEAN, BIOME.BEACH, ...LUSHNESS_BANDS, BIOME.SNOW]) {
      for (const height of [0, 0.25, 0.5, 0.7, 0.85, 0.95, 1]) {
        const [r, g, b] = biomeRgb(biome, height)
        expect(`rgb(${r}, ${g}, ${b})`).toBe(biomeColor(biome, height))
      }
    }
  })
})

describe('biomeGroundRgb and biomeSnowCover', () => {
  it('mix back into the colour they were split from', () => {
    // A renderer that applies snow itself must land in the same place as
    // one that took it baked, or moving a snowline would also reshade
    // the ground under it.
    for (const biome of LUSHNESS_BANDS) {
      for (const height of [0.5, 0.8, 0.9, 1]) {
        const ground = biomeGroundRgb(biome, height)
        const cover = biomeSnowCover(biome, height)
        const mixed = ground.map((channel, i) => Math.round(channel + (SNOW_RGB[i] - channel) * cover))

        expect(mixed).toEqual(biomeRgb(biome, height))
      }
    }
  })

  it('keeps the band colour under full cover', () => {
    // Baked, a covered summit is white and nothing else. The point of
    // holding the ground separately is that it still knows what it was.
    const jungle = biomeGroundRgb(BIOME.JUNGLE, ALTITUDE.snowFull)
    const dunes = biomeGroundRgb(BIOME.DUNES, ALTITUDE.snowFull)

    expect(biomeSnowCover(BIOME.JUNGLE, ALTITUDE.snowFull)).toBeCloseTo(1, 5)
    expect(jungle).not.toEqual(dunes)
  })

  it('reports no cover below the snowline and full cover above it', () => {
    expect(biomeSnowCover(BIOME.MEADOW, ALTITUDE.snowStart - 0.01)).toBe(0)
    expect(biomeSnowCover(BIOME.MEADOW, ALTITUDE.snowFull)).toBeCloseTo(1, 5)
  })

  it('gives water no cover at any height', () => {
    expect(biomeSnowCover(BIOME.OCEAN, 1)).toBe(0)
    expect(biomeSnowCover(BIOME.BEACH, 1)).toBe(0)
  })

  it('leaves water out of the rock cover too', () => {
    // Water is excluded from both, so the ground colour of a deep cell
    // is its shaded base and nothing else.
    const ocean = biomeGroundRgb(BIOME.OCEAN, 0.9)
    const shade = 0.7 + 0.9 * 0.5

    expect(ocean[0]).toBeCloseTo(20 * shade, 5)
  })
})

describe('rockColor', () => {
  it('runs from dry scree to damp stone across lushness', () => {
    const dry = rockColor(0).match(/\d+/g).map(Number)
    const damp = rockColor(1).match(/\d+/g).map(Number)

    expect(dry[0]).toBeGreaterThan(damp[0]) // warmer
    expect(damp[1] - damp[0]).toBeGreaterThan(dry[1] - dry[0]) // greener
  })

  it('clamps a scalar outside [0, 1]', () => {
    expect(rockColor(-5)).toBe(rockColor(0))
    expect(rockColor(9)).toBe(rockColor(1))
  })
})
