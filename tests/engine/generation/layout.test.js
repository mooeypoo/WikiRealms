import { describe, expect, it } from 'vitest'
import { computeRidgeLayout, computeSpiralLayout, relaxPlacements } from '../../../src/engine/generation/layout.js'

const bounds = { centerX: 64, centerY: 64, maxRadius: 50 }

describe('computeSpiralLayout', () => {
  it('returns an empty array for a zero count', () => {
    expect(computeSpiralLayout(0, bounds)).toEqual([])
  })

  it('places a single item exactly at the center', () => {
    const [first] = computeSpiralLayout(1, bounds)

    expect(first).toEqual({ x: 64, y: 64 })
  })

  it('places the first (largest) item at the center even with multiple items', () => {
    const [first] = computeSpiralLayout(5, bounds)

    expect(first.x).toBeCloseTo(64)
    expect(first.y).toBeCloseTo(64)
  })

  // Grid rows are latitude in the planet view, so the spiral is squashed
  // vertically to keep sections out of the polar caps — see layout.js.
  describe('yScale', () => {
    it('defaults to a circular spiral', () => {
      const positions = computeSpiralLayout(12, bounds)
      const squashed = computeSpiralLayout(12, { ...bounds, yScale: 1 })

      expect(positions).toEqual(squashed)
    })

    it('compresses the vertical spread without touching the horizontal', () => {
      const circular = computeSpiralLayout(12, bounds)
      const squashed = computeSpiralLayout(12, { ...bounds, yScale: 0.5 })

      for (let i = 0; i < circular.length; i++) {
        expect(squashed[i].x).toBeCloseTo(circular[i].x)
        expect(squashed[i].y - bounds.centerY).toBeCloseTo((circular[i].y - bounds.centerY) * 0.5)
      }
    })

    it('keeps the vertical spread strictly inside the unsquashed one', () => {
      const spread = (positions) => Math.max(...positions.map((p) => Math.abs(p.y - bounds.centerY)))

      expect(spread(computeSpiralLayout(20, { ...bounds, yScale: 0.55 }))).toBeLessThan(
        spread(computeSpiralLayout(20, bounds)),
      )
    })
  })

  it('returns one position per requested count', () => {
    expect(computeSpiralLayout(7, bounds)).toHaveLength(7)
  })

  it('keeps every position within maxRadius of the center', () => {
    const positions = computeSpiralLayout(20, bounds)

    for (const { x, y } of positions) {
      const distance = Math.hypot(x - bounds.centerX, y - bounds.centerY)
      expect(distance).toBeLessThanOrEqual(bounds.maxRadius + 1e-9)
    }
  })

  it('generally increases distance from center as index increases', () => {
    const positions = computeSpiralLayout(10, bounds)
    const distances = positions.map((p) => Math.hypot(p.x - bounds.centerX, p.y - bounds.centerY))

    expect(distances[distances.length - 1]).toBeGreaterThan(distances[0])
    // radius grows monotonically with sqrt(i), so consecutive distances are non-decreasing
    for (let i = 1; i < distances.length; i++) {
      expect(distances[i]).toBeGreaterThanOrEqual(distances[i - 1] - 1e-9)
    }
  })

  it('is deterministic for the same count and bounds', () => {
    expect(computeSpiralLayout(12, bounds)).toEqual(computeSpiralLayout(12, bounds))
  })

  it('produces distinct positions for distinct indices (no exact overlaps)', () => {
    const positions = computeSpiralLayout(15, bounds)
    const keys = new Set(positions.map((p) => `${p.x.toFixed(6)},${p.y.toFixed(6)}`))

    expect(keys.size).toBe(positions.length)
  })
})

describe('computeRidgeLayout', () => {
  const ridge = { centerX: 100, centerY: 100, halfLength: 40 }

  it('returns an empty array for a zero count', () => {
    expect(computeRidgeLayout(0, ridge)).toEqual([])
  })

  it('places a single subsection at the centre of the ridge', () => {
    expect(computeRidgeLayout(1, ridge)).toEqual([{ x: 100, y: 100 }])
  })

  it('puts the first (largest) peak at the middle and alternates outward', () => {
    // Straight, unwandering ridge along +X.
    const offsets = computeRidgeLayout(5, { ...ridge, orientation: 0 }).map((p) => p.x - 100)

    expect(offsets[0]).toBeCloseTo(0)
    expect(offsets[1]).toBeLessThan(0)
    expect(offsets[2]).toBeGreaterThan(0)
    expect(Math.abs(offsets[3])).toBeGreaterThan(Math.abs(offsets[1]))
    expect(Math.abs(offsets[4])).toBeGreaterThan(Math.abs(offsets[2]))
  })

  it('stays within halfLength along the axis', () => {
    for (const p of computeRidgeLayout(9, { ...ridge, orientation: 0 })) {
      expect(Math.abs(p.x - 100)).toBeLessThanOrEqual(ridge.halfLength + 1e-9)
    }
  })

  it('lays an unwandering ridge exactly along its orientation', () => {
    const spine = computeRidgeLayout(5, { ...ridge, orientation: Math.PI / 2 })

    for (const p of spine) expect(p.x).toBeCloseTo(100)
    expect(spine.some((p) => p.y !== 100)).toBe(true)
  })

  // The wander is what buys separation: a path that swings left and right
  // is longer than the straight line between its ends, so summits placed
  // along it sit further apart than the span alone would allow.
  it('swings the spine to both sides of the axis when given wander', () => {
    const across = computeRidgeLayout(9, { ...ridge, orientation: 0, wander: 0.34 }).map((p) => p.y - 100)

    expect(Math.max(...across)).toBeGreaterThan(0)
    expect(Math.min(...across)).toBeLessThan(0)
  })

  it('makes a wandering spine longer than a straight one', () => {
    const length = (spine) =>
      spine.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - spine[i].x, p.y - spine[i].y), 0)
    // Sorted along the axis, so the polyline follows the spine in order.
    const byAxis = (a, b) => a.x - b.x
    const straight = computeRidgeLayout(11, { ...ridge, orientation: 0 }).sort(byAxis)
    const wandering = computeRidgeLayout(11, { ...ridge, orientation: 0, wander: 0.34 }).sort(byAxis)

    expect(length(wandering)).toBeGreaterThan(length(straight))
  })

  it('clamps the spine into the latitude band, keeping land off the poles', () => {
    // A north-south ridge that would otherwise run well past the band.
    const spine = computeRidgeLayout(7, {
      ...ridge,
      orientation: Math.PI / 2,
      wander: 0.34,
      minY: 80,
      maxY: 120,
    })

    for (const p of spine) {
      expect(p.y).toBeGreaterThanOrEqual(80)
      expect(p.y).toBeLessThanOrEqual(120)
    }
  })

  it('is deterministic — no RNG in placement', () => {
    const options = { ...ridge, orientation: 1.1, wander: 0.34, phase: 0.7 }

    expect(computeRidgeLayout(6, options)).toEqual(computeRidgeLayout(6, options))
  })
})

describe('relaxPlacements', () => {
  const width = 512
  const wrapD = (a, b) => {
    const d = Math.abs(a - b)
    return Math.min(d, width - d)
  }
  const gapBetween = (a, b, placements) =>
    Math.hypot(wrapD(a.x, b.x), a.y - b.y) - placements[0].extent - placements[1].extent

  it('leaves placements that already clear each other alone', () => {
    const placements = [
      { x: 100, y: 128, extent: 20 },
      { x: 300, y: 128, extent: 20 },
    ]

    expect(relaxPlacements(placements, { width, gap: 10 })).toEqual([
      { x: 100, y: 128 },
      { x: 300, y: 128 },
    ])
  })

  // The case this exists for: a big section swallowing a small one.
  it('pushes a contained placement out of its larger neighbour', () => {
    const placements = [
      { x: 200, y: 128, extent: 90 },
      { x: 210, y: 130, extent: 15 },
    ]
    const [big, small] = relaxPlacements(placements, { width, gap: 10 })
    const distance = Math.hypot(wrapD(big.x, small.x), big.y - small.y)

    expect(distance).toBeGreaterThanOrEqual(90 + 15 + 10 - 1e-6)
  })

  it('separates across the seam rather than through the whole map', () => {
    // Five cells apart the short way; 507 the long way.
    const placements = [
      { x: 2, y: 128, extent: 30 },
      { x: 507, y: 128, extent: 30 },
    ]
    const [a, b] = relaxPlacements(placements, { width, gap: 8 })

    expect(gapBetween(a, b, placements)).toBeGreaterThanOrEqual(8 - 1e-6)
    // Both stay in range after wrapping.
    for (const p of [a, b]) expect(p.x).toBeGreaterThanOrEqual(0)
    for (const p of [a, b]) expect(p.x).toBeLessThan(width)
  })

  it('keeps a placement inside the band by its whole extent, not its centre', () => {
    const placements = [
      { x: 100, y: 40, extent: 25 },
      { x: 108, y: 45, extent: 25 },
    ]

    for (const p of relaxPlacements(placements, { width, minY: 30, maxY: 226, gap: 5 })) {
      expect(p.y).toBeGreaterThanOrEqual(30 + 25 - 1e-6)
      expect(p.y).toBeLessThanOrEqual(226 - 25 + 1e-6)
    }
  })

  it('honours bandExtent when terrain reaches further than the marker', () => {
    const placements = [
      { x: 100, y: 40, extent: 20, bandExtent: 60 },
      { x: 300, y: 40, extent: 20, bandExtent: 60 },
    ]

    for (const p of relaxPlacements(placements, { width, minY: 30, maxY: 226 })) {
      expect(p.y).toBeGreaterThanOrEqual(30 + 60 - 1e-6)
    }
  })

  it('centres a placement too wide to fit the band at all', () => {
    const [only] = relaxPlacements([{ x: 100, y: 40, extent: 200 }, { x: 400, y: 40, extent: 5 }], {
      width,
      minY: 30,
      maxY: 226,
    })

    expect(only.y).toBeCloseTo((30 + 226) / 2)
  })

  it('separates coincident placements instead of dividing by zero', () => {
    const [a, b] = relaxPlacements(
      [{ x: 100, y: 100, extent: 20 }, { x: 100, y: 100, extent: 20 }],
      { width, gap: 5 },
    )

    expect(Number.isFinite(a.x)).toBe(true)
    expect(Math.hypot(wrapD(a.x, b.x), a.y - b.y)).toBeGreaterThan(0)
  })

  it('is deterministic', () => {
    const placements = [
      { x: 200, y: 128, extent: 90 },
      { x: 210, y: 130, extent: 15 },
      { x: 240, y: 100, extent: 40 },
    ]

    expect(relaxPlacements(placements, { width, gap: 10 })).toEqual(
      relaxPlacements(placements, { width, gap: 10 }),
    )
  })
})
