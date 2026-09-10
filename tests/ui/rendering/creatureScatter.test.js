import { describe, expect, it } from 'vitest'
import {
  scatterCreatures,
  creatureCount,
  creatureCountByHabitat,
  sampleHeight,
} from '../../../src/ui/rendering/creatureScatter.js'
import {
  CREATURE_HABITAT,
  CREATURE_SAMPLING,
  creaturePose,
} from '../../../src/ui/rendering/creatures.js'
import { CREATURE_FAMILY } from '../../../src/ui/rendering/creatureTaxonomy.js'
import { FISH_PETS } from '../../../src/ui/rendering/kenneyPets.js'
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
  it('spawns nothing on land, snow, or beach', () => {
    expect(scatterCreatures(uniformTerrain(BIOME.SNOW), 1, ['Mammals'], FLAT)).toEqual([])
    expect(scatterCreatures(uniformTerrain(BIOME.MEADOW), 1, ['Mammals'], FLAT)).toEqual([])
    expect(scatterCreatures(uniformTerrain(BIOME.JUNGLE), 1, ['Mammals'], FLAT)).toEqual([])
    expect(
      scatterCreatures(uniformTerrain(BIOME.BEACH, { width: 96, height: 96, height01: 0.34 }), 1, ['Mammals'], FLAT),
    ).toEqual([])
  })

  it('spawns only fish on ocean', () => {
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
    expect(layers.every((l) => FISH_PETS[l.petId])).toBe(true)
  })

  it('keeps fish off the shallow shelf and coastline', () => {
    // Depth 0.04 < SEA_SPAWN_MIN_DEPTH — empty.
    expect(
      scatterCreatures(
        uniformTerrain(BIOME.OCEAN, { width: 96, height: 96, height01: 0.28 }),
        11,
        ['Mammals', 'Marine biology'],
        FLAT,
      ),
    ).toEqual([])
  })

  it('refuses ocean cells that sit next to land', () => {
    const terrain = uniformTerrain(BIOME.OCEAN, { width: 64, height: 64, height01: 0.1 })
    // Paint a land strip through the middle so nearshore ocean fails the
    // offshore ring check.
    for (let y = 0; y < 64; y += 1) {
      for (let x = 28; x < 36; x += 1) {
        terrain.biomeMap[y * 64 + x] = BIOME.MEADOW
      }
    }
    const layers = scatterCreatures(terrain, 11, ['Mammals'], FLAT)
    for (const layer of layers) {
      for (let i = 0; i < layer.count; i += 1) {
        const gx = layer.homes[i * 2]
        expect(gx <= 22 || gx >= 41).toBe(true)
      }
    }
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

  it('is deterministic for a fixed seed and categories', () => {
    const cats = ['Mammals', 'Olympic sports']
    const terrain = uniformTerrain(BIOME.OCEAN, { width: 96, height: 96, height01: 0.1 })
    const a = scatterCreatures(terrain, 42, cats, FLAT)
    const b = scatterCreatures(terrain, 42, cats, FLAT)
    expect(a.map((l) => ({ petId: l.petId, count: l.count, habitat: l.habitat }))).toEqual(
      b.map((l) => ({ petId: l.petId, count: l.count, habitat: l.habitat })),
    )
    expect(a[0]?.homes).toEqual(b[0]?.homes)
  })

  it('thins with densityScale', () => {
    const terrain = uniformTerrain(BIOME.OCEAN, { width: 96, height: 96, height01: 0.1 })
    const full = creatureCount(scatterCreatures(terrain, 9, ['Mammals'], FLAT))
    const half = creatureCount(
      scatterCreatures(terrain, 9, ['Mammals'], {
        ...FLAT,
        densityScale: 0.45,
      }),
    )
    expect(half).toBeLessThan(full)
  })

  it('hosts fewer fish on quiet articles than busy ones', () => {
    const terrain = uniformTerrain(BIOME.OCEAN, { width: 128, height: 128, height01: 0.1 })
    const quiet = creatureCount(
      scatterCreatures(terrain, 9, ['Mammals'], {
        ...FLAT,
        pageviews: 200,
      }),
    )
    const busy = creatureCount(
      scatterCreatures(terrain, 9, ['Mammals'], {
        ...FLAT,
        pageviews: 2_000_000,
      }),
    )
    expect(busy).toBeGreaterThan(quiet)
    expect(quiet).toBeGreaterThan(0)
  })

  it('still puts a few fish in quiet seas — pageviews scale count, not presence', () => {
    const layers = scatterCreatures(
      uniformTerrain(BIOME.OCEAN, { width: 96, height: 96, height01: 0.1 }),
      7,
      ['Mammals'],
      { ...FLAT, pageviews: 500 },
    )
    expect(creatureCountByHabitat(layers).sea).toBeGreaterThan(0)
  })

  it('emits nature-leaning fish for nature categories', () => {
    const layers = scatterCreatures(
      uniformTerrain(BIOME.OCEAN, { width: 96, height: 96, height01: 0.1 }),
      11,
      ['Mammals', 'Birds of Europe'],
      FLAT,
    )
    const nature = layers.filter((l) => l.family === CREATURE_FAMILY.nature)
    expect(nature.reduce((sum, l) => sum + l.count, 0)).toBeGreaterThan(0)
  })
})

describe('creaturePose', () => {
  it('keeps breach motion soft enough not to leave the water', () => {
    const pose = creaturePose(0.4, {
      phase: 0.1,
      gaitSpeed: 1,
      hopHeight: 0.4,
      gait: 'breach',
      scale: 4,
      squat: 1,
    })
    expect(pose.lift).toBeLessThan(1.2)
  })
})
