import { BIOME_THRESHOLDS } from './config.js'

/** Biome ids stored in World.terrain.biomeMap. */
export const BIOME = Object.freeze({
  OCEAN: 0,
  BEACH: 1,
  PLAINS: 2,
  FOREST: 3,
  MOUNTAIN: 4,
  SNOW: 5,
})

/**
 * Samples fractal (multi-octave) noise at (x, y), normalized to [0, 1].
 * Exported for reuse by other terrain-shaping strategies (e.g.
 * sectionTerrain.js) that still want natural noise-based detail on top of
 * their own structural height.
 * @param {import('simplex-noise').NoiseFunction2D} noise2D
 * @param {number} x
 * @param {number} y
 * @param {{ octaves: number, persistence: number, scale: number }} params
 */
export function sampleFractalNoise(noise2D, x, y, { octaves, persistence, scale }) {
  let amplitude = 1
  let frequency = 1
  let sum = 0
  let maxAmplitude = 0

  for (let i = 0; i < octaves; i++) {
    sum += noise2D((x / scale) * frequency, (y / scale) * frequency) * amplitude
    maxAmplitude += amplitude
    amplitude *= persistence
    frequency *= 2
  }

  // noise2D returns [-1, 1]; normalize the accumulated sum to [0, 1]
  return (sum / maxAmplitude + 1) / 2
}

/**
 * Classifies a cell's biome from its height and moisture.
 * Pure and reusable so presentation layers can re-derive biome info
 * without re-running generation.
 * @param {number} height [0, 1]
 * @param {number} moisture [0, 1]
 */
export function classifyBiome(height, moisture) {
  if (height < BIOME_THRESHOLDS.oceanMaxHeight) return BIOME.OCEAN
  if (height < BIOME_THRESHOLDS.beachMaxHeight) return BIOME.BEACH
  if (height > BIOME_THRESHOLDS.snowMinHeight) return BIOME.SNOW
  if (height > BIOME_THRESHOLDS.mountainMinHeight) return BIOME.MOUNTAIN
  return moisture > BIOME_THRESHOLDS.forestMinMoisture ? BIOME.FOREST : BIOME.PLAINS
}

