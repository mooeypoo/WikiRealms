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
 * Turns a world's portals into placements, in the terrain mesh's local
 * (pre-rotation) frame.
 *
 * Order matches `portals`, and every consumer depends on that: the pulse
 * phase is derived from the index, and a form builds one object per
 * placement in the same order so an object can be found again by its
 * position in the layer.
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
  return (portals ?? []).map((portal, index) => {
    // Submerged cells are lifted to sea level first, so a portal over
    // deep ocean floats above the water rather than drowning under it.
    const local = computePortalLocalPosition(portal, terrain, heightScale, PORTAL_MARKERS.hoverOffset, projection)
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
