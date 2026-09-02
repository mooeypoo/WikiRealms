import { BIOME_THRESHOLDS, CITATION_LUSHNESS } from './config.js'

/** Biome ids stored in World.terrain.biomeMap. */
export const BIOME = Object.freeze({
  OCEAN: 0,
  BEACH: 1,
  DESERT: 2, // sparse citations/under-cited land
  LIGHT_VEG: 3, // sparse vegetation (light citations)
  MEADOW: 4, // moderate citations/lush grassland
  WOODLAND: 5, // dense vegetation (well-cited)
  JUNGLE: 6, // densest vegetation (heavily-cited)
  MOUNTAIN: 7,
  SNOW: 8,
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
 * Classifies a cell's biome from its height and citation density.
 * Citation density reflects how "important" a section is (how many citations it has
 * relative to the total article). Pure and reusable so presentation layers can
 * re-derive biome info without re-running generation.
 * @param {number} height [0, 1]
 * @param {number} citationDensity [0, 1] - normalized by total article citations
 */
export function classifyBiome(height, citationDensity) {
  if (height < BIOME_THRESHOLDS.oceanMaxHeight) return BIOME.OCEAN
  if (height < BIOME_THRESHOLDS.beachMaxHeight) return BIOME.BEACH
  if (height > BIOME_THRESHOLDS.snowMinHeight) return BIOME.SNOW
  if (height > BIOME_THRESHOLDS.mountainMinHeight) return BIOME.MOUNTAIN

  // Land biomes determined by citation density (how "cited" the section is)
  if (citationDensity < CITATION_LUSHNESS.desertThreshold) return BIOME.DESERT
  if (citationDensity < CITATION_LUSHNESS.lightVegThreshold) return BIOME.LIGHT_VEG
  if (citationDensity < CITATION_LUSHNESS.meadowThreshold) return BIOME.MEADOW
  if (citationDensity < CITATION_LUSHNESS.woodlandThreshold) return BIOME.WOODLAND
  return BIOME.JUNGLE
}

