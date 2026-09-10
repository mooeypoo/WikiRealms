import { describe, expect, it } from 'vitest'
import {
  flatTerrainNormal,
  placePortals,
  portalGridDistance,
  portalPulsePhase,
  spreadPortalGridCells,
} from '../../../src/ui/rendering/portalPlacement.js'
import { PORTAL_MARKERS } from '../../../src/ui/rendering/portalMarkers.js'
import { flatProjection, sphereProjection, SPHERE_VIEW } from '../../../src/ui/rendering/projection.js'
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

  it('seats on the highest neighbour under its footprint, not a buried mid-slope cell', () => {
    // Halley's Comet → Renaissance: centre cell mid-face, uphill rim
    // several cells higher. Sampling only the centre put the fountain
    // under the mesh; neighbourhood max lifts it clear.
    const terrain = plateau({ width: 16, height: 16, h01: 0.2 })
    const cx = 8
    const cy = 8
    terrain.heightMap[cy * 16 + cx] = 0.4
    terrain.heightMap[(cy - 2) * 16 + (cx - 2)] = 0.7
    const [placement] = placePortals([portalAt(cx, cy)], terrain, 10, flatProjection)

    expect(placement.surfaceH01).toBeCloseTo(0.7, 5)
    expect(placement.z).toBeGreaterThan(0.4 * 10 + PORTAL_MARKERS.hoverOffset)
  })

  it('lifts along the slope normal so undoing hoverOffset cannot bury a fountain', () => {
    // Placement used to add hoverOffset on +Z then the fountain subtracted
    // it along a tilted normal, walking the prop into the hillside.
    const terrain = plateau({ width: 8, height: 8, h01: 0.2 })
    for (let x = 0; x < 8; x += 1) {
      terrain.heightMap[4 * 8 + x] = 0.1 + x * 0.1
    }
    const [placement] = placePortals([portalAt(4, 4)], terrain, 10, flatProjection)
    const surface = placement.surfaceH01 * 10
    const expectedX = 4 - 8 / 2
    const expectedY = 8 / 2 - 4

    expect(placement.x).toBeCloseTo(expectedX + placement.normal.x * PORTAL_MARKERS.hoverOffset, 5)
    expect(placement.y).toBeCloseTo(expectedY + placement.normal.y * PORTAL_MARKERS.hoverOffset, 5)
    expect(placement.z).toBeCloseTo(surface + placement.normal.z * PORTAL_MARKERS.hoverOffset, 5)
    expect(
      Math.hypot(placement.x - expectedX, placement.y - expectedY, placement.z - surface),
    ).toBeCloseTo(PORTAL_MARKERS.hoverOffset, 5)
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
    // On a plateau the heightfield normal is +Z, matching the old flat
    // projection constant — and that is what ground props stand along.
    const [placement] = placePortals([portalAt(4, 4)], plateau(), 10, flatProjection)

    expect(placement.normal.x).toBeCloseTo(0, 5)
    expect(placement.normal.y).toBeCloseTo(0, 5)
    expect(placement.normal.z).toBeCloseTo(1, 5)
  })

  it('tilts flat portals to follow a heightfield slope', () => {
    const terrain = plateau({ width: 8, height: 8, h01: 0.2 })
    // Rising ridge along +gridX around the portal cell.
    for (let x = 0; x < 8; x += 1) {
      terrain.heightMap[4 * 8 + x] = 0.1 + x * 0.1
    }
    const [placement] = placePortals([portalAt(4, 4)], terrain, 10, flatProjection)
    const expected = flatTerrainNormal(4, 4, terrain, 10)

    expect(placement.normal.x).toBeCloseTo(expected.x, 5)
    expect(placement.normal.y).toBeCloseTo(expected.y, 5)
    expect(placement.normal.z).toBeCloseTo(expected.z, 5)
    expect(placement.normal.x).toBeLessThan(0)
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

  it('pushes overlapping flat portals apart so a crowded section stays pickable', () => {
    // Sunflower can still land neighbours closer than a fountain's pick
    // radius; flat mode now spreads too (not only the planet).
    const portals = [portalAt(4, 4), portalAt(4, 5), portalAt(5, 4)]
    const placements = placePortals(portals, plateau({ width: 32, height: 32 }), 10, flatProjection)
    const dist = portalGridDistance(
      placements[0].gridX,
      placements[0].gridY,
      placements[1].gridX,
      placements[1].gridY,
      32,
    )

    expect(dist).toBeGreaterThanOrEqual(PORTAL_MARKERS.minSeparationCells - 0.5)
  })

  it('pushes overlapping planet portals far enough apart to pick separately', () => {
    // The Everest case: two section links land a cell or two apart and
    // become one marker under the cursor. The globe nudges them in grid
    // space before projecting.
    const terrain = plateau({ width: 64, height: 64 })
    const heightScale = sphereProjection.heightScale(terrain)
    const portals = [portalAt(20, 30, { targetTitle: 'Khumbu glacier' }), portalAt(21, 30, { targetTitle: 'Ice cap climate' })]
    const placements = placePortals(portals, terrain, heightScale, sphereProjection)
    const dist = portalGridDistance(
      placements[0].gridX,
      placements[0].gridY,
      placements[1].gridX,
      placements[1].gridY,
      terrain.width,
    )

    expect(dist).toBeGreaterThanOrEqual(SPHERE_VIEW.portalMinSeparationCells - 0.5)
  })

  it('does not drag distant planet portals toward each other', () => {
    const terrain = plateau({ width: 64, height: 64 })
    const heightScale = sphereProjection.heightScale(terrain)
    const portals = [portalAt(8, 10), portalAt(50, 40)]
    const placements = placePortals(portals, terrain, heightScale, sphereProjection)

    expect(placements[0].gridX).toBe(8)
    expect(placements[0].gridY).toBe(10)
    expect(placements[1].gridX).toBe(50)
    expect(placements[1].gridY).toBe(40)
  })
})

describe('spreadPortalGridCells', () => {
  it('wraps longitude when two portals meet across the date line', () => {
    const terrain = { width: 32, height: 32 }
    const [a, b] = spreadPortalGridCells(
      [{ gridX: 0, gridY: 16 }, { gridX: 31, gridY: 16 }],
      terrain,
      { minSeparation: 8, iterations: 16 },
    )
    const dist = portalGridDistance(a.gridX, a.gridY, b.gridX, b.gridY, terrain.width)

    expect(dist).toBeGreaterThanOrEqual(7.5)
  })

  it('separates coincident cells instead of stalling', () => {
    const terrain = { width: 32, height: 32 }
    const [a, b] = spreadPortalGridCells(
      [{ gridX: 10, gridY: 10 }, { gridX: 10, gridY: 10 }],
      terrain,
      { minSeparation: 8, iterations: 16 },
    )

    expect(portalGridDistance(a.gridX, a.gridY, b.gridX, b.gridY, terrain.width)).toBeGreaterThanOrEqual(7.5)
  })
})
