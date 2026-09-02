import { describe, expect, it } from 'vitest'
import {
  SECTION_MARKERS,
  computeBreathingPulse,
  computeRingRadii,
  computeWallHeight,
  computeWallRadius,
  pickHaloOpacity,
  relationshipToHover,
} from '../../../src/ui/rendering/sectionHalos.js'

describe('computeWallHeight', () => {
  it('scales linearly with amplitude above the floor', () => {
    // amplitude 1.0 * heightMultiplier 22 = 22, above minHeight 12 → returns 22
    expect(computeWallHeight(1)).toBeCloseTo(SECTION_MARKERS.wall.heightMultiplier)
  })

  it('clamps to minHeight for tiny amplitudes', () => {
    expect(computeWallHeight(0)).toBe(SECTION_MARKERS.wall.minHeight)
    expect(computeWallHeight(0.1)).toBe(SECTION_MARKERS.wall.minHeight)
  })

  it('treats null/undefined amplitude as 0 (minimum floor)', () => {
    expect(computeWallHeight(null)).toBe(SECTION_MARKERS.wall.minHeight)
    expect(computeWallHeight(undefined)).toBe(SECTION_MARKERS.wall.minHeight)
  })
})

describe('computeRingRadii', () => {
  it('outer radius is slightly larger than the peak radius', () => {
    const { outer } = computeRingRadii(20)
    expect(outer).toBeGreaterThan(20)
    expect(outer).toBeCloseTo(20 * SECTION_MARKERS.ring.radiusMultiplier)
  })

  it('inner radius is exactly outer minus the configured thickness', () => {
    const { inner, outer } = computeRingRadii(20)
    expect(outer - inner).toBeCloseTo(SECTION_MARKERS.ring.thickness)
  })

  it('never lets the inner radius collapse to zero for very small peaks', () => {
    const { inner } = computeRingRadii(0.5)
    expect(inner).toBeGreaterThan(0)
  })
})

describe('computeWallRadius', () => {
  it('scales the peak radius by the configured wall multiplier', () => {
    expect(computeWallRadius(20)).toBeCloseTo(20 * SECTION_MARKERS.wall.radiusMultiplier)
  })
})

describe('pickHaloOpacity', () => {
  it('returns hovered for self', () => {
    expect(pickHaloOpacity('self')).toBe(SECTION_MARKERS.opacity.hovered)
  })
  it('returns child for child (subsection of hovered top-level)', () => {
    expect(pickHaloOpacity('child')).toBe(SECTION_MARKERS.opacity.child)
  })
  it('returns parent for parent', () => {
    expect(pickHaloOpacity('parent')).toBe(SECTION_MARKERS.opacity.parent)
  })
  it('returns sibling for sibling', () => {
    expect(pickHaloOpacity('sibling')).toBe(SECTION_MARKERS.opacity.sibling)
  })
  it('returns unrelated for unrelated top-level', () => {
    expect(pickHaloOpacity('unrelated')).toBe(SECTION_MARKERS.opacity.unrelated)
  })
  it('returns idle for null relationship on a top-level', () => {
    expect(pickHaloOpacity(null)).toBe(SECTION_MARKERS.opacity.idle)
    expect(pickHaloOpacity(undefined)).toBe(SECTION_MARKERS.opacity.idle)
  })

  it('hides subsections (idle=0) when unrelated or nothing hovered', () => {
    expect(pickHaloOpacity('unrelated', true)).toBe(SECTION_MARKERS.opacity.subsectionIdle)
    expect(pickHaloOpacity(null, true)).toBe(SECTION_MARKERS.opacity.subsectionIdle)
    expect(pickHaloOpacity('unrelated', true)).toBe(0)
  })

  it('reveals subsections (child target) when their parent top-level is hovered', () => {
    // A 'child' relationship uses the same child opacity regardless of
    // isSubsection — it's a semantic relationship, not a per-depth override.
    expect(pickHaloOpacity('child', true)).toBe(SECTION_MARKERS.opacity.child)
    expect(SECTION_MARKERS.opacity.child).toBeGreaterThan(0)
  })
})

describe('relationshipToHover', () => {
  const topLevel = { sectionIndex: 0, depth: 1 }
  const subOfZero = { sectionIndex: 0, depth: 2 }
  const otherTopLevel = { sectionIndex: 3, depth: 1 }

  it('returns null when nothing is hovered', () => {
    expect(relationshipToHover(topLevel, null, 0)).toBeNull()
    expect(relationshipToHover(topLevel, -1, 0)).toBeNull()
  })

  it('identifies the hovered top-level peak itself as self', () => {
    expect(relationshipToHover(topLevel, 0, 0)).toBe('self')
  })

  it('identifies a subsection of the hovered top-level as child (LOD reveal)', () => {
    expect(relationshipToHover(subOfZero, 0, 1)).toBe('child')
  })

  it('returns unrelated for a different top-level section', () => {
    expect(relationshipToHover(otherTopLevel, 0, 3)).toBe('unrelated')
  })

  it('returns unrelated for a subsection under a different parent', () => {
    const otherSub = { sectionIndex: 3, depth: 2 }
    expect(relationshipToHover(otherSub, 0, 4)).toBe('unrelated')
  })
})

describe('computeBreathingPulse', () => {
  it('is zero at t=0 with no phase offset', () => {
    expect(computeBreathingPulse(0, 0)).toBeCloseTo(0)
  })

  it('is bounded by the configured amplitude', () => {
    for (let t = 0; t < 10; t += 0.1) {
      const value = computeBreathingPulse(t, 1.23)
      expect(Math.abs(value)).toBeLessThanOrEqual(SECTION_MARKERS.pulse.amplitude + 1e-9)
    }
  })

  it('respects the per-peak phase offset', () => {
    // Two peaks at the same time but different phases should differ.
    const a = computeBreathingPulse(0.5, 0)
    const b = computeBreathingPulse(0.5, Math.PI)
    expect(a).not.toBeCloseTo(b)
  })
})
