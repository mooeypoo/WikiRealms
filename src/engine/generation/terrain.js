import { BIOME_THRESHOLDS, CITATION_LUSHNESS, CITATION_PER_SENTENCE } from './config.js'

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
 * Fractal noise sampled on a CYLINDER rather than a plane, so it is
 * continuous across the grid's left/right edges.
 *
 * The grid is an equirectangular map (see config.js GRID): column 0 and
 * column width-1 are neighbouring meridians. Plain 2D noise sampled at
 * x/scale knows nothing about that and leaves a visible discontinuity in
 * surface detail down the seam wherever land crosses it. Wrapping the x
 * axis onto a circle of circumference `width` makes the noise periodic in
 * x by construction, at the same feature size as the planar version —
 * the circle's radius is chosen so one grid column is one unit of arc.
 *
 * @param {import('simplex-noise').NoiseFunction3D} noise3D
 * @param {number} x grid column
 * @param {number} y grid row
 * @param {number} width grid width, i.e. the wrap period
 * @param {{ octaves: number, persistence: number, scale: number }} params
 */
export function sampleFractalNoiseWrapped(noise3D, x, y, width, { octaves, persistence, scale }) {
  const circleRadius = width / (2 * Math.PI)
  const angle = (x / width) * 2 * Math.PI
  const cylinderX = Math.cos(angle) * circleRadius
  const cylinderY = Math.sin(angle) * circleRadius

  let amplitude = 1
  let frequency = 1
  let sum = 0
  let maxAmplitude = 0

  for (let i = 0; i < octaves; i++) {
    sum +=
      noise3D((cylinderX / scale) * frequency, (cylinderY / scale) * frequency, (y / scale) * frequency) * amplitude
    maxAmplitude += amplitude
    amplitude *= persistence
    frequency *= 2
  }

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

/**
 * Classifies biome using citations-per-sentence with article-wide awareness.
 * If the article's average citations-per-sentence is below minAverageThreshold,
 * the entire article's biome is biased toward dry/barren to avoid making
 * sparsely-cited articles appear lush. Otherwise, sections with higher
 * citations-per-sentence appear lusher than those with lower values.
 *
 * @param {number} height [0, 1]
 * @param {number} citationsPerSentence citation count / sentence count for this section
 * @param {number} averageCitationsPerSentence article-wide average
 * @returns {number} BIOME enum value
 */
export function classifyBiomeWithSentenceAwareness(height, citationsPerSentence, averageCitationsPerSentence) {
  // Water and mountain biomes unaffected by citation logic
  if (height < BIOME_THRESHOLDS.oceanMaxHeight) return BIOME.OCEAN
  if (height < BIOME_THRESHOLDS.beachMaxHeight) return BIOME.BEACH
  if (height > BIOME_THRESHOLDS.snowMinHeight) return BIOME.SNOW
  if (height > BIOME_THRESHOLDS.mountainMinHeight) return BIOME.MOUNTAIN

  // Determine effective citation thresholds based on article's overall citation density
  let desertThreshold, lightVegThreshold, meadowThreshold, woodlandThreshold

  if (averageCitationsPerSentence < CITATION_PER_SENTENCE.minAverageThreshold) {
    // Article is sparsely cited overall; bias toward barren with a dampening curve
    const bias = CITATION_PER_SENTENCE.biasStrength
    const baseDesert = CITATION_PER_SENTENCE.desertThresholdAdjusted
    const baseLightVeg = CITATION_PER_SENTENCE.lightVegThresholdAdjusted
    const baseMeadow = CITATION_PER_SENTENCE.meadowThresholdAdjusted
    const baseWoodland = CITATION_PER_SENTENCE.woodlandThresholdAdjusted

    // When below threshold, push thresholds down (making DESERT more likely)
    // Lerp between original thresholds and adjusted thresholds based on bias strength
    desertThreshold = CITATION_LUSHNESS.desertThreshold * (1 - bias) + baseDesert * bias
    lightVegThreshold = CITATION_LUSHNESS.lightVegThreshold * (1 - bias) + baseLightVeg * bias
    meadowThreshold = CITATION_LUSHNESS.meadowThreshold * (1 - bias) + baseMeadow * bias
    woodlandThreshold = CITATION_LUSHNESS.woodlandThreshold * (1 - bias) + baseWoodland * bias
  } else {
    // Article is well-cited; use standard thresholds
    desertThreshold = CITATION_LUSHNESS.desertThreshold
    lightVegThreshold = CITATION_LUSHNESS.lightVegThreshold
    meadowThreshold = CITATION_LUSHNESS.meadowThreshold
    woodlandThreshold = CITATION_LUSHNESS.woodlandThreshold
  }

  // Classify based on this section's citations-per-sentence
  if (citationsPerSentence < desertThreshold) return BIOME.DESERT
  if (citationsPerSentence < lightVegThreshold) return BIOME.LIGHT_VEG
  if (citationsPerSentence < meadowThreshold) return BIOME.MEADOW
  if (citationsPerSentence < woodlandThreshold) return BIOME.WOODLAND
  return BIOME.JUNGLE
}

