import { describe, expect, it } from 'vitest'
import {
  PORTAL_MARKERS,
  computePortalPulse,
  computePortalScale,
  isPortalRelated,
  pickPortalHoverScale,
  pickPortalOpacity,
} from '../../../src/ui/rendering/portalMarkers.js'

describe('computePortalPulse', () => {
  it('is exactly 1 at t=0 with no phase offset', () => {
    expect(computePortalPulse(0)).toBe(1)
  })

  it('stays within 1 ± the configured amplitude', () => {
    const { amplitude } = PORTAL_MARKERS.pulse
    for (let t = 0; t < 20; t += 0.13) {
      expect(computePortalPulse(t)).toBeGreaterThanOrEqual(1 - amplitude - 1e-9)
      expect(computePortalPulse(t)).toBeLessThanOrEqual(1 + amplitude + 1e-9)
    }
  })

  it('respects the per-portal phase offset so a cluster does not beat in unison', () => {
    expect(computePortalPulse(1, 0)).not.toBeCloseTo(computePortalPulse(1, Math.PI), 5)
  })
})

describe('isPortalRelated', () => {
  it('treats every portal as related when nothing is hovered', () => {
    expect(isPortalRelated(3, -1)).toBe(true)
    expect(isPortalRelated(-1, -1)).toBe(true)
    expect(isPortalRelated(0, null)).toBe(true)
    expect(isPortalRelated(0, undefined)).toBe(true)
  })

  it('matches a portal to the hovered top-level section', () => {
    expect(isPortalRelated(2, 2)).toBe(true)
    expect(isPortalRelated(2, 5)).toBe(false)
  })

  it('never relates a lead-section portal to a hovered section', () => {
    expect(isPortalRelated(-1, 0)).toBe(false)
  })
})

describe('pickPortalHoverScale', () => {
  it('grows under the cursor and rests at 1 otherwise', () => {
    expect(pickPortalHoverScale(true)).toBe(PORTAL_MARKERS.hover.scale)
    expect(pickPortalHoverScale(false)).toBe(1)
    expect(PORTAL_MARKERS.hover.scale).toBeGreaterThan(1)
  })
})

describe('pickPortalOpacity', () => {
  it('keeps related portals at full presence and dims the rest', () => {
    expect(pickPortalOpacity(true)).toBe(PORTAL_MARKERS.opacity.related)
    expect(pickPortalOpacity(false)).toBe(PORTAL_MARKERS.opacity.unrelated)
    expect(PORTAL_MARKERS.opacity.unrelated).toBeLessThan(PORTAL_MARKERS.opacity.related)
  })

  it('never dims the portal under the cursor, related or not', () => {
    // The cursor is a stronger statement of intent than the section-link
    // highlight the portal would otherwise be excluded from.
    expect(pickPortalOpacity(false, true)).toBe(PORTAL_MARKERS.opacity.related)
  })
})

describe('computePortalScale', () => {
  it('multiplies base, pulse and hover growth', () => {
    expect(computePortalScale(10, 1.1, 1.5)).toBeCloseTo(16.5)
  })

  it('is the base scale at rest', () => {
    expect(computePortalScale(PORTAL_MARKERS.baseScale, 1, 1)).toBe(PORTAL_MARKERS.baseScale)
  })

  it('breathes by the same proportion at rest and when hovered', () => {
    const restingSwing = computePortalScale(10, 1.1, 1) / computePortalScale(10, 1, 1)
    const hoveredSwing = computePortalScale(10, 1.1, 1.45) / computePortalScale(10, 1, 1.45)

    expect(restingSwing).toBeCloseTo(hoveredSwing)
  })
})
