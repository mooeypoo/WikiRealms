import { biomeSnowCover, groundRgbAt } from './biomeColor.js'
import { BIOME_THRESHOLDS } from '../../engine/generation/config.js'
import { PORTAL_MARKERS } from './portalMarkers.js'
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
 * @param {{ width: number, height: number, heightMap: Float64Array,
 *   biomeMap: Uint8Array, lushnessMap?: Float32Array }} terrain
 * @returns {{ colors: Float32Array, snowHeights: Float32Array }}
 */
export function computeGroundAttributes(terrain) {
  const { width, height, heightMap, biomeMap, lushnessMap } = terrain
  const cells = width * height
  const colors = new Float32Array(cells * 3)
  const snowHeights = new Float32Array(cells)

  for (let i = 0; i < cells; i++) {
    // groundRgbAt rather than biomeGroundRgb, because these colours are
    // interpolated: the GPU blends between vertices across every
    // triangle, and a colour that steps at a threshold makes the mesh's
    // own triangulation visible along the coast. See SHORE.
    //
    // Deliberately unclamped there, since biomeRgb clamps once at the
    // end. Height shading multiplies by up to 1.3, so a pale band could
    // exceed 255 and reach the GPU brighter than white — the clamp
    // belongs at the upload, which is here.
    const [r, g, b] = groundRgbAt(biomeMap[i], lushnessMap?.[i] ?? 0, heightMap[i])
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
 * Terrain height a portal should sit on: the highest cell under its
 * footprint, floored at sea level.
 *
 * Sampling only the centre cell seats a wide prop on a mid-slope face
 * while uphill neighbours rise through the basin. The radius matches
 * PORTAL_MARKERS.surfaceSampleRadiusCells (~fountain footprint).
 *
 * @param {{ width: number, height: number, heightMap: Float64Array }} terrain
 * @param {number} gridX
 * @param {number} gridY
 * @param {{ radiusCells?: number, wrapLongitude?: boolean }} [options]
 */
export function samplePortalSurfaceH01(terrain, gridX, gridY, options = {}) {
  const { width, height, heightMap } = terrain
  const radius = options.radiusCells ?? PORTAL_MARKERS.surfaceSampleRadiusCells
  const wrapLongitude = Boolean(options.wrapLongitude)
  const cx = Math.round(clamp(gridX, 0, width - 1))
  const cy = Math.round(clamp(gridY, 0, height - 1))
  const r = Math.max(0, Math.ceil(radius))
  let maxH01 = BIOME_THRESHOLDS.oceanMaxHeight

  for (let dy = -r; dy <= r; dy += 1) {
    for (let dx = -r; dx <= r; dx += 1) {
      if (dx * dx + dy * dy > r * r) continue
      let x = cx + dx
      let y = cy + dy
      if (wrapLongitude) x = ((x % width) + width) % width
      else if (x < 0 || x >= width) continue
      if (y < 0 || y >= height) continue
      maxH01 = Math.max(maxH01, heightMap[y * width + x] ?? 0)
    }
  }

  return maxH01
}

/**
 * Computes a portal's position in the terrain mesh's local (pre-rotation)
 * coordinate space, floating just above the terrain surface at that cell.
 *
 * Submerged cells are lifted to sea level first so a portal over deep
 * ocean floats above the water rather than drowning under it. Height is
 * the neighbourhood max under the portal footprint — see
 * samplePortalSurfaceH01 — so a steep face cannot bury a wide prop.
 *
 * The hover offset is applied along the projection's "up" (flat +Z,
 * sphere radial). placePortals re-applies it along the slope normal so
 * ground forms and the placement share one axis.
 *
 * @param {{ gridX: number, gridY: number }} portal
 * @param {{ width: number, height: number, heightMap: Float64Array }} terrain
 * @param {number} heightScale
 * @param {number} [hoverOffset] how far above the surface the marker floats
 * @param {object} [projection] see projection.js; defaults to the flat map
 * @returns {{ x: number, y: number, z: number, gridX: number, gridY: number, surfaceH01: number }}
 */
export function computePortalLocalPosition(portal, terrain, heightScale, hoverOffset = 6, projection = flatProjection) {
  const gridX = Math.round(clamp(portal.gridX, 0, terrain.width - 1))
  const gridY = Math.round(clamp(portal.gridY, 0, terrain.height - 1))
  const surfaceH01 = samplePortalSurfaceH01(terrain, gridX, gridY, {
    wrapLongitude: Boolean(projection.isSpherical),
  })
  const surface = projection.toLocal(gridX, gridY, surfaceH01, terrain, heightScale, 0)

  if (!hoverOffset) {
    return { ...surface, gridX, gridY, surfaceH01 }
  }

  if (projection.isSpherical) {
    const normal = projection.normalAt(gridX, gridY, terrain)
    return {
      x: surface.x + normal.x * hoverOffset,
      y: surface.y + normal.y * hoverOffset,
      z: surface.z + normal.z * hoverOffset,
      gridX,
      gridY,
      surfaceH01,
    }
  }

  return { x: surface.x, y: surface.y, z: surface.z + hoverOffset, gridX, gridY, surfaceH01 }
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

