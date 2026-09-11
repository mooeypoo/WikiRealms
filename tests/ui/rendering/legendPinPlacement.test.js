import { describe, expect, it } from 'vitest'
import { legendKeyReserves, placeLegendPins } from '../../../src/ui/rendering/legendPinPlacement.js'

describe('placeLegendPins', () => {
  const viewport = { width: 1280, height: 800 }

  it('offsets pins away from their anchors rather than sitting on them', () => {
    const [placed] = placeLegendPins({
      anchors: [{ id: 'range', x: 400, y: 400 }],
      viewport,
    })

    expect(placed.pin.x).not.toBe(400)
    expect(placed.anchor.x).toBe(400)
    expect(placed.leader.x2).toBe(400)
    expect(placed.leader.y2).toBe(400)
  })

  it('spreads two nearby anchors so their boxes do not overlap', () => {
    const placed = placeLegendPins({
      anchors: [
        { id: 'range', x: 500, y: 400 },
        { id: 'portal', x: 520, y: 410 },
      ],
      viewport,
      pin: { width: 220, height: 64 },
      separation: 14,
    })

    expect(placed).toHaveLength(2)
    const [a, b] = placed
    const ax2 = a.pin.x + 220
    const ay2 = a.pin.y + 64
    const bx2 = b.pin.x + 220
    const by2 = b.pin.y + 64
    const separate =
      ax2 + 14 <= b.pin.x ||
      bx2 + 14 <= a.pin.x ||
      ay2 + 14 <= b.pin.y ||
      by2 + 14 <= a.pin.y
    expect(separate).toBe(true)
  })

  it('keeps pins inside the viewport', () => {
    const [placed] = placeLegendPins({
      anchors: [{ id: 'portal', x: 20, y: 20 }],
      viewport: { width: 400, height: 300 },
      margin: 12,
    })

    expect(placed.pin.x).toBeGreaterThanOrEqual(12)
    expect(placed.pin.y).toBeGreaterThanOrEqual(12)
    expect(placed.pin.x + 220).toBeLessThanOrEqual(400 - 12)
  })

  it('returns nothing without anchors or a viewport', () => {
    expect(placeLegendPins({ anchors: [], viewport })).toEqual([])
    expect(placeLegendPins({ anchors: [{ id: 'range', x: 1, y: 1 }], viewport: null })).toEqual([])
  })
})

describe('legendKeyReserves', () => {
  it('reserves the bottom on phones and the right on desktops', () => {
    expect(legendKeyReserves({ width: 390, height: 844 }).bottomReserve).toBeGreaterThan(0)
    expect(legendKeyReserves({ width: 390, height: 844 }).rightReserve).toBe(0)
    expect(legendKeyReserves({ width: 1280, height: 800 }).rightReserve).toBeGreaterThan(0)
    expect(legendKeyReserves({ width: 1280, height: 800 }).bottomReserve).toBe(0)
  })
})
