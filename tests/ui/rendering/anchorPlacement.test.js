import { describe, expect, it } from 'vitest'
import { facesCamera, placeCard, shouldShowCard } from '../../../src/ui/rendering/anchorPlacement.js'

const VIEWPORT = { width: 1000, height: 800 }
const CARD = { width: 260, height: 120 }

describe('facesCamera', () => {
  // A sphere of radius 100 with the camera out along +z.
  const camera = { x: 0, y: 0, z: 400 }

  it('shows a point on the near face', () => {
    expect(facesCamera({ x: 0, y: 0, z: 100 }, camera)).toBe(true)
  })

  it('hides a point on the far face', () => {
    // This is the bug: the far pole projects to the middle of the screen
    // with valid coordinates, so it used to get a label on top of the
    // markers actually visible there.
    expect(facesCamera({ x: 0, y: 0, z: -100 }, camera)).toBe(false)
  })

  it('treats the exact limb as hidden rather than shown', () => {
    expect(facesCamera({ x: 100, y: 0, z: 0 }, camera)).toBe(false)
  })

  it('can hide the grazing band near the limb too', () => {
    // Just inside the limb — for a camera at z=400 and radius 100, the
    // tangent is at z=25, so this is visible but grazing, at an angle where
    // a label reads as belonging to whatever is beside it.
    const grazing = { x: 95.4, y: 0, z: 30 }

    expect(facesCamera(grazing, camera)).toBe(true)
    expect(facesCamera(grazing, camera, 0.25)).toBe(false)
  })

  it('follows the camera around the sphere', () => {
    const point = { x: 100, y: 0, z: 0 }

    expect(facesCamera(point, { x: 400, y: 0, z: 0 })).toBe(true)
    expect(facesCamera(point, { x: -400, y: 0, z: 0 })).toBe(false)
  })

  it('does not divide by zero at the centre', () => {
    expect(facesCamera({ x: 0, y: 0, z: 0 }, camera)).toBe(true)
  })
})

describe('placeCard', () => {
  it('sits above the anchor and centred on it', () => {
    // A card over its own marker answers a question by hiding its subject.
    const placed = placeCard({ anchor: { x: 500, y: 400 }, card: CARD, viewport: VIEWPORT })

    expect(placed.side).toBe('above')
    expect(placed.x).toBe(500 - CARD.width / 2)
    expect(placed.y).toBe(400 - 14 - CARD.height)
    expect(placed.clamped).toBe(false)
  })

  it('flips below when there is no room above', () => {
    const placed = placeCard({ anchor: { x: 500, y: 40 }, card: CARD, viewport: VIEWPORT })

    expect(placed.side).toBe('below')
    expect(placed.y).toBe(40 + 14)
  })

  it('keeps itself on screen at the right edge', () => {
    const placed = placeCard({ anchor: { x: 990, y: 400 }, card: CARD, viewport: VIEWPORT })

    expect(placed.x + CARD.width).toBeLessThanOrEqual(VIEWPORT.width - 12)
    expect(placed.clamped).toBe(true)
  })

  it('keeps itself on screen at the left edge', () => {
    const placed = placeCard({ anchor: { x: 4, y: 400 }, card: CARD, viewport: VIEWPORT })

    expect(placed.x).toBe(12)
  })

  it('keeps itself on screen at the bottom', () => {
    const placed = placeCard({ anchor: { x: 500, y: 790 }, card: CARD, viewport: VIEWPORT })

    expect(placed.y + CARD.height).toBeLessThanOrEqual(VIEWPORT.height - 12)
  })

  it('stays inside a viewport too small for it rather than going negative', () => {
    // A landscape phone with a tall card: pinned to the margin beats
    // floating off the top edge.
    const placed = placeCard({ anchor: { x: 200, y: 100 }, card: { width: 300, height: 400 }, viewport: { width: 844, height: 390 } })

    expect(placed.x).toBeGreaterThanOrEqual(12)
    expect(placed.y).toBeGreaterThanOrEqual(12)
  })

  it('reports the side so a leader line knows which way to point', () => {
    expect(placeCard({ anchor: { x: 500, y: 600 }, card: CARD, viewport: VIEWPORT }).side).toBe('above')
    expect(placeCard({ anchor: { x: 500, y: 10 }, card: CARD, viewport: VIEWPORT }).side).toBe('below')
  })
})

describe('shouldShowCard', () => {
  const onScreen = { isOnScreen: true, isBehindCamera: false }

  it('shows a visible, unoccluded anchor', () => {
    expect(shouldShowCard(onScreen, false)).toBe(true)
  })

  it('hides an occluded one', () => {
    expect(shouldShowCard(onScreen, true)).toBe(false)
  })

  it('hides one behind the camera or off screen', () => {
    expect(shouldShowCard({ isOnScreen: false, isBehindCamera: false })).toBe(false)
    expect(shouldShowCard({ isOnScreen: true, isBehindCamera: true })).toBe(false)
  })

  it('hides when there is no projection at all', () => {
    expect(shouldShowCard(null)).toBe(false)
  })
})
