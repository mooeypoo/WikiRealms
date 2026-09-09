import { describe, expect, it } from 'vitest'
import {
  RIPPLE,
  SHELF_WIDTH,
  SURF,
  WATER,
  WATER_SKY_REFLECTION,
  computeWaterAttributes,
  dropDryTriangles,
  rippleStrength,
  rippleWaveFrequency,
  shortestRippleWavelength,
  surfStrength,
  waterDepth,
  waterOpacity,
  waterRgbAt,
} from '../../../src/ui/rendering/waterSurface.js'
import { BIOME_THRESHOLDS } from '../../../src/engine/generation/config.js'

const SEA = BIOME_THRESHOLDS.oceanMaxHeight

/**
 * How much of the height map one cell of coastline covers. Measured over
 * the shoreline cells of a generated world (median 0.0075), and the same
 * figure SHORE's bands were sized against.
 */
const COAST_CELL_STEP = 0.0075

function makeTerrain(overrides = {}) {
  const width = 8
  const height = 4
  return {
    width,
    height,
    heightMap: new Float64Array(width * height).fill(SEA - 0.1),
    ...overrides,
  }
}

describe('waterDepth', () => {
  it('measures down from the waterline', () => {
    expect(waterDepth(SEA - 0.1)).toBeCloseTo(0.1, 10)
    expect(waterDepth(0)).toBeCloseTo(SEA, 10)
  })

  it('is zero at the waterline and on every height above it', () => {
    expect(waterDepth(SEA)).toBe(0)
    expect(waterDepth(SEA + 0.01)).toBe(0)
    expect(waterDepth(1)).toBe(0)
  })
})

describe('waterOpacity', () => {
  it('draws nothing at all where the sea meets the land', () => {
    // The load-bearing one. The waterline is where a flat surface cuts
    // through a grid of triangles, and no amount of smoothing fixes that
    // edge — so nothing is drawn on it.
    expect(waterOpacity(0)).toBe(0)
  })

  it('reaches its full cover at the outer edge of the shelf, and stops there', () => {
    expect(waterOpacity(WATER.opaqueDepth)).toBeCloseTo(WATER.maxOpacity, 6)
    expect(waterOpacity(WATER.opaqueDepth * 4)).toBeCloseTo(WATER.maxOpacity, 6)
    expect(waterOpacity(SEA)).toBeCloseTo(WATER.maxOpacity, 6)
  })

  it('leaves the deep sea short of opaque, so the floor is still down there', () => {
    expect(waterOpacity(SEA)).toBeLessThan(1)
  })

  it('only ever gets deeper-looking as it gets deeper', () => {
    let previous = -1
    for (let depth = 0; depth <= SEA; depth += 0.002) {
      const opacity = waterOpacity(depth)
      expect(opacity).toBeGreaterThanOrEqual(previous)
      expect(opacity).toBeLessThanOrEqual(WATER.maxOpacity)
      previous = opacity
    }
  })

  it('never jumps a visible amount from one cell of coast to the next', () => {
    // A step in opacity would put a contour line on the water, which is
    // the staircase again in a different colour.
    let worst = 0
    for (let depth = 0; depth <= WATER.opaqueDepth * 2; depth += COAST_CELL_STEP) {
      worst = Math.max(worst, Math.abs(waterOpacity(depth + COAST_CELL_STEP) - waterOpacity(depth)))
    }
    expect(worst).toBeLessThan(0.12)
  })
})

describe('waterRgbAt', () => {
  it('is a pale turquoise in the shallows and a dark blue in the deep', () => {
    const [, shallowGreen, shallowBlue] = waterRgbAt(0)
    const [, deepGreen, deepBlue] = waterRgbAt(WATER.colorDepth)
    // Turquoise means green keeps up with blue; the deep is blue alone.
    expect(shallowGreen).toBeGreaterThan(shallowBlue * 0.8)
    expect(deepGreen).toBeLessThan(deepBlue * 0.8)
  })

  it('darkens all the way down, then holds', () => {
    const brightness = (depth) => waterRgbAt(depth).reduce((sum, channel) => sum + channel, 0)
    let previous = Infinity
    for (let depth = 0; depth <= WATER.colorDepth; depth += 0.005) {
      const current = brightness(depth)
      expect(current).toBeLessThanOrEqual(previous + 1e-9)
      previous = current
    }
    expect(brightness(SEA)).toBeCloseTo(brightness(WATER.colorDepth), 6)
  })

  it('goes on describing the basin after the floor has bottomed out', () => {
    // The height map floors at 0.10, so a quarter of the ocean shares one
    // depth. The colour ramp has to have spent its range before then or
    // the whole basin is a single tone.
    const [, , shelfBlue] = waterRgbAt(WATER.opaqueDepth)
    const [, , basinBlue] = waterRgbAt(SEA - 0.1)
    expect(Math.abs(basinBlue - shelfBlue)).toBeGreaterThan(10)
  })

  it('stays inside the channel range at every depth', () => {
    for (let depth = 0; depth <= SEA; depth += 0.005) {
      for (const channel of waterRgbAt(depth)) {
        expect(channel).toBeGreaterThanOrEqual(0)
        expect(channel).toBeLessThanOrEqual(255)
      }
    }
  })
})

describe('computeWaterAttributes', () => {
  it('emits four components per cell, in the height map\u2019s index order', () => {
    const terrain = makeTerrain()
    const colors = computeWaterAttributes(terrain)
    expect(colors).toHaveLength(terrain.width * terrain.height * 4)
  })

  it('hands the GPU numbers it can use directly', () => {
    const terrain = makeTerrain()
    terrain.heightMap[0] = 0
    terrain.heightMap[1] = 1
    for (const value of computeWaterAttributes(terrain)) {
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(1)
    }
  })

  it('is completely clear over every piece of dry land', () => {
    const terrain = makeTerrain()
    terrain.heightMap[3] = SEA
    terrain.heightMap[4] = SEA + 0.2
    const colors = computeWaterAttributes(terrain)
    expect(colors[3 * 4 + 3]).toBe(0)
    expect(colors[4 * 4 + 3]).toBe(0)
  })

  it('gives a lagoon and the open sea different water', () => {
    const terrain = makeTerrain()
    terrain.heightMap[0] = SEA - 0.01 // a hand's depth
    terrain.heightMap[1] = SEA - 0.2 // the basin
    const colors = computeWaterAttributes(terrain)
    expect(colors[3]).toBeLessThan(colors[4 + 3]) // clearer
    expect(colors[1]).toBeGreaterThan(colors[4 + 1]) // greener
  })

  it('is deterministic', () => {
    const terrain = makeTerrain()
    expect([...computeWaterAttributes(terrain)]).toEqual([...computeWaterAttributes(terrain)])
  })
})

describe('dropDryTriangles', () => {
  /** Every triangle of a width x height grid, as buildWaterArrays emits them. */
  function gridTriangles({ width, height }) {
    const out = []
    for (let y = 0; y < height - 1; y += 1) {
      for (let x = 0; x < width - 1; x += 1) {
        const a = y * width + x
        out.push(a, a + width, a + 1, a + 1, a + width, a + width + 1)
      }
    }
    return new Uint32Array(out)
  }

  it('keeps the whole grid when the whole world is under water', () => {
    const terrain = makeTerrain()
    const all = gridTriangles(terrain)
    expect(dropDryTriangles(all, terrain)).toHaveLength(all.length)
  })

  it('keeps nothing at all when nothing is under water', () => {
    const terrain = makeTerrain({ heightMap: new Float64Array(8 * 4).fill(SEA + 0.3) })
    expect(dropDryTriangles(gridTriangles(terrain), terrain)).toHaveLength(0)
  })

  it('drops a triangle only when all three corners are dry', () => {
    const terrain = makeTerrain({ heightMap: new Float64Array(8 * 4).fill(SEA + 0.3) })
    terrain.heightMap[9] = SEA - 0.05 // one cell of water, in open country
    const kept = dropDryTriangles(gridTriangles(terrain), terrain)
    expect(kept.length).toBeGreaterThan(0)
    for (let i = 0; i < kept.length; i += 3) {
      const corners = [kept[i], kept[i + 1], kept[i + 2]]
      expect(corners).toContain(9)
    }
  })

  it('still reaches past the waterline, so the fade has its zero', () => {
    // The dry corners next to the water have to survive: they are the
    // 0-opacity end of the ramp, and without them the shelf would fade
    // to something short of nothing and paint the hard edge again.
    const terrain = makeTerrain({ heightMap: new Float64Array(8 * 4).fill(SEA + 0.3) })
    terrain.heightMap[9] = SEA - 0.05
    const kept = dropDryTriangles(gridTriangles(terrain), terrain)
    for (let i = 0; i < kept.length; i += 3) {
      const dry = [kept[i], kept[i + 1], kept[i + 2]].filter((v) => waterDepth(terrain.heightMap[v]) <= 0)
      expect(dry.length).toBeGreaterThan(0)
    }
    // Edge neighbours share a triangle with the water and so are kept; a
    // corner-only neighbour like 0 shares none, and needs none.
    const vertices = new Set(kept)
    for (const neighbour of [1, 8, 10, 17]) expect(vertices.has(neighbour)).toBe(true)
  })

  it('keeps every triangle that any water touches', () => {
    const terrain = makeTerrain({ heightMap: new Float64Array(8 * 4).map((_, i) => (i % 3 ? SEA + 0.2 : SEA - 0.2)) })
    const all = gridTriangles(terrain)
    const kept = dropDryTriangles(all, terrain)
    let expected = 0
    for (let i = 0; i < all.length; i += 3) {
      if ([all[i], all[i + 1], all[i + 2]].some((v) => waterDepth(terrain.heightMap[v]) > 0)) expected += 3
    }
    expect(kept).toHaveLength(expected)
  })

  it('emits whole triangles, in the same winding it was given', () => {
    const terrain = makeTerrain({ heightMap: new Float64Array(8 * 4).map((_, i) => (i < 16 ? SEA - 0.1 : SEA + 0.1)) })
    const all = gridTriangles(terrain)
    const kept = dropDryTriangles(all, terrain)
    expect(kept.length % 3).toBe(0)
    // Each kept triangle must appear in the original, corner order intact.
    const original = new Set()
    for (let i = 0; i < all.length; i += 3) original.add(`${all[i]},${all[i + 1]},${all[i + 2]}`)
    for (let i = 0; i < kept.length; i += 3) {
      expect(original.has(`${kept[i]},${kept[i + 1]},${kept[i + 2]}`)).toBe(true)
    }
  })

  it('keeps the index type it was handed, so the buffer stays valid', () => {
    const terrain = makeTerrain()
    const kept = dropDryTriangles(gridTriangles(terrain), terrain)
    expect(kept).toBeInstanceOf(Uint32Array)
  })
})

describe('surfStrength', () => {
  it('draws nothing when a band is too narrow to draw honestly', () => {
    expect(surfStrength(SURF.minBandPixels)).toBe(0)
    expect(surfStrength(SURF.minBandPixels - 1)).toBe(0)
    expect(surfStrength(0)).toBe(0)
  })

  it('draws the wave in full once there is room for a crest and a trough', () => {
    expect(surfStrength(SURF.fullBandPixels)).toBe(1)
    expect(surfStrength(SURF.fullBandPixels * 10)).toBe(1)
  })

  it('rises without a step between the two, so zooming never pops', () => {
    let previous = 0
    for (let pixels = 0; pixels <= SURF.fullBandPixels + 4; pixels += 0.25) {
      const strength = surfStrength(pixels)
      expect(strength).toBeGreaterThanOrEqual(previous)
      expect(strength).toBeGreaterThanOrEqual(0)
      expect(strength).toBeLessThanOrEqual(1)
      // A quarter pixel of camera movement must not visibly change it.
      expect(strength - previous).toBeLessThan(0.1)
      previous = strength
    }
  })

  it('survives a camera that reports nonsense', () => {
    expect(surfStrength(Number.NaN)).toBe(0)
    expect(surfStrength(-100)).toBe(0)
    expect(surfStrength(undefined)).toBe(0)
  })

  it('turns the surf off from orbit and on at the shore', () => {
    // The shelf is SHELF_WIDTH world units wide and carries SURF.bands
    // crests, so one band is that fraction of it. These are the two ends
    // measured in the browser: bold at a shoreline camera, gone from far
    // out, with the opening view somewhere in between.
    const bandWorldUnits = SHELF_WIDTH / SURF.bands
    const pixelsPerUnit = (screenHeight, distance) => screenHeight / (2 * distance * Math.tan((50 * Math.PI) / 180 / 2))
    const bandPixels = (distance) => bandWorldUnits * pixelsPerUnit(1080, distance)

    expect(surfStrength(bandPixels(120))).toBe(1)
    // Not asserted as an exact zero: that depends on the buffer height,
    // and at a real 1080-tall buffer this distance lands just off it.
    // What matters is that there is no visible wave left to shimmer.
    expect(surfStrength(bandPixels(900))).toBeLessThan(0.05)
    const opening = surfStrength(bandPixels(461))
    expect(opening).toBeGreaterThan(0)
    expect(opening).toBeLessThan(1)
  })
})

describe('SURF', () => {
  it('keeps the wave count low enough to read as water, not contours', () => {
    // Seven read as a depth diagram. This is the constant that decides
    // whether the effect looks like surf at all.
    expect(SURF.bands).toBeLessThanOrEqual(4)
    expect(SURF.bands).toBeGreaterThanOrEqual(1)
  })

  it('leaves the fade band wide enough to be a fade', () => {
    expect(SURF.fullBandPixels).toBeGreaterThan(SURF.minBandPixels * 2)
  })

  it('sharpens the sine rather than flattening it', () => {
    expect(SURF.sharpness).toBeGreaterThan(1)
  })
})

describe('rippleWaveFrequency', () => {
  it('lets long swells outrun short chop', () => {
    // Deep-water dispersion, which is the whole reason the rate is
    // derived rather than set: with one shared rate the wave set slides
    // along as a single texture being dragged across the bay.
    const long = rippleWaveFrequency(20)
    const short = rippleWaveFrequency(5)
    expect(short).toBeGreaterThan(long)
  })

  it('turns as the square root of the wavenumber', () => {
    // Quadrupling the wavelength quarters the wavenumber, which halves
    // the angular frequency.
    expect(rippleWaveFrequency(5) / rippleWaveFrequency(20)).toBeCloseTo(2, 6)
  })
})

describe('RIPPLE', () => {
  it('gives every wave a frequency it did not have to be told', () => {
    for (const wave of RIPPLE.waves) {
      expect(wave.frequency).toBeCloseTo(rippleWaveFrequency(wave.wavelength), 10)
    }
  })

  it('has more than three waves, because three made a lattice', () => {
    // Three crossing sinusoids came out as visible diagonal rows. This
    // is the count that fixed it, and dropping back to three would
    // reintroduce a defect that only shows up on screen.
    expect(RIPPLE.waves.length).toBeGreaterThan(3)
  })

  it('keeps no two wavelengths in a simple ratio', () => {
    // Any finite sum of sines repeats; harmonics make it repeat SOON,
    // and a short period is what the eye reads as a pattern rather than
    // as water.
    const lengths = RIPPLE.waves.map((wave) => wave.wavelength)
    for (let i = 0; i < lengths.length; i++) {
      for (let j = i + 1; j < lengths.length; j++) {
        const ratio = Math.max(lengths[i], lengths[j]) / Math.min(lengths[i], lengths[j])
        expect(Math.abs(ratio - Math.round(ratio))).toBeGreaterThan(0.08)
      }
    }
  })

  it('tilts the surface far enough to matter, and not absurdly far', () => {
    // What reaches the lighting is amplitude times wavenumber. Below
    // about ten degrees the sky reflection barely moves; far above
    // twenty and the sea stops looking like water.
    const slopes = RIPPLE.waves.map((wave) => wave.amplitude * ((Math.PI * 2) / wave.wavelength))
    const rms = Math.sqrt(slopes.reduce((sum, slope) => sum + slope * slope, 0))
    const degrees = (Math.atan(rms) * 180) / Math.PI
    expect(degrees).toBeGreaterThan(12)
    expect(degrees).toBeLessThan(28)
  })

  it('points its waves in genuinely different directions', () => {
    // Each wave has two still points on a sphere, where its direction is
    // radial and its crest has no component along the surface. Waves
    // that agree on a direction would share those dead spots.
    const unit = ([x, y, z]) => {
      const length = Math.hypot(x, y, z)
      return [x / length, y / length, z / length]
    }
    const directions = RIPPLE.waves.map((wave) => unit(wave.direction))
    for (let i = 0; i < directions.length; i++) {
      for (let j = i + 1; j < directions.length; j++) {
        const alignment = Math.abs(directions[i].reduce((sum, value, axis) => sum + value * directions[j][axis], 0))
        expect(alignment).toBeLessThan(0.9)
      }
    }
  })
})

describe('shortestRippleWavelength', () => {
  it('reports the finest wave, because that is what has to be resolved', () => {
    expect(shortestRippleWavelength()).toBe(Math.min(...RIPPLE.waves.map((wave) => wave.wavelength)))
  })
})

describe('rippleStrength', () => {
  it('draws no chop it cannot resolve', () => {
    // A slope field is the highest spatial frequency in the scene, and
    // below a few pixels per wave the highlight it carries samples at
    // random: a field of crawling specks rather than a soft shimmer.
    expect(rippleStrength(0)).toBe(0)
    expect(rippleStrength(RIPPLE.minWavePixels)).toBe(0)
    expect(rippleStrength(RIPPLE.minWavePixels - 1)).toBe(0)
  })

  it('draws it fully once there is room for a crest and a trough', () => {
    expect(rippleStrength(RIPPLE.fullWavePixels)).toBe(1)
    expect(rippleStrength(RIPPLE.fullWavePixels * 4)).toBe(1)
  })

  it('fades rather than switches', () => {
    const midpoint = (RIPPLE.minWavePixels + RIPPLE.fullWavePixels) / 2
    const strength = rippleStrength(midpoint)
    expect(strength).toBeGreaterThan(0)
    expect(strength).toBeLessThan(1)
    // Monotonic, so pulling the camera back never brings chop BACK.
    let previous = -1
    for (let pixels = 0; pixels <= RIPPLE.fullWavePixels + 4; pixels += 0.5) {
      const value = rippleStrength(pixels)
      expect(value).toBeGreaterThanOrEqual(previous)
      previous = value
    }
  })

  it('treats nonsense as no chop', () => {
    expect(rippleStrength(Number.NaN)).toBe(0)
    expect(rippleStrength(-10)).toBe(0)
    expect(rippleStrength(undefined)).toBe(0)
  })

  it('leaves room to fade in', () => {
    expect(RIPPLE.fullWavePixels).toBeGreaterThan(RIPPLE.minWavePixels * 2)
  })
})

describe('WATER_SKY_REFLECTION', () => {
  it('reflects almost nothing straight down, which is what water does', () => {
    // The point of a fresnel curve is how far it travels. A high floor
    // is the difference between a sea and a sheet of steel.
    expect(WATER_SKY_REFLECTION.facing).toBeLessThan(0.05)
    expect(WATER_SKY_REFLECTION.facing).toBeGreaterThan(0)
  })

  it('relaxes Schlick, because this world is read from above', () => {
    // Schlick's exponent is 5, which puts the whole effect in the last
    // few degrees before the horizon. Measured at a shoreline camera it
    // lifted the sea by 1.7 levels against 6.1 for this.
    expect(WATER_SKY_REFLECTION.falloff).toBeLessThan(5)
    // But it is still a curve that rises toward grazing, not a flat
    // tint: at 1 or below there is nothing fresnel about it.
    expect(WATER_SKY_REFLECTION.falloff).toBeGreaterThan(1)
  })

  it('leaves the sea some colour of its own', () => {
    expect(WATER_SKY_REFLECTION.strength).toBeGreaterThan(0)
    expect(WATER_SKY_REFLECTION.strength).toBeLessThan(1)
  })
})
