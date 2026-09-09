import { describe, expect, it } from 'vitest'
import {
  WATER,
  computeWaterAttributes,
  dropDryTriangles,
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
