import { biomeColor } from './biomeColor.js'
import { BIOME_THRESHOLDS } from '../../engine/generation/config.js'

/**
 * Computes per-vertex RGB colors (0..1 floats, matching three.js's
 * expected vertex color format) for a terrain grid, reusing the exact
 * same biomeColor() function the 2D view uses — no duplicated color
 * logic between the 2D and 3D renderers.
 *
 * @param {{ width: number, height: number, heightMap: Float64Array, biomeMap: Uint8Array }} terrain
 * @returns {Float32Array} length = width * height * 3
 */
export function computeVertexColors(terrain) {
  const { width, height, heightMap, biomeMap } = terrain
  const colors = new Float32Array(width * height * 3)

  for (let i = 0; i < width * height; i++) {
    const [r, g, b] = parseRgbColor(biomeColor(biomeMap[i], heightMap[i]))
    colors[i * 3] = r / 255
    colors[i * 3 + 1] = g / 255
    colors[i * 3 + 2] = b / 255
  }

  return colors
}

/**
 * Parses a `rgb(r, g, b)` CSS color string into a [r, g, b] tuple (0..255).
 * @param {string} rgbString
 * @returns {[number, number, number]}
 */
export function parseRgbColor(rgbString) {
  const match = rgbString.match(/(\d+(?:\.\d+)?)/g)
  if (!match || match.length < 3) return [0, 0, 0]
  return [Number(match[0]), Number(match[1]), Number(match[2])]
}

/**
 * A reasonable vertical exaggeration for the height field, proportional
 * to the grid size so peaks stay visually readable regardless of GRID
 * config changes.
 * @param {number} width
 * @param {number} height
 */
export function computeHeightScale(width, height) {
  return Math.min(width, height) * 0.18
}

/**
 * Computes a portal's position in the terrain mesh's local (pre-rotation)
 * coordinate space: centered on the grid, floating just above the
 * terrain surface at that cell.
 *
 * @param {{ gridX: number, gridY: number }} portal
 * @param {{ width: number, height: number, heightMap: Float64Array }} terrain
 * @param {number} heightScale
 * @param {number} [hoverOffset] how far above the surface the marker floats
 * @returns {{ x: number, y: number, z: number }}
 */
export function computePortalLocalPosition(portal, terrain, heightScale, hoverOffset = 1.5) {
  return computeLocalPosition(portal.gridX, portal.gridY, terrain, heightScale, hoverOffset)
}

/**
 * Computes a peak's flag marker position in the terrain mesh's local
 * (pre-rotation) coordinate space, floating just above the actual sampled
 * terrain surface at that cell (not the peak's idealized/theoretical
 * height, since overlapping peaks and noise can shift the real surface).
 *
 * @param {{ x: number, y: number, title: string }} peak flattened peak (grid-space x/y, see sectionTerrain.js)
 * @param {{ width: number, height: number, heightMap: Float64Array }} terrain
 * @param {number} heightScale
 * @param {number} [hoverOffset]
 * @returns {{ x: number, y: number, z: number, title: string }}
 */
export function computePeakFlagPosition(peak, terrain, heightScale, hoverOffset = 2) {
  const gridX = Math.round(clamp(peak.x, 0, terrain.width - 1))
  const gridY = Math.round(clamp(peak.y, 0, terrain.height - 1))
  return { ...computeLocalPosition(gridX, gridY, terrain, heightScale, hoverOffset), title: peak.title }
}

/**
 * The world's sea-level height, in the same units as the terrain mesh's
 * vertex Z displacement — used to place a translucent water plane so
 * submerged terrain remains visible beneath it. Kept in sync with
 * classifyBiome's own ocean threshold (single source of truth).
 * @param {number} heightScale
 */
export function computeWaterSurfaceHeight(heightScale) {
  return BIOME_THRESHOLDS.oceanMaxHeight * heightScale
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function computeLocalPosition(gridX, gridY, terrain, heightScale, hoverOffset) {
  const { width, height, heightMap } = terrain
  const index = gridY * width + gridX
  const surfaceHeight = (heightMap[index] ?? 0) * heightScale

  return {
    x: gridX - width / 2,
    y: gridY - height / 2,
    z: surfaceHeight + hoverOffset,
  }
}
