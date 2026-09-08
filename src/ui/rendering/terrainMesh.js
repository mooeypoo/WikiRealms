import { biomeGroundRgb, biomeRgb, biomeSnowCover } from './biomeColor.js'
import { BIOME_THRESHOLDS } from '../../engine/generation/config.js'
import { flatProjection } from './projection.js'

/**
 * Computes per-vertex RGB colors (0..1 floats, matching three.js's
 * expected vertex color format) for a terrain grid, from the same
 * palette the 2D view uses — no duplicated color logic between the 2D
 * and 3D renderers.
 *
 * It used to call biomeColor() and unpick the `rgb(...)` string it
 * returned with a regex, once per vertex, 131,072 times per world, on
 * the main thread during load. biomeRgb is that function's arithmetic
 * without the round trip through text.
 *
 * @param {{ width: number, height: number, heightMap: Float64Array, biomeMap: Uint8Array }} terrain
 * @returns {Float32Array} length = width * height * 3
 */
export function computeVertexColors(terrain) {
  const { width, height, heightMap, biomeMap } = terrain
  const colors = new Float32Array(width * height * 3)

  for (let i = 0; i < width * height; i++) {
    const [r, g, b] = biomeRgb(biomeMap[i], heightMap[i])
    colors[i * 3] = r / 255
    colors[i * 3 + 1] = g / 255
    colors[i * 3 + 2] = b / 255
  }

  return colors
}

/**
 * The same colors with the snow left off, plus how much snow each vertex
 * carries, for a renderer that applies it in a shader instead.
 *
 * Two buffers rather than one, because they answer different questions.
 * `colors` is the ground, which a moving snowline does not change.
 * `snow` is the cover, which is the only thing a snowline moves — so it
 * can be reuploaded on its own, or left alone and reinterpreted against
 * a uniform, without touching the world's geometry.
 *
 * @param {{ width: number, height: number, heightMap: Float64Array, biomeMap: Uint8Array }} terrain
 * @returns {{ colors: Float32Array, snow: Float32Array }}
 */
export function computeGroundAttributes(terrain) {
  const { width, height, heightMap, biomeMap } = terrain
  const cells = width * height
  const colors = new Float32Array(cells * 3)
  const snow = new Float32Array(cells)

  for (let i = 0; i < cells; i++) {
    const [r, g, b] = biomeGroundRgb(biomeMap[i], heightMap[i])
    colors[i * 3] = r / 255
    colors[i * 3 + 1] = g / 255
    colors[i * 3 + 2] = b / 255
    snow[i] = biomeSnowCover(biomeMap[i], heightMap[i])
  }

  return { colors, snow }
}

/**
 * Computes a portal's position in the terrain mesh's local (pre-rotation)
 * coordinate space, floating just above the terrain surface at that cell.
 *
 * Submerged cells are lifted to sea level first so a portal over deep
 * ocean floats above the water rather than drowning under it.
 *
 * @param {{ gridX: number, gridY: number }} portal
 * @param {{ width: number, height: number, heightMap: Float64Array }} terrain
 * @param {number} heightScale
 * @param {number} [hoverOffset] how far above the surface the marker floats
 * @param {object} [projection] see projection.js; defaults to the flat map
 * @returns {{ x: number, y: number, z: number }}
 */
export function computePortalLocalPosition(portal, terrain, heightScale, hoverOffset = 6, projection = flatProjection) {
  const gridX = Math.round(clamp(portal.gridX, 0, terrain.width - 1))
  const gridY = Math.round(clamp(portal.gridY, 0, terrain.height - 1))
  const surfaceH01 = Math.max(terrain.heightMap[gridY * terrain.width + gridX] ?? 0, BIOME_THRESHOLDS.oceanMaxHeight)
  return { ...projection.toLocal(gridX, gridY, surfaceH01, terrain, heightScale, hoverOffset), gridX, gridY, surfaceH01 }
}

/**
 * Computes a peak's flag marker position in the terrain mesh's local
 * (pre-rotation) coordinate space, floating just above the actual sampled
 * terrain surface at that cell (not the peak's idealized/theoretical
 * height, since overlapping peaks and noise can shift the real surface).
 *
 * Returns the resolved grid cell and normalized surface height alongside
 * the position — marker geometry that has to orient itself to the surface
 * (section halos on a planet) needs those to ask the projection for a
 * normal and a marker circle.
 *
 * @param {{ x: number, y: number, title: string }} peak flattened peak (grid-space x/y, see sectionTerrain.js)
 * @param {{ width: number, height: number, heightMap: Float64Array }} terrain
 * @param {number} heightScale
 * @param {number} [hoverOffset]
 * @param {object} [projection] see projection.js; defaults to the flat map
 * @returns {{ x: number, y: number, z: number, title: string, gridX: number, gridY: number, surfaceH01: number }}
 */
export function computePeakFlagPosition(peak, terrain, heightScale, hoverOffset = 2, projection = flatProjection) {
  const gridX = Math.round(clamp(peak.x, 0, terrain.width - 1))
  const gridY = Math.round(clamp(peak.y, 0, terrain.height - 1))
  const surfaceH01 = terrain.heightMap[gridY * terrain.width + gridX] ?? 0
  return {
    ...projection.toLocal(gridX, gridY, surfaceH01, terrain, heightScale, hoverOffset),
    title: peak.title,
    gridX,
    gridY,
    surfaceH01,
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

