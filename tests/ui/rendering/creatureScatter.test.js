import { describe, expect, it } from 'vitest'
import { scatterCreatures, creatureCount, sampleHeight } from '../../../src/ui/rendering/creatureScatter.js'
import { CREATURE_DENSITY_BY_BAND, CREATURE_SAMPLING, creaturePose } from '../../../src/ui/rendering/creatures.js'
import { CREATURE_FAMILY } from '../../../src/ui/rendering/creatureTaxonomy.js'
import { flatProjection } from '../../../src/ui/rendering/projection.js'
import { BIOME } from '../../../src/engine/generation/terrain.js'

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

const FLAT = { projection: flatProjection, heightScale: 10, densityScale: 1 }

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
  it('spawns nothing on ocean or snow', () => {
    for (const band of [BIOME.OCEAN, BIOME.BEACH, BIOME.SNOW]) {
      expect(scatterCreatures(uniformTerrain(band), 1, ['Mammals'], FLAT)).toEqual([])
    }
  })

  it('spawns on meadow and respects the hard cap', () => {
    const layers = scatterCreatures(uniformTerrain(BIOME.MEADOW, { width: 96, height: 96 }), 7, ['Mammals'], FLAT)
    const total = creatureCount(layers)
    expect(total).toBeGreaterThan(0)
    expect(total).toBeLessThanOrEqual(CREATURE_SAMPLING.maxCount)
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
    expect(a.map((l) => ({ family: l.family, count: l.count }))).toEqual(
      b.map((l) => ({ family: l.family, count: l.count })),
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

  it('roots preview positions on the surface', () => {
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
  it('returns finite squash values', () => {
    const pose = creaturePose(1.25, {
      phase: 0.3,
      gaitSpeed: 1,
      hopHeight: 1,
      gait: 'hop',
      scale: 0.5,
      squat: 0.8,
    })
    expect(pose.lift).toBeGreaterThanOrEqual(0)
    expect(Number.isFinite(pose.squashX)).toBe(true)
    expect(Number.isFinite(pose.squashY)).toBe(true)
  })
})
