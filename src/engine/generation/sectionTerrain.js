import { createNoise2D } from 'simplex-noise'
import { PEAK_LAYOUT, TERRAIN_DETAIL, WATER_LEVEL } from './config.js'
import { classifyBiome, sampleFractalNoise } from './terrain.js'
import { computeSpiralLayout } from './layout.js'

function clamp01(value) {
  return Math.min(1, Math.max(0, value))
}

/**
 * Recursively turns a (peak-limited) section tree into a flat list of
 * radial height bumps ("peaks") for a section and its direct subsections.
 * A section's subtree size controls the breadth of its mountain range;
 * its own prose controls the height of the base. Direct children form the
 * sharper summits that reveal the range's internal article structure.
 *
 * @param {object[]} nodes section tree nodes (title, subtreeSize, children, ...)
 * @param {{ centerX: number, centerY: number, maxRadius: number, minRadius?: number }} bounds
 * @returns {{ x: number, y: number, radius: number, amplitude: number, title: string, depth: number }[]}
 */
export function flattenPeaks(nodes, { centerX, centerY, maxRadius, minRadius = 0 }) {
  if (!nodes || nodes.length === 0) return []

  const totalSubtreeSize = nodes.reduce((sum, node) => sum + node.subtreeSize, 0) || 1
  const totalOwnSize = nodes.reduce((sum, node) => sum + node.ownSize, 0) || 1
  const positions = computeSpiralLayout(nodes.length, { centerX, centerY, maxRadius, minRadius })

  const peaks = []
  nodes.forEach((node, index) => {
    const breadthShare = node.subtreeSize / totalSubtreeSize
    const heightShare = node.ownSize / totalOwnSize
    const radius = Math.max(maxRadius * Math.sqrt(breadthShare), PEAK_LAYOUT.minPeakRadius)
    const minimumAmplitude = node.depth <= 1 ? PEAK_LAYOUT.minTopLevelAmplitude : PEAK_LAYOUT.minSubsectionAmplitude
    const nodeAmplitude = Math.max(Math.sqrt(heightShare), minimumAmplitude)
    const position = positions[index]

    peaks.push({
      x: position.x,
      y: position.y,
      radius,
      amplitude: nodeAmplitude,
      title: node.title,
      depth: node.depth,
      ownCitationCount: node.citationCount ?? 0,
      citationCount: node.subtreeCitationCount ?? node.citationCount ?? 0,
      citationDensity: node.subtreeCitationDensity ?? node.citationDensity ?? 0,
    })

    if (node.children.length > 0) {
      peaks.push(
        ...flattenPeaks(node.children, {
          centerX: position.x,
          centerY: position.y,
          maxRadius: radius * PEAK_LAYOUT.childRadiusRatio,
          minRadius: radius * PEAK_LAYOUT.childInnerRadiusRatio,
        }),
      )
    }
  })

  return peaks
}

/**
 * Derives a sea-level height shift from the article's total section text
 * size (see WATER_LEVEL in config.js): stub-like articles get a higher
 * effective sea level, long/detailed ones get a lower one.
 * @param {number} totalArticleSize
 */
function computeWaterLevelShift(totalArticleSize) {
  const sizeFactor = clamp01((totalArticleSize ?? 0) / WATER_LEVEL.articleSizeSoftCap)
  return (sizeFactor - 0.5) * WATER_LEVEL.maxShift
}

/**
 * Generates a deterministic terrain grid shaped by a pre-computed peak
 * list (see flattenPeaks). Each top-level section is a mountain,
 * subsections are sub-peaks, sized by their share of their parent's
 * total text. Fractal noise is layered on top as detail, and biome
 * is a pure function of (water-level-adjusted) height + citation density
 * from the dominant peak in that cell — see docs/generation.md.
 *
 * Output shape matches the original feature-vector-driven generateTerrain
 * exactly (plus `peaks`, passed through for renderers that want to label
 * summits — see WorldView3D.vue), so 2D rendering needs no changes.
 *
 * @param {{ width: number, height: number, rng: () => number, peaks: object[], totalArticleSize: number }} options
 * @returns {{ width: number, height: number, heightMap: Float64Array, moistureMap: Float64Array, biomeMap: Uint8Array }}
 */
export function generateSectionTerrain({ width, height, rng, peaks, totalArticleSize }) {
  const sigmas = peaks.map((peak) => {
    const sigmaRatio = peak.depth <= 1 ? PEAK_LAYOUT.topLevelSigmaRatio : PEAK_LAYOUT.subsectionSigmaRatio
    return Math.max(peak.radius * sigmaRatio, 1)
  })

  const heightNoise = createNoise2D(rng)
  const waterLevelShift = computeWaterLevelShift(totalArticleSize)

  const detailParams = {
    octaves: TERRAIN_DETAIL.noiseOctaves,
    persistence: TERRAIN_DETAIL.noisePersistence,
    scale: TERRAIN_DETAIL.noiseScale,
  }

  // Compute total citations across all peaks for normalization
  const totalCitations = peaks.reduce((sum, peak) => sum + (peak.citationCount ?? 0), 0) || 1

  const cellCount = width * height
  const heightMap = new Float64Array(cellCount)
  const moistureMap = new Float64Array(cellCount) // kept for backward compat, filled with citation density
  const biomeMap = new Uint8Array(cellCount)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x

      let topLevelHeight = 0
      let subsectionHeight = 0
      let dominantTopLevelPeakIndex = -1
      let maxTopLevelContribution = 0

      for (let i = 0; i < peaks.length; i++) {
        const peak = peaks[i]
        const dx = x - peak.x
        const dy = y - peak.y
        const sigma = sigmas[i]
        const contribution = peak.amplitude * Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma))

        // Adjacent primary sections form distinct mountain systems instead
        // of combining into one broad continent. Nested sections still layer
        // on top to make each system's internal hierarchy visible.
        if (peak.depth <= 1) {
          if (contribution > maxTopLevelContribution) {
            maxTopLevelContribution = contribution
            dominantTopLevelPeakIndex = i
          }
          topLevelHeight = Math.max(topLevelHeight, contribution)
        } else {
          subsectionHeight += contribution
        }
      }

      const detail = sampleFractalNoise(heightNoise, x, y, detailParams)
      const rawHeight = clamp01(topLevelHeight + subsectionHeight + (detail - 0.5) * TERRAIN_DETAIL.noiseWeight)
      const finalHeight = clamp01(rawHeight + waterLevelShift)

      // Citation density from the dominant top-level peak
      const dominantPeak = dominantTopLevelPeakIndex >= 0 ? peaks[dominantTopLevelPeakIndex] : null
      const citationDensity = dominantPeak ? (dominantPeak.citationCount ?? 0) / totalCitations : 0

      heightMap[index] = finalHeight
      moistureMap[index] = citationDensity // repurpose for citation density (backward compat field)
      biomeMap[index] = classifyBiome(finalHeight, citationDensity)
    }
  }

  return { width, height, heightMap, moistureMap, biomeMap, peaks }
}
