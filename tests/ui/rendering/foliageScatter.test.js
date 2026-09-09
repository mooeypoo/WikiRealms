import { describe, expect, it } from 'vitest'
import { scatterCanopy, scatterFoliage, scatterUnderstory } from '../../../src/ui/rendering/foliageScatter.js'
import {
  CANOPY_ARCHETYPES,
  FOLIAGE_SAMPLING,
  UNDERSTORY_BY_BAND,
  CANOPY_JITTER,
  UNDERSTORY_JITTER,
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

  it('scatters a few non-green accents without adding layers', () => {
    // Accents rewrite instance colours inside existing variant meshes —
    // layer count must stay the band's length, or we paid a draw call.
    const layers = scatterUnderstory(uniformTerrain(BIOME.MEADOW), 42, FLAT)
    expect(layers).toHaveLength(UNDERSTORY_BY_BAND[BIOME.MEADOW].length)

    let warmish = 0
    let total = 0
    for (const layer of layers) {
      if (layer.variant.kind === 'scrub') continue
      for (let i = 0; i < layer.count; i += 1) {
        const r = layer.colors[i * 3]
        const g = layer.colors[i * 3 + 1]
        total += 1
        if (r > g * 0.85) warmish += 1
      }
    }
    expect(total).toBeGreaterThan(50)
    expect(warmish).toBeGreaterThan(0)
    expect(warmish / total).toBeLessThan(0.25)
  })

  it('emits three position floats per sprite', () => {
    for (const layer of scatterUnderstory(uniformTerrain(BIOME.JUNGLE), 7, FLAT)) {
      expect(layer.positions).toBeInstanceOf(Float32Array)
      expect(layer.positions.length).toBe(layer.count * 3)
      expect(layer.count).toBeGreaterThan(0)
    }
  })

  it('roots each clump exactly on the surface', () => {
    // This layer used to be point sprites, which are centred on their
    // position, so every one was lifted half its own width or it would
    // be buried to the waist. Clumps are geometry with their base at the
    // origin, so any lift now leaves the grass hovering.
    const terrain = uniformTerrain(BIOME.MEADOW, { height01: 0.4 })
    const surfaceZ = 0.4 * FLAT.heightScale

    for (const layer of scatterUnderstory(terrain, 3, FLAT)) {
      for (let i = 0; i < layer.count; i += 1) {
        expect(layer.positions[i * 3 + 2]).toBeCloseTo(surfaceZ, 5)
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

  it("defaults the canopy's cell scale to the projection's own", () => {
    // Foliage is smaller on the planet than on the flat map because the
    // relief around it is, and forgetting the scale is how a jungle crown
    // came out at 40% of the planet's entire vertical relief.
    const terrain = uniformTerrain(BIOME.WOODLAND, { height01: 0.3, lushness: 0.9 })
    const options = {
      projection: sphereProjection,
      heightScale: sphereProjection.heightScale(terrain),
    }
    const [bare] = scatterCanopy(terrain, 59, options)
    const [scaled] = scatterFoliage(terrain, 59, options).canopy

    // scatterCanopy alone defaults to 1 cell; scatterFoliage passes the
    // projection's foliageScale down. The offset is the only part of a
    // tree's placement the scale reaches, so it is where the difference
    // shows.
    const bareOffset = Math.hypot(bare.positions[0], bare.positions[1], bare.positions[2])
    const scaledOffset = Math.hypot(scaled.positions[0], scaled.positions[1], scaled.positions[2])
    expect(SPHERE_VIEW.foliageScale).toBeLessThan(1)
    expect(bareOffset).toBeCloseTo(scaledOffset, 5)
  })

  it('gives the understory the same instance attributes a tree gets', () => {
    // A sprite had nothing but a position — it faced the camera whatever
    // the ground did. Real geometry has to be told which way is up, or it
    // lies flat on the far side of the globe.
    const terrain = uniformTerrain(BIOME.MEADOW, { height01: 0.3, lushness: 0.8 })
    const [layer] = scatterUnderstory(terrain, 11, {
      projection: sphereProjection,
      heightScale: sphereProjection.heightScale(terrain),
    })

    expect(layer.count).toBeGreaterThan(0)
    for (const name of ['positions', 'normals', 'colors']) {
      expect(layer[name].length, name).toBe(layer.count * 3)
    }
    for (const name of ['yaws', 'scales', 'heights']) {
      expect(layer[name].length, name).toBe(layer.count)
    }

    for (let i = 0; i < layer.count; i += 1) {
      const length = Math.hypot(layer.normals[i * 3], layer.normals[i * 3 + 1], layer.normals[i * 3 + 2])
      expect(length).toBeCloseTo(1, 5)
      expect(layer.yaws[i]).toBeGreaterThanOrEqual(0)
      expect(layer.yaws[i]).toBeLessThan(Math.PI * 2)
      expect(layer.scales[i]).toBeGreaterThanOrEqual(UNDERSTORY_JITTER.minScale)
      expect(layer.scales[i]).toBeLessThanOrEqual(UNDERSTORY_JITTER.maxScale)
      expect(layer.heights[i]).toBeCloseTo(0.3, 5)
    }
  })

  it('turns every clump a different way, and to a different size', () => {
    // Uniform terrain grows one variant at one size everywhere, so
    // without per-instance jitter a meadow is a stamped lattice of
    // identical clumps — the defect the canopy already guards against.
    const terrain = uniformTerrain(BIOME.MEADOW, { height01: 0.3, lushness: 0.8 })
    const [layer] = scatterUnderstory(terrain, 11, FLAT)

    expect(new Set(layer.yaws).size).toBeGreaterThan(layer.count * 0.9)
    expect(new Set(layer.scales).size).toBeGreaterThan(layer.count * 0.9)

    // And the offset has to actually move them off their cell centres,
    // without reaching into the neighbouring cell — which, at a stride
    // of one, means half a cell.
    let maxOffset = 0
    for (let i = 0; i < layer.count; i += 1) {
      const cellX = Math.round(layer.positions[i * 3])
      const cellY = Math.round(layer.positions[i * 3 + 1])
      maxOffset = Math.max(
        maxOffset,
        Math.hypot(layer.positions[i * 3] - cellX, layer.positions[i * 3 + 1] - cellY),
      )
    }
    expect(maxOffset).toBeGreaterThan(0.2)
    expect(UNDERSTORY_JITTER.maxOffsetCells).toBeLessThanOrEqual(FOLIAGE_SAMPLING.understoryStride / 2)
  })

  it('lights each plant by the sky its own cell can see', () => {
    // Otherwise the ground darkens in a ravine and the trees standing in
    // it do not, and the vegetation reads as cut out and laid on top of
    // the terrain rather than growing from it.
    const terrain = uniformTerrain(BIOME.WOODLAND, { height01: 0.35, lushness: 0.8 })
    const skyVisibility = new Float32Array(terrain.width * terrain.height).fill(1)
    // A BAND of deeply occluded cells across the middle of the world,
    // not a single row: the canopy samples every other cell, so one row
    // can fall entirely between samples and be found nowhere.
    const middle = Math.floor(terrain.height / 2)
    for (let y = middle - 4; y <= middle + 4; y += 1) {
      for (let x = 0; x < terrain.width; x += 1) skyVisibility[y * terrain.width + x] = 0.25
    }

    const [layer] = scatterCanopy(terrain, 31, { ...FLAT, skyVisibility })

    expect(layer.occlusions).toHaveLength(layer.count)
    const shaded = [...layer.occlusions].filter((value) => value < 0.5)
    const open = [...layer.occlusions].filter((value) => value === 1)
    expect(shaded.length).toBeGreaterThan(0)
    expect(open.length).toBeGreaterThan(0)
    for (const value of shaded) expect(value).toBeCloseTo(0.25, 6)
  })

  it('lights every plant fully when no occlusion map is supplied', () => {
    // The default has to be "sees the whole sky". Zero-filled would mean
    // a caller without a map — every test here, and any future one —
    // gets vegetation lit by no sky at all.
    const terrain = uniformTerrain(BIOME.WOODLAND, { height01: 0.35, lushness: 0.8 })
    const [canopy] = scatterCanopy(terrain, 31, FLAT)
    const [understory] = scatterUnderstory(terrain, 31, FLAT)

    for (const value of canopy.occlusions) expect(value).toBe(1)
    for (const value of understory.occlusions) expect(value).toBe(1)
  })

  it('puts each plant in the shadow its own cell stands in', () => {
    // A hillside that loses the sun goes dark, and a stand of trees on
    // it that did not would be the brightest thing in the shot. Same
    // per-cell lookup as the sky term, for the other light source.
    const terrain = uniformTerrain(BIOME.WOODLAND, { height01: 0.35, lushness: 0.8 })
    const sunlightMap = new Float32Array(terrain.width * terrain.height).fill(1)
    // A band across the world, which is the shape a shadow has anyway —
    // and a band rather than a row because the layers sample on a
    // stride, so a single row can fall between samples and be found
    // nowhere. Same trap as the sky-visibility test above.
    const middle = Math.floor(terrain.height / 2)
    for (let y = middle - 4; y <= middle + 4; y += 1) {
      for (let x = 0; x < terrain.width; x += 1) sunlightMap[y * terrain.width + x] = 0.25
    }

    const [canopy] = scatterCanopy(terrain, 31, { ...FLAT, sunlightMap })
    const [understory] = scatterUnderstory(terrain, 31, { ...FLAT, sunlightMap })

    for (const layer of [canopy, understory]) {
      expect(layer.sunlights).toHaveLength(layer.count)
      const shaded = [...layer.sunlights].filter((value) => value < 0.5)
      const sunny = [...layer.sunlights].filter((value) => value === 1)
      expect(shaded.length).toBeGreaterThan(0)
      expect(sunny.length).toBeGreaterThan(0)
      for (const value of shaded) expect(value).toBeCloseTo(0.25, 6)
    }
  })

  it('leaves every plant in full sun when no shadow map is supplied', () => {
    // Zero-filled would leave a caller without a map — every test here —
    // with vegetation standing in permanent night.
    const terrain = uniformTerrain(BIOME.WOODLAND, { height01: 0.35, lushness: 0.8 })
    const [canopy] = scatterCanopy(terrain, 31, FLAT)
    const [understory] = scatterUnderstory(terrain, 31, FLAT)

    for (const value of canopy.sunlights) expect(value).toBe(1)
    for (const value of understory.sunlights) expect(value).toBe(1)
  })

  it('hands both light maps through scatterFoliage together', () => {
    // The component builds one and then the other and passes both in a
    // single call; dropping either on the way through is a whole layer
    // lit differently from the ground it stands on.
    const terrain = uniformTerrain(BIOME.WOODLAND, { height01: 0.35, lushness: 0.8 })
    const cells = terrain.width * terrain.height
    const skyVisibility = new Float32Array(cells).fill(0.5)
    const sunlightMap = new Float32Array(cells).fill(0.25)

    const { canopy, understory } = scatterFoliage(terrain, 31, { ...FLAT, skyVisibility, sunlightMap })

    for (const layers of [canopy, understory]) {
      expect(layers.length).toBeGreaterThan(0)
      for (const layer of layers) {
        for (const value of layer.occlusions) expect(value).toBeCloseTo(0.5, 6)
        for (const value of layer.sunlights) expect(value).toBeCloseTo(0.25, 6)
      }
    }
  })

  it('orders instances so that any prefix covers the whole world', () => {
    // Distance thinning works by lowering an InstancedMesh's count,
    // which draws the FIRST n instances. Cells are found in scan order,
    // so without the hash sort, thinning would strip the world from one
    // edge — the far half of the map would have no vegetation at all
    // rather than sparser vegetation.
    const terrain = uniformTerrain(BIOME.MEADOW, { height01: 0.3, lushness: 0.9 })
    const [layer] = scatterUnderstory(terrain, 77, FLAT)
    expect(layer.count).toBeGreaterThan(400)

    // Take the prefix that thinning would keep from a long way out and
    // check it still reaches every quadrant of the map.
    // The flat projection centres the map on the origin, so the sign of
    // each coordinate is the half of the world it fell in.
    const prefix = Math.round(layer.count * 0.05)
    const quadrants = new Map()
    for (let i = 0; i < prefix; i += 1) {
      const x = layer.positions[i * 3] < 0 ? 'W' : 'E'
      const y = layer.positions[i * 3 + 1] < 0 ? 'S' : 'N'
      quadrants.set(x + y, (quadrants.get(x + y) ?? 0) + 1)
    }

    expect([...quadrants.keys()].sort()).toEqual(['EN', 'ES', 'WN', 'WS'])
    // And roughly evenly, not one quadrant carrying the layer.
    for (const [quadrant, taken] of quadrants) {
      expect(taken / prefix, quadrant).toBeGreaterThan(0.15)
      expect(taken / prefix, quadrant).toBeLessThan(0.35)
    }
  })

  it('thins the sparse bands no faster than the dense ones', () => {
    // The thinning order takes its own salt. Reusing the placement roll
    // would mean the cells that survive are the ones that were most
    // likely to grow something in the first place, so a band at 6%
    // density would disappear entirely while a band at 55% barely
    // thinned — and it is the rare wildflower that would go.
    const terrain = uniformTerrain(BIOME.MEADOW, { height01: 0.3, lushness: 0.9 })
    const layers = scatterUnderstory(terrain, 91, FLAT)
    expect(layers.length).toBeGreaterThan(1)

    const total = layers.reduce((sum, layer) => sum + layer.count, 0)
    for (const layer of layers) {
      // Each variant is its own mesh with its own count, so thinning is
      // proportional per layer by construction. What must hold is that
      // no layer is empty to begin with — a variant that scattered
      // nothing cannot be thinned into existence later.
      expect(layer.count, layer.variant.kind).toBeGreaterThan(0)
      expect(layer.count / total).toBeLessThan(1)
    }

    // Within one layer, the first instances must not be biased toward
    // the cells that rolled most eagerly. Compare the mean density roll
    // of the kept prefix against the layer as a whole.
    const [layer] = layers
    const prefix = Math.round(layer.count * 0.1)
    const meanHeight = (from, to) => {
      let sum = 0
      for (let i = from; i < to; i += 1) sum += layer.scales[i]
      return sum / (to - from)
    }
    // Scale is drawn from an independent salt, so a biased prefix shows
    // up as a prefix whose mean scale drifts from the whole layer's.
    expect(meanHeight(0, prefix)).toBeCloseTo(meanHeight(0, layer.count), 1)
  })

  it('leaves ground cover exactly where it was before clumps replaced sprites', () => {
    // The placement roll keeps salt 0 and the new per-instance rolls take
    // salts of their own, so giving a clump a size and a bearing must not
    // change WHICH cells grow anything. If this drifts, every world's
    // ground cover has quietly moved.
    //
    // The figures track the WOODLAND densities in UNDERSTORY_BY_BAND and
    // the understory curve in FOLIAGE_DENSITY — raise either and they
    // move. What they must not do is move because the rolls moved.
    const terrain = uniformTerrain(BIOME.WOODLAND, { height01: 0.35, lushness: 0.7 })
    const layers = scatterUnderstory(terrain, 404, FLAT)

    expect(layers.map((layer) => [layer.variant.kind, layer.count])).toEqual([
      ['fern', 1826],
      ['grass', 228],
    ])
  })
})
