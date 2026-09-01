import { createNoise2D } from 'simplex-noise'
import { PEAK_LAYOUT, TERRAIN_DETAIL, WATER_LEVEL } from './config.js'
import { classifyBiome, sampleFractalNoise } from './terrain.js'
import { computeSpiralLayout } from './layout.js'

function clamp01(value) {
  return Math.min(1, Math.max(0, value))
}

/**
 * Recursively turns a (peak-limited) section tree into a flat list of
 * radial height bumps ("peaks"), one per node at any depth. Each node's
 * children are placed via the spiral layout within their parent's own
 * footprint, sized relative to their parent's total — so a subsection's
 * bump reflects how much of *its section* it represents, not the whole
 * article.
 *
 * @param {object[]} nodes section tree nodes (title, subtreeSize, children, ...)
 * @param {{ centerX: number, centerY: number, maxRadius: number, amplitude?: number }} bounds
 * @returns {{ x: number, y: number, radius: number, amplitude: number, title: string, depth: number }[]}
 */
export function flattenPeaks(nodes, { centerX, centerY, maxRadius, amplitude = 1 }) {
  if (!nodes || nodes.length === 0) return []

  const totalSize = nodes.reduce((sum, node) => sum + node.subtreeSize, 0) || 1
  const positions = computeSpiralLayout(nodes.length, { centerX, centerY, maxRadius })

  const peaks = []
  nodes.forEach((node, index) => {
    const share = node.subtreeSize / totalSize
    const radius = Math.max(maxRadius * Math.sqrt(share), PEAK_LAYOUT.minPeakRadius)
    const nodeAmplitude = amplitude * Math.sqrt(share)
    const position = positions[index]

    peaks.push({ x: position.x, y: position.y, radius, amplitude: nodeAmplitude, title: node.title, depth: node.depth })

    if (node.children.length > 0) {
      peaks.push(
        ...flattenPeaks(node.children, {
          centerX: position.x,
          centerY: position.y,
          maxRadius: radius * PEAK_LAYOUT.childRadiusRatio,
          amplitude: nodeAmplitude * PEAK_LAYOUT.childAmplitudeDecay,
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
 * Generates a deterministic terrain grid shaped by an article's section
 * structure: each top-level section becomes a mountain, subsections
 * become sub-peaks, sized by their share of their parent's total text.
 * Fractal noise is layered on top as a small perturbation for natural
 * detail, and biome stays a pure function of (water-level-adjusted)
 * height + independent ambient moisture — see docs/generation.md.
 *
 * Output shape matches the original feature-vector-driven generateTerrain
 * exactly, so rendering (WorldView, biomeColor) needs no changes.
 *
 * @param {{ width: number, height: number, rng: () => number, sections: object[], totalArticleSize: number }} options
 * @returns {{ width: number, height: number, heightMap: Float64Array, moistureMap: Float64Array, biomeMap: Uint8Array }}
 */
export function generateSectionTerrain({ width, height, rng, sections, totalArticleSize }) {
  const centerX = width / 2
  const centerY = height / 2
  const maxRadius = Math.min(width, height) * PEAK_LAYOUT.topLevelMaxRadiusRatio

  const peaks = flattenPeaks(sections, { centerX, centerY, maxRadius })
  const sigmas = peaks.map((peak) => Math.max(peak.radius * PEAK_LAYOUT.peakSigmaRatio, 1))

  const heightNoise = createNoise2D(rng)
  const moistureNoise = createNoise2D(rng)
  const waterLevelShift = computeWaterLevelShift(totalArticleSize)

  const detailParams = {
    octaves: TERRAIN_DETAIL.noiseOctaves,
    persistence: TERRAIN_DETAIL.noisePersistence,
    scale: TERRAIN_DETAIL.noiseScale,
  }
  const moistureParams = { octaves: 2, persistence: 0.5, scale: TERRAIN_DETAIL.noiseScale * 1.5 }

  const cellCount = width * height
  const heightMap = new Float64Array(cellCount)
  const moistureMap = new Float64Array(cellCount)
  const biomeMap = new Uint8Array(cellCount)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x

      let structural = 0
      for (let i = 0; i < peaks.length; i++) {
        const peak = peaks[i]
        const dx = x - peak.x
        const dy = y - peak.y
        const sigma = sigmas[i]
        structural += peak.amplitude * Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma))
      }

      const detail = sampleFractalNoise(heightNoise, x, y, detailParams)
      const rawHeight = clamp01(structural + (detail - 0.5) * TERRAIN_DETAIL.noiseWeight)
      const finalHeight = clamp01(rawHeight + waterLevelShift)
      const moisture = sampleFractalNoise(moistureNoise, x, y, moistureParams)

      heightMap[index] = finalHeight
      moistureMap[index] = moisture
      biomeMap[index] = classifyBiome(finalHeight, moisture)
    }
  }

  return { width, height, heightMap, moistureMap, biomeMap }
}
