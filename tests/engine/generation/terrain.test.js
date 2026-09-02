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

  it('classifies mid height with low citation density as desert or light veg', () => {
    expect(classifyBiome(0.5, 0.05)).toBe(BIOME.DESERT) // < 10% citations
    expect(classifyBiome(0.5, 0.15)).toBe(BIOME.LIGHT_VEG) // 10-25% citations
  })

  it('classifies mid height with moderate citation density as meadow or woodland', () => {
    expect(classifyBiome(0.5, 0.3)).toBe(BIOME.MEADOW) // 25-50% citations
    expect(classifyBiome(0.5, 0.6)).toBe(BIOME.WOODLAND) // 50-75% citations
  })

  it('classifies mid height with high citation density as jungle', () => {
    expect(classifyBiome(0.5, 0.8)).toBe(BIOME.JUNGLE) // 75%+ citations
  })
})
