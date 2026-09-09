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
 * is on, which on the flat map is +Z everywhere and on the planet is the
 * surface radial. That is the same problem the canopy already solved, and
 * emitting the normal here means a future form inherits the solution
 * rather than rediscovering it.
 *
 * Free of three.js, so the arithmetic is unit-testable without a context.
 */
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
 * Used only for the planet view: the same authored cells can sit closer
 * than a marker's pick radius, and on the globe that turns two links into
 * one target. Flat mode leaves the sunflower layout alone.
 *
 * Longitude wraps; latitude clamps. Coincident cells get a deterministic
 * shove so the loop does not stall on a zero-length vector.
 *
 * @param {Array<{ gridX: number, gridY: number }>} portals
 * @param {{ width: number, height: number }} terrain
 * @param {{ minSeparation?: number, iterations?: number }} [options]
 * @returns {Array<{ gridX: number, gridY: number }>}
 */
export function spreadPortalGridCells(portals, terrain, options = {}) {
  const { width, height } = terrain
  const minSeparation = options.minSeparation ?? SPHERE_VIEW.portalMinSeparationCells
  const iterations = options.iterations ?? SPHERE_VIEW.portalSpreadIterations
  const cells = portals.map((portal) => ({
    gridX: wrapX(portal.gridX, width),
    gridY: clampY(portal.gridY, height),
  }))

  if (cells.length < 2 || minSeparation <= 0) return cells

  for (let iter = 0; iter < iterations; iter += 1) {
    for (let i = 0; i < cells.length; i += 1) {
      for (let j = i + 1; j < cells.length; j += 1) {
        const a = cells[i]
        const b = cells[j]
        let dx = wrappedDeltaX(a.gridX, b.gridX, width)
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
        a.gridX = wrapX(a.gridX - ux * push, width)
        a.gridY = clampY(a.gridY - uy * push, height)
        b.gridX = wrapX(b.gridX + ux * push, width)
        b.gridY = clampY(b.gridY + uy * push, height)
      }
    }
  }

  return cells.map((cell) => ({
    gridX: Math.round(wrapX(cell.gridX, width)),
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
 * On the planet, nearby portals are nudged apart in grid space first so
 * their pick volumes do not swallow each other. Flat mode uses the
 * authored cells as-is.
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
  const cells = projection.isSpherical
    ? spreadPortalGridCells(list, terrain)
    : list.map((portal) => ({ gridX: portal.gridX, gridY: portal.gridY }))

  return list.map((portal, index) => {
    const cell = cells[index]
    // Submerged cells are lifted to sea level first, so a portal over
    // deep ocean floats above the water rather than drowning under it.
    const local = computePortalLocalPosition(
      { ...portal, gridX: cell.gridX, gridY: cell.gridY },
      terrain,
      heightScale,
      PORTAL_MARKERS.hoverOffset,
      projection,
    )
    const normal = projection.normalAt(local.gridX, local.gridY, terrain)

    return {
      portal,
      x: local.x,
      y: local.y,
      z: local.z,
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
