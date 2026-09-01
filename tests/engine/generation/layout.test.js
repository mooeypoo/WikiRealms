import { describe, expect, it } from 'vitest'
import { computeSpiralLayout } from '../../../src/engine/generation/layout.js'

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
