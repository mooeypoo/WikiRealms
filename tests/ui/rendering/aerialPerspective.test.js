/**
 * The haze range, which is the whole of the depth cue that can be
 * checked without a GL context: the colour is CSS and the mixing is
 * three's, so what is left here is where the gradient sits.
 *
 * These are mostly relationships rather than values, because the values
 * were tuned against screenshots and will be tuned again. What must not
 * change is which way round they are.
 */
import { describe, expect, it } from 'vitest'
import { AERIAL_PERSPECTIVE, hazeRange } from '../../../src/ui/rendering/aerialPerspective.js'

// The default flat view: a 512-wide map seen from 460 back and 200 up.
const FLAT = { cameraDistance: Math.hypot(460, 200), worldExtent: 512 }

describe('hazeRange', () => {
  it('starts the haze at the world s near edge, not its middle', () => {
    // Fog beginning at the centre distance would leave the entire front
    // half of the map unhazed and put the gradient behind the middle,
    // where there is least to see. Half an extent is the correction.
    const { near } = hazeRange(FLAT)

    expect(near).toBeCloseTo(FLAT.cameraDistance - 256, 6)
  })

  it('reaches full haze well beyond the world, so the far edge survives', () => {
    // The property the tuning turned on: fog is total at `far`, so `far`
    // at the world's back edge would erase it rather than veil it.
    const { near, far } = hazeRange(FLAT)

    expect(AERIAL_PERSPECTIVE.fullHazeExtents).toBeGreaterThan(1)
    expect(far - near).toBeCloseTo(512 * AERIAL_PERSPECTIVE.fullHazeExtents, 6)
  })

  it('leaves the far edge of the world short of total haze', () => {
    // Stated as the fog fraction three will compute there, which is the
    // number that actually matters and the one a change to
    // fullHazeExtents would move. The map's far edge is 128 past centre.
    const { near, far } = hazeRange(FLAT)
    const farEdgeDepth = Math.hypot(460 + 128, 200)

    const t = (farEdgeDepth - near) / (far - near)
    // smoothstep, which is what three's fog applies.
    const haze = t * t * (3 - 2 * t)

    expect(haze).toBeGreaterThan(0.15) // enough to read as distance
    expect(haze).toBeLessThan(0.45) // not enough to lose the terrain
  })

  it('keeps the near half of the world nearly clear', () => {
    // The near edge should be barely touched — otherwise the whole frame
    // is veiled and the gradient stops being a gradient.
    const { near, far } = hazeRange(FLAT)
    const nearEdgeDepth = Math.hypot(460 - 128, 200)

    const t = (nearEdgeDepth - near) / (far - near)

    expect(t * t * (3 - 2 * t)).toBeLessThan(0.08)
  })

  it('slides with the camera rather than sitting at a fixed depth', () => {
    // The design decision, asserted so it cannot be quietly undone: the
    // range is anchored to the camera, so pulling back does not wash the
    // world out.
    const close = hazeRange({ cameraDistance: 300, worldExtent: 512 })
    const distant = hazeRange({ cameraDistance: 3000, worldExtent: 512 })

    expect(distant.near).toBeGreaterThan(close.near)
    expect(distant.far - distant.near).toBeCloseTo(close.far - close.near, 6)
  })

  it('spans more depth for a bigger world', () => {
    const small = hazeRange({ cameraDistance: 1000, worldExtent: 256 })
    const large = hazeRange({ cameraDistance: 1000, worldExtent: 1024 })

    expect(large.far - large.near).toBeGreaterThan(small.far - small.near)
    // And a bigger world starts hazing nearer the camera, since more of
    // it is in front of its own centre.
    expect(large.near).toBeLessThan(small.near)
  })

  it('never puts the haze behind the camera', () => {
    // Inside the globe, or zoomed closer than half an extent. A negative
    // near is not meaningful to three and clamping it here is cheaper
    // than a caller remembering to.
    expect(hazeRange({ cameraDistance: 10, worldExtent: 512 }).near).toBe(0)
  })

  it('returns a usable range for a world with no size yet', () => {
    // The first frames of a rebuild, before the terrain mesh has set an
    // extent. A NaN range blacks the frame in a way that looks like a
    // crash; near === far is a hard cut nobody will see at distance 0.
    const empty = hazeRange({ cameraDistance: 500, worldExtent: 0 })

    expect(Number.isFinite(empty.near)).toBe(true)
    expect(Number.isFinite(empty.far)).toBe(true)
    expect(empty.far).toBeGreaterThanOrEqual(empty.near)
  })

  it('survives a camera distance that is not a number', () => {
    const broken = hazeRange({ cameraDistance: NaN, worldExtent: 512 })

    expect(Number.isFinite(broken.near)).toBe(true)
    expect(Number.isFinite(broken.far)).toBe(true)
  })

  it('always hazes far before near', () => {
    for (const cameraDistance of [0, 1, 100, 501, 5000]) {
      for (const worldExtent of [1, 64, 512, 4096]) {
        const { near, far } = hazeRange({ cameraDistance, worldExtent })
        expect(far).toBeGreaterThan(near)
      }
    }
  })
})
