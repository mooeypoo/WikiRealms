import { biomeGroundRgb, biomeSnowCover } from './biomeColor.js'
import { BIOME_THRESHOLDS } from '../../engine/generation/config.js'
import { flatProjection } from './projection.js'

/**
 * A vertex whose height is this is never snowed on, whatever the
 * snowline does. Any negative value is below every threshold, and being
 * a named constant it reads as a decision at both ends.
 */
export const NEVER_SNOWED = -1

/**
 * The same colors with the snow left off, plus the height each vertex
 * should be snowed at, for a renderer that applies snow in a shader.
 *
 * Two buffers, because they answer questions that change on different
 * occasions. `colors` is the ground, fixed for the world's lifetime.
 * `snowHeights` is what a snowline is compared AGAINST — so moving one
 * is a uniform written to a shader, with nothing here recomputed and no
 * geometry touched.
 *
 * The height rather than the resulting cover, deliberately. Cover would
 * have to be recomputed and reuploaded every time the line moved, which
 * is the cost this exists to remove. What stays here is the part that is
 * policy rather than interpolation: WHICH vertices are eligible at all.
 * Water is not, at any altitude — see biomeSnowCover — and it says so by
 * carrying NEVER_SNOWED instead of its real height.
 *
 * @param {{ width: number, height: number, heightMap: Float64Array, biomeMap: Uint8Array }} terrain
 * @returns {{ colors: Float32Array, snowHeights: Float32Array }}
 */
export function computeGroundAttributes(terrain) {
  const { width, height, heightMap, biomeMap } = terrain
  const cells = width * height
  const colors = new Float32Array(cells * 3)
  const snowHeights = new Float32Array(cells)

  for (let i = 0; i < cells; i++) {
    // biomeGroundRgb is deliberately unclamped, since biomeRgb clamps
    // once at the end. Height shading multiplies by up to 1.3, so a pale
    // band could exceed 255 and reach the GPU brighter than white — the
    // clamp belongs at the upload, which is here.
    const [r, g, b] = biomeGroundRgb(biomeMap[i], heightMap[i])
    colors[i * 3] = clamp(r / 255, 0, 1)
    colors[i * 3 + 1] = clamp(g / 255, 0, 1)
    colors[i * 3 + 2] = clamp(b / 255, 0, 1)
    // biomeSnowCover is the authority on eligibility. Reading it at the
    // cell's own height would answer "how much snow", which is not the
    // question — a cell below the line today may be above it later. A
    // cell that can never be covered is the one that opts out.
    snowHeights[i] = biomeSnowCover(biomeMap[i], 1) > 0 ? heightMap[i] : NEVER_SNOWED
  }

  return { colors, snowHeights }
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

