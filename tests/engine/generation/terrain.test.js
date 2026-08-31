import { describe, expect, it } from 'vitest'
import { createRng } from '../../../src/engine/generation/rng.js'
import { BIOME, classifyBiome, generateTerrain } from '../../../src/engine/generation/terrain.js'

const featureVector = { summaryLength: 0.5, categoryDensity: 0.5, linkDensity: 0.5, imageDensity: 0.5 }

describe('generateTerrain', () => {
  it('produces grids sized to width * height', () => {
    const terrain = generateTerrain({ width: 8, height: 6, rng: createRng(1), featureVector })

    expect(terrain.heightMap).toHaveLength(48)
    expect(terrain.moistureMap).toHaveLength(48)
    expect(terrain.biomeMap).toHaveLength(48)
  })

  it('is deterministic for the same seed and feature vector', () => {
    const terrainA = generateTerrain({ width: 16, height: 16, rng: createRng(99), featureVector })
    const terrainB = generateTerrain({ width: 16, height: 16, rng: createRng(99), featureVector })

    expect(Array.from(terrainA.heightMap)).toEqual(Array.from(terrainB.heightMap))
    expect(Array.from(terrainA.moistureMap)).toEqual(Array.from(terrainB.moistureMap))
    expect(Array.from(terrainA.biomeMap)).toEqual(Array.from(terrainB.biomeMap))
  })

  it('produces different terrain for a different seed', () => {
    const terrainA = generateTerrain({ width: 16, height: 16, rng: createRng(1), featureVector })
    const terrainB = generateTerrain({ width: 16, height: 16, rng: createRng(2), featureVector })

    expect(Array.from(terrainA.heightMap)).not.toEqual(Array.from(terrainB.heightMap))
  })

  it('produces different terrain for a different feature vector', () => {
    const terrainA = generateTerrain({ width: 16, height: 16, rng: createRng(1), featureVector })
    const terrainB = generateTerrain({
      width: 16,
      height: 16,
      rng: createRng(1),
      featureVector: { summaryLength: 0.1, categoryDensity: 0.9, linkDensity: 0.9, imageDensity: 0.1 },
    })

    expect(Array.from(terrainA.heightMap)).not.toEqual(Array.from(terrainB.heightMap))
  })

  it('keeps height and moisture values within [0, 1]', () => {
    const terrain = generateTerrain({ width: 32, height: 32, rng: createRng(5), featureVector })

    for (const value of terrain.heightMap) {
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(1)
    }
    for (const value of terrain.moistureMap) {
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(1)
    }
  })

  it('assigns every cell a valid known biome', () => {
    const terrain = generateTerrain({ width: 16, height: 16, rng: createRng(3), featureVector })
    const validBiomes = new Set(Object.values(BIOME))

    for (const biome of terrain.biomeMap) {
      expect(validBiomes.has(biome)).toBe(true)
    }
  })
})

describe('classifyBiome', () => {
  it('classifies low height as ocean', () => {
    expect(classifyBiome(0.1, 0.5)).toBe(BIOME.OCEAN)
  })

  it('classifies high height as snow', () => {
    expect(classifyBiome(0.9, 0.5)).toBe(BIOME.SNOW)
  })

  it('classifies mid-high height as mountain', () => {
    expect(classifyBiome(0.75, 0.5)).toBe(BIOME.MOUNTAIN)
  })

  it('classifies mid height with high moisture as forest, low moisture as plains', () => {
    expect(classifyBiome(0.5, 0.8)).toBe(BIOME.FOREST)
    expect(classifyBiome(0.5, 0.2)).toBe(BIOME.PLAINS)
  })
})
