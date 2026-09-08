import { describe, expect, it } from 'vitest'
import { placePortals, portalPulsePhase } from '../../../src/ui/rendering/portalPlacement.js'
import { PORTAL_MARKERS } from '../../../src/ui/rendering/portalMarkers.js'
import { flatProjection, sphereProjection } from '../../../src/ui/rendering/projection.js'
import { BIOME_THRESHOLDS } from '../../../src/engine/generation/config.js'

function terrainOf(heights, width, height) {
  return { width, height, heightMap: Float64Array.from(heights) }
}

/** A flat land plateau, so a placement's height is predictable. */
function plateau({ width = 8, height = 8, h01 = 0.5 } = {}) {
  return terrainOf(new Array(width * height).fill(h01), width, height)
}

const portalAt = (gridX, gridY, extra = {}) => ({
  portalId: `p-${gridX}-${gridY}`,
  gridX,
  gridY,
  targetTitle: 'Saturn',
  targetArticleId: 'Saturn',
  sectionIndex: 0,
  ...extra,
})

describe('portalPulsePhase', () => {
  it('spreads portals through the pulse so a cluster does not beat in unison', () => {
    expect(portalPulsePhase(0)).toBe(0)
    expect(portalPulsePhase(1)).toBe(PORTAL_MARKERS.pulsePhaseStep)
    expect(portalPulsePhase(3)).toBeCloseTo(PORTAL_MARKERS.pulsePhaseStep * 3, 10)
  })

  it('does not step by a divisor of a full cycle', () => {
    // A step that divides 2π puts portals back in step with each other at
    // regular intervals along the list, which is the artefact the offset
    // exists to remove.
    const cycles = (2 * Math.PI) / PORTAL_MARKERS.pulsePhaseStep
    expect(Math.abs(cycles - Math.round(cycles))).toBeGreaterThan(0.01)
  })
})

describe('placePortals', () => {
  it('returns nothing for a world with no portals', () => {
    expect(placePortals([], plateau(), 10, flatProjection)).toEqual([])
    expect(placePortals(undefined, plateau(), 10, flatProjection)).toEqual([])
  })

  it('keeps world.portals order, which the pulse phase depends on', () => {
    const portals = [portalAt(2, 2), portalAt(3, 3), portalAt(4, 4)]
    const placements = placePortals(portals, plateau(), 10, flatProjection)

    expect(placements.map((p) => p.portal.portalId)).toEqual(portals.map((p) => p.portalId))
    expect(placements.map((p) => p.pulsePhase)).toEqual([0, 1, 2].map(portalPulsePhase))
  })

  it('floats each portal above the surface it stands on', () => {
    const [placement] = placePortals([portalAt(4, 4)], plateau({ h01: 0.5 }), 10, flatProjection)

    expect(placement.z).toBeCloseTo(0.5 * 10 + PORTAL_MARKERS.hoverOffset, 5)
  })

  it('floats a portal over deep ocean above the water, not under it', () => {
    // Submerged cells are lifted to sea level first, or the marker drowns.
    const drowned = plateau({ h01: 0 })
    const [placement] = placePortals([portalAt(4, 4)], drowned, 10, flatProjection)

    expect(placement.z).toBeCloseTo(BIOME_THRESHOLDS.oceanMaxHeight * 10 + PORTAL_MARKERS.hoverOffset, 5)
  })

  it('clamps a portal outside the grid onto it', () => {
    const [placement] = placePortals([portalAt(-5, 999)], plateau({ width: 8, height: 8 }), 10, flatProjection)

    expect(placement.gridX).toBe(0)
    expect(placement.gridY).toBe(7)
  })

  it('names the destination, falling back to the id', () => {
    const placements = placePortals(
      [portalAt(2, 2), portalAt(3, 3, { targetTitle: undefined, targetArticleId: 'Cassini_Division' })],
      plateau(),
      10,
      flatProjection,
    )

    expect(placements[0].destinationTitle).toBe('Saturn')
    expect(placements[1].destinationTitle).toBe('Cassini_Division')
  })

  it('carries the surface normal a geometry form would need', () => {
    // The sprite ignores it. Anything with geometry has to stand up out
    // of the ground it is on, and on the flat map that is +Z everywhere.
    const [placement] = placePortals([portalAt(4, 4)], plateau(), 10, flatProjection)

    expect(placement.normal).toEqual({ x: 0, y: 0, z: 1 })
  })

  it('gives each portal on a planet its own upward direction', () => {
    const terrain = plateau({ width: 16, height: 16 })
    const heightScale = sphereProjection.heightScale(terrain)
    const placements = placePortals([portalAt(2, 8), portalAt(10, 8)], terrain, heightScale, sphereProjection)

    for (const placement of placements) {
      const { x, y, z } = placement.normal
      expect(Math.hypot(x, y, z)).toBeCloseTo(1, 5)
    }
    expect(placements[0].normal).not.toEqual(placements[1].normal)
  })

  it('places every portal at the same rest size', () => {
    const placements = placePortals([portalAt(2, 2), portalAt(5, 5)], plateau(), 10, flatProjection)

    for (const placement of placements) {
      expect(placement.baseScale).toBe(PORTAL_MARKERS.baseScale)
    }
  })
})
