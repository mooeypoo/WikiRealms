import { describe, expect, it } from 'vitest'
import {
  UNDERSTORY_LIFT_RATIO,
  scatterCanopy,
  scatterFoliage,
  scatterUnderstory,
} from '../../../src/ui/rendering/foliageScatter.js'
import {
  CANOPY_ARCHETYPES,
  FOLIAGE_SAMPLING,
  UNDERSTORY_BY_BAND,
  CANOPY_JITTER,
} from '../../../src/ui/rendering/foliage.js'
import { flatProjection, sphereProjection, SPHERE_VIEW } from '../../../src/ui/rendering/projection.js'
import { BIOME } from '../../../src/engine/generation/terrain.js'
import { ALTITUDE } from '../../../src/engine/generation/config.js'

/**
 * A uniform terrain of one band, which is what makes the density and
 * band-coverage assertions below readable: every cell offers the same
 * chance, so a count is a measurement of the rule rather than of the
 * world that happened to be generated.
 */
function uniformTerrain(band, { width = 64, height = 64, lushness = 0.5, height01 = 0.2 } = {}) {
  const cells = width * height
  return {
    width,
    height,
    heightMap: new Float64Array(cells).fill(height01),
    biomeMap: new Uint8Array(cells).fill(band),
    lushnessMap: new Float64Array(cells).fill(lushness),
  }
}

const FLAT = { projection: flatProjection, heightScale: 10 }

describe('scatterUnderstory', () => {
  it('grows nothing on the bands that carry no ground cover', () => {
    // Ocean, beach, the polar caps and the dunes are bare by design: a
    // section that cites nothing has to read as bare ground, not as
    // sparse cover.
    for (const band of [BIOME.OCEAN, BIOME.BEACH, BIOME.DUNES, BIOME.SNOW]) {
      expect(scatterUnderstory(uniformTerrain(band), 1, FLAT)).toEqual([])
    }
  })

  it('emits one layer per variant the band declares', () => {
    const layers = scatterUnderstory(uniformTerrain(BIOME.MEADOW), 1, FLAT)

    expect(layers).toHaveLength(UNDERSTORY_BY_BAND[BIOME.MEADOW].length)
    for (const layer of layers) {
      expect(UNDERSTORY_BY_BAND[BIOME.MEADOW]).toContain(layer.variant)
    }
  })

  it('emits three position floats per sprite', () => {
    for (const layer of scatterUnderstory(uniformTerrain(BIOME.JUNGLE), 7, FLAT)) {
      expect(layer.positions).toBeInstanceOf(Float32Array)
      expect(layer.positions.length).toBe(layer.count * 3)
      expect(layer.count).toBeGreaterThan(0)
    }
  })

  it('lifts each sprite half its own width above the surface', () => {
    // A point sprite is centred on its position, so an unlifted blade of
    // grass is buried to its waist.
    const terrain = uniformTerrain(BIOME.MEADOW, { height01: 0.4 })
    const surfaceZ = 0.4 * FLAT.heightScale

    for (const layer of scatterUnderstory(terrain, 3, { ...FLAT, cellScale: 1 })) {
      const expected = surfaceZ + layer.variant.size * UNDERSTORY_LIFT_RATIO
      for (let i = 0; i < layer.count; i += 1) {
        expect(layer.positions[i * 3 + 2]).toBeCloseTo(expected, 5)
      }
    }
  })

  it('samples every cell, so ground cover can be continuous', () => {
    // The single layer this replaced sampled every FOURTH cell in both
    // axes, capping the whole world at one sprite per 16 cells. No
    // density value could have exceeded that ceiling.
    expect(FOLIAGE_SAMPLING.understoryStride).toBe(1)

    const terrain = uniformTerrain(BIOME.JUNGLE, { lushness: 1 })
    const sampled = (terrain.width - 2) * (terrain.height - 2)
    const grown = scatterUnderstory(terrain, 5, FLAT).reduce((sum, layer) => sum + layer.count, 0)

    expect(grown / sampled).toBeGreaterThan(0.3)
  })

  it('grows more where a section cites more', () => {
    const count = (lushness) =>
      scatterUnderstory(uniformTerrain(BIOME.WOODLAND, { lushness }), 11, FLAT).reduce(
        (sum, layer) => sum + layer.count,
        0,
      )

    expect(count(1)).toBeGreaterThan(count(0.5))
    expect(count(0.5)).toBeGreaterThan(count(0))
  })

  it('thins towards the treeline instead of stopping at it', () => {
    // Foliage above the old rock threshold was not thinned, it was
    // deleted, so a quarter of every world's land was bare by
    // construction.
    const count = (height01, lushness) =>
      scatterUnderstory(uniformTerrain(BIOME.WOODLAND, { height01, lushness }), 13, FLAT).reduce(
        (sum, layer) => sum + layer.count,
        0,
      )

    expect(count(ALTITUDE.treelineStart, 0)).toBeGreaterThan(count(0.75, 0))
    expect(count(0.75, 0)).toBeGreaterThan(0)
    expect(count(ALTITUDE.treelineEnd, 0)).toBe(0)
  })

  it("lets a well-cited section's treeline climb higher", () => {
    // A second reading of the same signal that arrives as geography
    // rather than as a repeat: the range's silhouette changes, not just
    // its colour.
    const count = (lushness) =>
      scatterUnderstory(uniformTerrain(BIOME.WOODLAND, { height01: ALTITUDE.treelineEnd, lushness }), 13, FLAT).reduce(
        (sum, layer) => sum + layer.count,
        0,
      )

    expect(count(0)).toBe(0)
    expect(count(1)).toBeGreaterThan(0)
  })
})

describe('scatterCanopy', () => {
  it('grows nothing on the bands that carry no trees', () => {
    for (const band of [BIOME.OCEAN, BIOME.BEACH, BIOME.DUNES, BIOME.SNOW]) {
      expect(scatterCanopy(uniformTerrain(band), 1, FLAT)).toEqual([])
    }
  })

  it('emits only archetypes that have geometry to instance', () => {
    for (const band of [BIOME.STEPPE, BIOME.LIGHT_VEG, BIOME.MEADOW, BIOME.WOODLAND, BIOME.JUNGLE]) {
      for (const layer of scatterCanopy(uniformTerrain(band), 2, FLAT)) {
        expect(CANOPY_ARCHETYPES[layer.archetype]).toBeDefined()
      }
    }
  })

  it('sizes every attribute buffer to the instance count', () => {
    for (const layer of scatterCanopy(uniformTerrain(BIOME.JUNGLE), 17, FLAT)) {
      expect(layer.count).toBeGreaterThan(0)
      expect(layer.positions.length).toBe(layer.count * 3)
      expect(layer.normals.length).toBe(layer.count * 3)
      expect(layer.colors.length).toBe(layer.count * 3)
      expect(layer.yaws.length).toBe(layer.count)
      expect(layer.scales.length).toBe(layer.count)
    }
  })

  it('samples every second cell, so a crown has room', () => {
    expect(FOLIAGE_SAMPLING.canopyStride).toBe(2)

    const terrain = uniformTerrain(BIOME.JUNGLE, { lushness: 1 })
    const sampled = Math.ceil((terrain.width - 2) / 2) * Math.ceil((terrain.height - 2) / 2)
    const grown = scatterCanopy(terrain, 19, FLAT).reduce((sum, layer) => sum + layer.count, 0)

    expect(grown).toBeLessThanOrEqual(sampled)
    expect(grown / sampled).toBeGreaterThan(0.8)
  })

  it('substitutes conifers for broadleaves at altitude', () => {
    // A mountain is not a taller version of its foothills. Altitude has
    // to read as a change in KIND, not only as a thinning.
    const low = scatterCanopy(uniformTerrain(BIOME.WOODLAND, { height01: 0 }), 23, FLAT)
    const high = scatterCanopy(
      uniformTerrain(BIOME.WOODLAND, { height01: ALTITUDE.coniferStart, lushness: 1 }),
      23,
      FLAT,
    )

    expect(low.map((layer) => layer.archetype)).toContain('broadleaf')
    expect(high.map((layer) => layer.archetype)).not.toContain('broadleaf')
  })

  it('stunts to krummholz just under the treeline', () => {
    const layers = scatterCanopy(
      uniformTerrain(BIOME.WOODLAND, { height01: ALTITUDE.krummholzStart, lushness: 1 }),
      29,
      FLAT,
    )

    expect(layers.map((layer) => layer.archetype)).toEqual(['krummholz'])
  })

  it('keeps every instance inside its cell neighbourhood', () => {
    // The lateral offset breaks the lattice a grid would otherwise
    // impose, but a tree that wanders further than half the sampling
    // stride crosses into a cell that already had its own chance to grow
    // one.
    const terrain = uniformTerrain(BIOME.JUNGLE, { lushness: 1 })
    const halfWidth = terrain.width / 2
    const bound = halfWidth + CANOPY_JITTER.maxOffsetCells

    for (const layer of scatterCanopy(terrain, 31, FLAT)) {
      for (let i = 0; i < layer.count; i += 1) {
        expect(Math.abs(layer.positions[i * 3])).toBeLessThanOrEqual(bound)
      }
    }
  })

  it('scales and yaws within the jitter the archetypes allow', () => {
    for (const layer of scatterCanopy(uniformTerrain(BIOME.JUNGLE, { lushness: 1 }), 37, FLAT)) {
      for (let i = 0; i < layer.count; i += 1) {
        expect(layer.scales[i]).toBeGreaterThanOrEqual(CANOPY_JITTER.minScale)
        expect(layer.scales[i]).toBeLessThanOrEqual(CANOPY_JITTER.maxScale)
        expect(layer.yaws[i]).toBeGreaterThanOrEqual(0)
        expect(layer.yaws[i]).toBeLessThan(Math.PI * 2)
      }
    }
  })

  it('stands every tree up along +Z on the flat map', () => {
    for (const layer of scatterCanopy(uniformTerrain(BIOME.WOODLAND), 41, FLAT)) {
      for (let i = 0; i < layer.count; i += 1) {
        expect([layer.normals[i * 3], layer.normals[i * 3 + 1], layer.normals[i * 3 + 2]]).toEqual([0, 0, 1])
      }
    }
  })

  it('stands every tree up along its own surface normal on the planet', () => {
    // A tree on the far side of the globe must not lie on its side.
    const terrain = uniformTerrain(BIOME.WOODLAND, { width: 48, height: 48 })
    const options = { projection: sphereProjection, heightScale: sphereProjection.heightScale(terrain) }
    const layers = scatterCanopy(terrain, 43, options)

    expect(layers.length).toBeGreaterThan(0)
    const directions = new Set()
    for (const layer of layers) {
      for (let i = 0; i < layer.count; i += 1) {
        const [x, y, z] = [layer.normals[i * 3], layer.normals[i * 3 + 1], layer.normals[i * 3 + 2]]
        expect(Math.hypot(x, y, z)).toBeCloseTo(1, 5)
        directions.add(`${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`)
      }
    }

    expect(directions.size).toBeGreaterThan(1)
  })

  it('leaves the snow out of the colours entirely', () => {
    // Dusting used to be mixed into the instance colour here, so a tree
    // at 0.92 came out paler than the same tree at 0.84. It is the
    // shader's job now, gated on the surface normal — snow on a crown
    // and not on the shaded underside, which a whole-instance mix could
    // never express. Colour is the tree's own again.
    const layers = scatterCanopy(uniformTerrain(BIOME.WOODLAND, { height01: 0.95, lushness: 1 }), 47, FLAT)
    const channels = layers.flatMap((layer) => Array.from(layer.colors))

    expect(channels.length).toBeGreaterThan(0)
    // 0.95 sits near the top of the snow band, where the old dusting was
    // over 0.9 — every channel of every tree came out nearly white. A
    // woodland canopy's own greens do not reach anywhere near this.
    expect(Math.max(...channels)).toBeLessThan(0.8)
  })

  it('carries each tree height for the shader to snow it by', () => {
    // The replacement for the baked dusting: the altitude goes to the
    // GPU as an attribute, so a snowline is a uniform and not a rebuild.
    const height01 = 0.88
    const layers = scatterCanopy(uniformTerrain(BIOME.WOODLAND, { height01, lushness: 1 }), 47, FLAT)

    expect(layers.length).toBeGreaterThan(0)
    for (const layer of layers) {
      expect(layer.heights).toHaveLength(layer.count)
      for (const height of layer.heights) expect(height).toBeCloseTo(height01, 5)
    }
  })
})

describe('scatterFoliage', () => {
  it('is deterministic for a given world', () => {
    const terrain = uniformTerrain(BIOME.WOODLAND)
    const first = scatterFoliage(terrain, 99, FLAT)
    const second = scatterFoliage(terrain, 99, FLAT)

    expect(first.understory.map((l) => [...l.positions])).toEqual(second.understory.map((l) => [...l.positions]))
    expect(first.canopy.map((l) => [...l.positions])).toEqual(second.canopy.map((l) => [...l.positions]))
  })

  it('grows a different world from a different seed', () => {
    const terrain = uniformTerrain(BIOME.WOODLAND)
    const counts = (seed) => scatterFoliage(terrain, seed, FLAT).canopy.map((layer) => layer.count)

    expect(counts(1)).not.toEqual(counts(2))
  })

  it('keeps the two layers uncorrelated', () => {
    // Without separate salts the understory and the canopy agree about
    // which cells are populated, and every tree stands in its own patch
    // of grass with bare ground between.
    const terrain = uniformTerrain(BIOME.WOODLAND, { lushness: 1 })
    const { understory, canopy } = scatterFoliage(terrain, 53, FLAT)

    const grassCells = new Set()
    for (const layer of understory) {
      for (let i = 0; i < layer.count; i += 1) {
        grassCells.add(`${Math.round(layer.positions[i * 3])},${Math.round(layer.positions[i * 3 + 1])}`)
      }
    }

    let treeCount = 0
    let treesOnGrass = 0
    for (const layer of canopy) {
      for (let i = 0; i < layer.count; i += 1) {
        treeCount += 1
        if (grassCells.has(`${Math.round(layer.positions[i * 3])},${Math.round(layer.positions[i * 3 + 1])}`)) {
          treesOnGrass += 1
        }
      }
    }

    // Independent layers overlap at roughly the understory's own
    // occupancy rate; a correlated pair sits near 0 or near 1.
    const overlap = treesOnGrass / treeCount
    expect(overlap).toBeGreaterThan(0.1)
    expect(overlap).toBeLessThan(0.9)
  })

  it("defaults the cell scale to the projection's own", () => {
    // Foliage is smaller on the planet than on the flat map because the
    // relief around it is, and forgetting the scale is how a jungle crown
    // came out at 40% of the planet's entire vertical relief.
    const terrain = uniformTerrain(BIOME.MEADOW, { height01: 0 })
    const [layer] = scatterUnderstory(terrain, 59, {
      projection: sphereProjection,
      heightScale: sphereProjection.heightScale(terrain),
    })
    const [scaled] = scatterFoliage(terrain, 59, {
      projection: sphereProjection,
      heightScale: sphereProjection.heightScale(terrain),
    }).understory

    // scatterUnderstory alone defaults to 1 cell; scatterFoliage passes
    // the projection's foliageScale down.
    const unscaledLift = layer.variant.size * UNDERSTORY_LIFT_RATIO
    const scaledLift = layer.variant.size * SPHERE_VIEW.foliageScale * UNDERSTORY_LIFT_RATIO
    const radius = Math.hypot(layer.positions[0], layer.positions[1], layer.positions[2])
    const scaledRadius = Math.hypot(scaled.positions[0], scaled.positions[1], scaled.positions[2])

    expect(radius - scaledRadius).toBeCloseTo(unscaledLift - scaledLift, 5)
  })
})
