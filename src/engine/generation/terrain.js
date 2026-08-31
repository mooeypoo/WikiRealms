import { createNoise2D } from 'simplex-noise'

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
 * @param {import('simplex-noise').NoiseFunction2D} noise2D
 * @param {number} x
 * @param {number} y
 * @param {{ octaves: number, persistence: number, scale: number }} params
 */
function sampleFractalNoise(noise2D, x, y, { octaves, persistence, scale }) {
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
  if (height < 0.32) return BIOME.OCEAN
  if (height < 0.36) return BIOME.BEACH
  if (height > 0.85) return BIOME.SNOW
  if (height > 0.7) return BIOME.MOUNTAIN
  return moisture > 0.5 ? BIOME.FOREST : BIOME.PLAINS
}

/**
 * Generates a deterministic terrain grid from a feature vector and a
 * seeded RNG. Presentation-agnostic: the output is plain typed arrays
 * describing per-cell height/moisture/biome, suitable for either a flat
 * 2D renderer or a 3D heightmap mesh.
 *
 * @param {{ width: number, height: number, rng: () => number, featureVector: object }} options
 * @returns {{ width: number, height: number, heightMap: Float64Array, moistureMap: Float64Array, biomeMap: Uint8Array }}
 */
export function generateTerrain({ width, height, rng, featureVector }) {
  const heightNoise = createNoise2D(rng)
  const moistureNoise = createNoise2D(rng)

  // Feature-driven shaping: denser/longer articles produce more varied, larger terrain features.
  const scale = width / (2 + featureVector.linkDensity * 6) // larger scale = broader features
  const octaves = Math.round(3 + featureVector.categoryDensity * 3)
  const persistence = 0.35 + featureVector.imageDensity * 0.25

  const cellCount = width * height
  const heightMap = new Float64Array(cellCount)
  const moistureMap = new Float64Array(cellCount)
  const biomeMap = new Uint8Array(cellCount)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x
      const h = sampleFractalNoise(heightNoise, x, y, { octaves, persistence, scale: scale || 1 })
      const m = sampleFractalNoise(moistureNoise, x, y, { octaves: 2, persistence: 0.5, scale: scale * 1.5 || 1 })

      heightMap[index] = h
      moistureMap[index] = m
      biomeMap[index] = classifyBiome(h, m)
    }
  }

  return { width, height, heightMap, moistureMap, biomeMap }
}
  
