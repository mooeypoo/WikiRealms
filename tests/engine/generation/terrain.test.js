import { describe, expect, it } from 'vitest'
import { BIOME, classifyBiome } from '../../../src/engine/generation/terrain.js'

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
