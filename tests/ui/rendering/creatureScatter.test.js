import { describe, expect, it } from 'vitest'
import {
  scatterCreatures,
  creatureCount,
  creatureCountByHabitat,
  sampleHeight,
} from '../../../src/ui/rendering/creatureScatter.js'
import {
  CREATURE_DENSITY_BY_BAND,
  CREATURE_HABITAT,
  CREATURE_SAMPLING,
  creaturePose,
} from '../../../src/ui/rendering/creatures.js'
import { CREATURE_FAMILY } from '../../../src/ui/rendering/creatureTaxonomy.js'
import { flatProjection } from '../../../src/ui/rendering/projection.js'
import { BIOME } from '../../../src/engine/generation/terrain.js'
import { BIOME_THRESHOLDS } from '../../../src/engine/generation/config.js'

function uniformTerrain(band, { width = 48, height = 48, height01 = 0.25 } = {}) {
  const cells = width * height
  return {
    width,
    height,
    heightMap: new Float64Array(cells).fill(height01),
    biomeMap: new Uint8Array(cells).fill(band),
    lushnessMap: new Float64Array(cells).fill(0.5),
  }
}

const FLAT = { projection: flatProjection, heightScale: 10, densityScale: 1, pageviews: 500_000 }

describe('sampleHeight', () => {
  it('returns corner values exactly', () => {
    const map = new Float64Array([0, 1, 2, 3])
    expect(sampleHeight(map, 2, 2, 0, 0)).toBe(0)
    expect(sampleHeight(map, 2, 2, 1, 1)).toBe(3)
  })

  it('interpolates the centre of a cell', () => {
    const map = new Float64Array([0, 0, 0, 1])
    expect(sampleHeight(map, 2, 2, 0.5, 0.5)).toBeCloseTo(0.25)
  })
})

describe('scatterCreatures', () => {
  it('spawns nothing on snow, and only shore pets on beach', () => {
    expect(scatterCreatures(uniformTerrain(BIOME.SNOW), 1, ['Mammals'], FLAT)).toEqual([])
    const beach = scatterCreatures(
      uniformTerrain(BIOME.BEACH, { width: 96, height: 96, height01: 0.34 }),
      1,
      ['Mammals'],
      FLAT,
    )
    for (const layer of beach) {
      expect(layer.habitat).toBe(CREATURE_HABITAT.sea)
      expect(['crab', 'penguin']).toContain(layer.petId)
    }
  })

  it('spawns sea pets on ocean — never land animals', () => {
    const layers = scatterCreatures(
      uniformTerrain(BIOME.OCEAN, { width: 96, height: 96, height01: 0.1 }),
      7,
      ['Mammals'],
      FLAT,
    )
    const { land, sea } = creatureCountByHabitat(layers)
    expect(land).toBe(0)
    expect(sea).toBeGreaterThan(0)
    expect(sea).toBeLessThanOrEqual(CREATURE_SAMPLING.maxSea)
    expect(layers.every((l) => l.habitat === CREATURE_HABITAT.sea)).toBe(true)
    expect(layers.every((l) => ['fish', 'crab', 'penguin'].includes(l.petId))).toBe(true)
  })

  it('keeps fish off the shallow shelf', () => {
    // Depth 0.04 < SEA_FISH_MIN_DEPTH — crabs and penguins only.
    const layers = scatterCreatures(
      uniformTerrain(BIOME.OCEAN, { width: 96, height: 96, height01: 0.28 }),
      11,
      ['Mammals', 'Marine biology'],
      FLAT,
    )
    expect(creatureCountByHabitat(layers).sea).toBeGreaterThan(0)
    expect(layers.every((l) => ['crab', 'penguin'].includes(l.petId))).toBe(true)
  })

  it('may put shore pets on the beach', () => {
    const layers = scatterCreatures(
      uniformTerrain(BIOME.BEACH, { width: 96, height: 96, height01: 0.34 }),
      13,
      ['Mammals'],
      FLAT,
    )
    const sea = layers.filter((l) => l.habitat === CREATURE_HABITAT.sea)
    for (const layer of sea) {
      expect(['crab', 'penguin']).toContain(layer.petId)
    }
  })

  it('keeps land pets off the ocean', () => {
    const layers = scatterCreatures(uniformTerrain(BIOME.MEADOW, { width: 96, height: 96 }), 7, ['Mammals'], FLAT)
    expect(layers.every((l) => l.habitat === CREATURE_HABITAT.land)).toBe(true)
    expect(layers.every((l) => !['fish', 'crab', 'penguin'].includes(l.petId))).toBe(true)
  })

  it('roots sea preview positions under the waterline', () => {
    const terrain = uniformTerrain(BIOME.OCEAN, { height01: 0.1 })
    const layers = scatterCreatures(terrain, 5, ['Astronomy'], FLAT)
    const surfaceZ = BIOME_THRESHOLDS.oceanMaxHeight * FLAT.heightScale
    for (const layer of layers) {
      for (let i = 0; i < layer.count; i += 1) {
        expect(layer.previewPositions[i * 3 + 2]).toBeLessThan(surfaceZ)
      }
    }
  })

  it('spawns on meadow and respects the land hard cap', () => {
    const layers = scatterCreatures(uniformTerrain(BIOME.MEADOW, { width: 96, height: 96 }), 7, ['Mammals'], FLAT)
    const total = creatureCount(layers)
    expect(total).toBeGreaterThan(0)
    expect(total).toBeLessThanOrEqual(CREATURE_SAMPLING.maxLand)
    expect(layers.every((l) => l.habitat === CREATURE_HABITAT.land)).toBe(true)
  })

  it('is denser in jungle than in dunes', () => {
    const dunes = creatureCount(
      scatterCreatures(uniformTerrain(BIOME.DUNES, { width: 80, height: 80 }), 3, ['Mammals'], FLAT),
    )
    const jungle = creatureCount(
      scatterCreatures(uniformTerrain(BIOME.JUNGLE, { width: 80, height: 80 }), 3, ['Mammals'], FLAT),
    )
    expect(CREATURE_DENSITY_BY_BAND[BIOME.JUNGLE]).toBeGreaterThan(CREATURE_DENSITY_BY_BAND[BIOME.DUNES])
    expect(jungle).toBeGreaterThan(dunes)
  })

  it('is deterministic for a fixed seed and categories', () => {
    const cats = ['Mammals', 'Olympic sports']
    const a = scatterCreatures(uniformTerrain(BIOME.MEADOW), 42, cats, FLAT)
    const b = scatterCreatures(uniformTerrain(BIOME.MEADOW), 42, cats, FLAT)
    expect(a.map((l) => ({ family: l.family, count: l.count, habitat: l.habitat }))).toEqual(
      b.map((l) => ({ family: l.family, count: l.count, habitat: l.habitat })),
    )
    expect(a[0]?.homes).toEqual(b[0]?.homes)
  })

  it('thins with densityScale', () => {
    const full = creatureCount(
      scatterCreatures(uniformTerrain(BIOME.JUNGLE, { width: 80, height: 80 }), 9, ['Mammals'], FLAT),
    )
    const half = creatureCount(
      scatterCreatures(uniformTerrain(BIOME.JUNGLE, { width: 80, height: 80 }), 9, ['Mammals'], {
        ...FLAT,
        densityScale: 0.45,
      }),
    )
    expect(half).toBeLessThan(full)
  })

  it('hosts fewer creatures on quiet articles than busy ones', () => {
    const quiet = creatureCount(
      scatterCreatures(uniformTerrain(BIOME.JUNGLE, { width: 96, height: 96 }), 9, ['Mammals'], {
        ...FLAT,
        pageviews: 200,
      }),
    )
    const busy = creatureCount(
      scatterCreatures(uniformTerrain(BIOME.JUNGLE, { width: 96, height: 96 }), 9, ['Mammals'], {
        ...FLAT,
        pageviews: 2_000_000,
      }),
    )
    expect(busy).toBeGreaterThan(quiet)
  })

  it('keeps oceans empty on low-pageview articles', () => {
    const layers = scatterCreatures(
      uniformTerrain(BIOME.OCEAN, { width: 96, height: 96, height01: 0.1 }),
      7,
      ['Mammals'],
      { ...FLAT, pageviews: 500 },
    )
    expect(creatureCountByHabitat(layers).sea).toBe(0)
  })

  it('emits nature-heavy layers for nature categories', () => {
    const layers = scatterCreatures(
      uniformTerrain(BIOME.MEADOW, { width: 80, height: 80 }),
      11,
      ['Mammals', 'Birds of Europe'],
      FLAT,
    )
    const nature = layers.find((l) => l.family === CREATURE_FAMILY.nature)
    expect(nature?.count ?? 0).toBeGreaterThan(0)
  })

  it('roots land preview positions on the surface', () => {
    const terrain = uniformTerrain(BIOME.MEADOW, { height01: 0.4 })
    const layers = scatterCreatures(terrain, 5, ['Mammals'], FLAT)
    const surfaceZ = 0.4 * FLAT.heightScale
    for (const layer of layers) {
      for (let i = 0; i < layer.count; i += 1) {
        expect(layer.previewPositions[i * 3 + 2]).toBeCloseTo(surfaceZ, 5)
      }
    }
  })
})

describe('creaturePose', () => {
  it('keeps hop strides on the ground and squishes instead', () => {
    const grounded = creaturePose(1.25, {
      phase: 0.3,
      gaitSpeed: 1,
      hopHeight: 1,
      gait: 'hop',
      scale: 0.5,
      squat: 0.8,
    })
    expect(grounded.lift).toBe(0)
    expect(Number.isFinite(grounded.squashX)).toBe(true)
    expect(Number.isFinite(grounded.squashY)).toBe(true)

    const mid = creaturePose(0, {
      phase: 0.75,
      gaitSpeed: 1,
      hopHeight: 1.2,
      gait: 'hop',
      scale: 1,
      squat: 0.8,
    })
    const tall = creaturePose(0, {
      phase: 0.25,
      gaitSpeed: 1,
      hopHeight: 1.2,
      gait: 'hop',
      scale: 1,
      squat: 0.8,
    })
    // Compress half of the stride is shorter than the spring half.
    expect(mid.squashY).toBeLessThan(tall.squashY)
    expect(mid.squashX).toBeGreaterThan(tall.squashX)
  })

  it('waddles with lean and no vertical bob', () => {
    const pose = creaturePose(0.4, {
      phase: 0,
      gaitSpeed: 1,
      hopHeight: 0.5,
      gait: 'waddle',
      scale: 1,
      squat: 0.75,
    })
    expect(pose.lift).toBe(0)
    expect(Math.abs(pose.lean)).toBeGreaterThan(0)
  })

  it('crests above the surface gently for breach, with pitch', () => {
    const low = creaturePose(0.1, {
      phase: 0,
      gaitSpeed: 1,
      hopHeight: 2,
      gait: 'breach',
      scale: 1,
      squat: 0.5,
    })
    const high = creaturePose(CREATURE_SAMPLING.breachPeriod * 0.8, {
      phase: 0,
      gaitSpeed: 1,
      hopHeight: 2,
      gait: 'breach',
      scale: 1,
      squat: 0.5,
    })
    expect(high.lift).toBeGreaterThan(low.lift)
    expect(high.lift).toBeLessThan(1) // no flea-sized leaps
    expect(high.pitch).toBeGreaterThan(0)
  })
})
