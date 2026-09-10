/**
 * WHERE a portal stands, separated from what it looks like.
 *
 * Same split as foliageScatter.js, for the same reason and with a second
 * one on top. A portal is currently a camera-facing sprite — an aperture
 * glyph inside an accent-tinted aura — and it does not have to stay one.
 * A stone arch standing on the ground is a different object entirely: it
 * has a footprint, an orientation, a lit surface and a silhouette, and a
 * sprite has none of those.
 *
 * So this module answers only the questions that are true of a portal
 * whatever shape it takes: which cell it sits on, where that is in the
 * mesh's local frame, which way is up there, how big it is at rest, and
 * where in the idle pulse it starts. portalForms.js turns one of these
 * into something drawable.
 *
 * `normal` is the field that exists for the shape that has not been
 * built yet. The sprite ignores it — a billboard has no orientation to
 * set — but anything with geometry has to stand up out of the ground it
 * is on, which on the flat map follows the heightfield slope and on the
 * planet is the surface radial. That is the same problem the canopy
 * already solved, and emitting the normal here means a future form
 * inherits the solution rather than rediscovering it.
 *
 * Free of three.js, so the arithmetic is unit-testable without a context.
 */
import { BIOME_THRESHOLDS } from '../../engine/generation/config.js'
import { SPHERE_VIEW } from './projection.js'
import { PORTAL_MARKERS } from './portalMarkers.js'
import { computePortalLocalPosition } from './terrainMesh.js'

/**
 * Where in its idle breathing a portal starts, so a cluster shimmers
 * instead of beating in unison.
 *
 * Keyed on the portal's index rather than on anything about the article,
 * which is deliberate: the offsets only have to be spread, not
 * meaningful, and an index is stable for a given world.
 *
 * @param {number} index position in world.portals
 */
export function portalPulsePhase(index) {
  return index * PORTAL_MARKERS.pulsePhaseStep
}

/**
 * Shortest signed step in X on a cylindrical grid (planet longitude wraps).
 *
 * @param {number} from
 * @param {number} to
 * @param {number} width
 */
function wrappedDeltaX(from, to, width) {
  let dx = to - from
  if (dx > width / 2) dx -= width
  if (dx < -width / 2) dx += width
  return dx
}

function wrapX(x, width) {
  return ((x % width) + width) % width
}

function clampY(y, height) {
  return Math.min(height - 1, Math.max(0, y))
}

/**
 * Terrain height floored at sea level — same surface portals stand on.
 *
 * @param {{ width: number, height: number, heightMap: Float64Array }} terrain
 * @param {number} gridX
 * @param {number} gridY
 */
function sampleSurfaceH01(terrain, gridX, gridY) {
  const { width, height, heightMap } = terrain
  const x = ((Math.round(gridX) % width) + width) % width
  const y = Math.min(Math.max(Math.round(gridY), 0), height - 1)
  return Math.max(heightMap[y * width + x] ?? 0, BIOME_THRESHOLDS.oceanMaxHeight)
}

/**
 * Flat-map surface normal from the heightfield, so ground props follow
 * the slope instead of always standing in world +Z.
 *
 * World +y is −gridY (see flatProjection.toLocal), so the finite
 * difference along +world-y samples the previous grid row.
 *
 * @param {number} gridX
 * @param {number} gridY
 * @param {{ width: number, height: number, heightMap: Float64Array }} terrain
 * @param {number} heightScale
 * @returns {{ x: number, y: number, z: number }}
 */
export function flatTerrainNormal(gridX, gridY, terrain, heightScale) {
  const hx =
    (sampleSurfaceH01(terrain, gridX + 1, gridY) - sampleSurfaceH01(terrain, gridX - 1, gridY)) *
    heightScale *
    0.5
  const hy =
    (sampleSurfaceH01(terrain, gridX, gridY - 1) - sampleSurfaceH01(terrain, gridX, gridY + 1)) *
    heightScale *
    0.5
  const len = Math.hypot(hx, hy, 1) || 1
  return { x: -hx / len, y: -hy / len, z: 1 / len }
}

/**
 * Up-direction a geometry portal should stand along.
 *
 * @param {number} gridX
 * @param {number} gridY
 * @param {{ width: number, height: number, heightMap: Float64Array }} terrain
 * @param {number} heightScale
 * @param {object} projection
 */
export function portalSurfaceNormal(gridX, gridY, terrain, heightScale, projection) {
  if (projection.isSpherical) return projection.normalAt(gridX, gridY, terrain)
  return flatTerrainNormal(gridX, gridY, terrain, heightScale)
}

/**
 * Grid distance between two cells, wrapping longitude.
 *
 * @param {number} ax
 * @param {number} ay
 * @param {number} bx
 * @param {number} by
 * @param {number} width
 */
export function portalGridDistance(ax, ay, bx, by, width) {
  return Math.hypot(wrappedDeltaX(ax, bx, width), by - ay)
}

/**
 * Push portal cells apart until each pair clears `minSeparation` cells.
 *
 * Used on both flat and planet views so a link-heavy section stays
 * pickable after sunflower placement. Longitude wraps on the planet
 * only; flat maps clamp both axes. Coincident cells get a deterministic
 * shove so the loop does not stall on a zero-length vector.
 *
 * @param {Array<{ gridX: number, gridY: number }>} portals
 * @param {{ width: number, height: number }} terrain
 * @param {{ minSeparation?: number, iterations?: number, wrapLongitude?: boolean }} [options]
 * @returns {Array<{ gridX: number, gridY: number }>}
 */
export function spreadPortalGridCells(portals, terrain, options = {}) {
  const { width, height } = terrain
  const minSeparation = options.minSeparation ?? PORTAL_MARKERS.minSeparationCells
  const iterations = options.iterations ?? SPHERE_VIEW.portalSpreadIterations
  const wrapLongitude = options.wrapLongitude ?? true
  const fitX = (x) => (wrapLongitude ? wrapX(x, width) : Math.min(width - 1, Math.max(0, x)))
  const cells = portals.map((portal) => ({
    gridX: fitX(portal.gridX),
    gridY: clampY(portal.gridY, height),
  }))

  if (cells.length < 2 || minSeparation <= 0) {
    return cells.map((cell) => ({
      gridX: Math.round(fitX(cell.gridX)),
      gridY: Math.round(clampY(cell.gridY, height)),
    }))
  }

  for (let iter = 0; iter < iterations; iter += 1) {
    for (let i = 0; i < cells.length; i += 1) {
      for (let j = i + 1; j < cells.length; j += 1) {
        const a = cells[i]
        const b = cells[j]
        let dx = wrapLongitude
          ? wrappedDeltaX(a.gridX, b.gridX, width)
          : b.gridX - a.gridX
        let dy = b.gridY - a.gridY
        let dist = Math.hypot(dx, dy)

        if (dist < 1e-6) {
          const angle = (i + 1) * 2.399963 + j
          dx = Math.cos(angle)
          dy = Math.sin(angle)
          dist = 1
        }

        if (dist >= minSeparation) continue

        const push = (minSeparation - dist) / 2
        const ux = dx / dist
        const uy = dy / dist
        a.gridX = fitX(a.gridX - ux * push)
        a.gridY = clampY(a.gridY - uy * push, height)
        b.gridX = fitX(b.gridX + ux * push)
        b.gridY = clampY(b.gridY + uy * push, height)
      }
    }
  }

  return cells.map((cell) => ({
    gridX: Math.round(fitX(cell.gridX)),
    gridY: Math.round(clampY(cell.gridY, height)),
  }))
}

/**
 * Turns a world's portals into placements, in the terrain mesh's local
 * (pre-rotation) frame.
 *
 * Order matches `portals`, and every consumer depends on that: the pulse
 * phase is derived from the index, and a form builds one object per
 * placement in the same order so an object can be found again by its
 * position in the layer.
 *
 * Nearby portals are nudged apart in grid space first so their pick
 * volumes do not swallow each other — on both flat and planet views.
 *
 * @param {Array<object>} portals world.portals
 * @param {{ width: number, height: number, heightMap: Float64Array }} terrain
 * @param {number} heightScale
 * @param {object} projection see projection.js
 * @returns {Array<{ portal: object, x: number, y: number, z: number,
 *   gridX: number, gridY: number, surfaceH01: number,
 *   normal: { x: number, y: number, z: number }, baseScale: number,
 *   pulsePhase: number, destinationTitle: string }>}
 */
export function placePortals(portals, terrain, heightScale, projection) {
  const list = portals ?? []
  const minSeparation = projection.isSpherical
    ? SPHERE_VIEW.portalMinSeparationCells
    : PORTAL_MARKERS.minSeparationCells
  const cells = spreadPortalGridCells(list, terrain, {
    minSeparation,
    wrapLongitude: Boolean(projection.isSpherical),
  })

  return list.map((portal, index) => {
    const cell = cells[index]
    // Seat on the neighbourhood-max surface (offset 0), then lift along
    // the same normal the form will stand on. Lifting along flat +Z and
    // then undoing along a tilted slope normal was burying fountains on
    // steep mid-slopes (Halley's Comet → Renaissance).
    const local = computePortalLocalPosition(
      { ...portal, gridX: cell.gridX, gridY: cell.gridY },
      terrain,
      heightScale,
      0,
      projection,
    )
    const normal = portalSurfaceNormal(local.gridX, local.gridY, terrain, heightScale, projection)
    const lift = PORTAL_MARKERS.hoverOffset

    return {
      portal,
      x: local.x + normal.x * lift,
      y: local.y + normal.y * lift,
      z: local.z + normal.z * lift,
      gridX: local.gridX,
      gridY: local.gridY,
      surfaceH01: local.surfaceH01,
      normal: { x: normal.x, y: normal.y, z: normal.z },
      baseScale: PORTAL_MARKERS.baseScale,
      pulsePhase: portalPulsePhase(index),
      // Falls back to the id because a portal with no resolved title is
      // still somewhere you can go, and the hover card has to name it.
      destinationTitle: portal.targetTitle ?? portal.targetArticleId,
    }
  })
}
