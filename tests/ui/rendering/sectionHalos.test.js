import { describe, expect, it } from 'vitest'
import {
  SECTION_MARKERS,
  computeBreathingPulse,
  computeRingRadii,
  computeWallHeight,
  computeWallRadius,
  pickHaloOpacity,
  relationshipToHover,
  resolveHoveredTopLevel,
  resolveSectionAnchor,
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
  // Simulated peaks array: 0 is a top-level with subsections at 1, 2;
  // 3 is another top-level with a subsection at 4.
  const peaks = [
    { title: 'A', depth: 1, sectionIndex: 0 },
    { title: 'A.1', depth: 2, sectionIndex: 0 },
    { title: 'A.2', depth: 2, sectionIndex: 0 },
    { title: 'B', depth: 1, sectionIndex: 3 },
    { title: 'B.1', depth: 2, sectionIndex: 3 },
  ]

  it('returns null when nothing is hovered', () => {
    expect(relationshipToHover(peaks[0], null, 0, peaks)).toBeNull()
    expect(relationshipToHover(peaks[0], -1, 0, peaks)).toBeNull()
  })

  it('identifies the hovered peak itself as self', () => {
    expect(relationshipToHover(peaks[0], 0, 0, peaks)).toBe('self')
    expect(relationshipToHover(peaks[1], 1, 1, peaks)).toBe('self')
  })

  it('identifies a subsection of a hovered top-level as child', () => {
    expect(relationshipToHover(peaks[1], 0, 1, peaks)).toBe('child')
    expect(relationshipToHover(peaks[2], 0, 2, peaks)).toBe('child')
  })

  it('identifies the parent top-level when a subsection is hovered', () => {
    // Hovering A.1 (index 1) → A (index 0) is 'parent'.
    expect(relationshipToHover(peaks[0], 1, 0, peaks)).toBe('parent')
  })

  it('identifies sibling subsections when a subsection is hovered', () => {
    // Hovering A.1 (index 1) → A.2 (index 2) is 'sibling'.
    expect(relationshipToHover(peaks[2], 1, 2, peaks)).toBe('sibling')
  })

  it('returns unrelated for a different top-level section', () => {
    // Hovering A (index 0) → B (index 3) is 'unrelated'.
    expect(relationshipToHover(peaks[3], 0, 3, peaks)).toBe('unrelated')
  })

  it('returns unrelated for a subsection under a different parent', () => {
    // Hovering A (index 0) → B.1 (index 4) is 'unrelated' (its section-
    // Index is 3, not 0).
    expect(relationshipToHover(peaks[4], 0, 4, peaks)).toBe('unrelated')
  })

  it('returns unrelated when a subsection of a different top-level is hovered', () => {
    // Hovering A.1 (index 1) → B.1 (index 4) has a different parent → unrelated.
    expect(relationshipToHover(peaks[4], 1, 4, peaks)).toBe('unrelated')
  })

  it('falls back to top-level assumption when peaks array is omitted', () => {
    // Without the peaks array we can't tell if the hovered is a
    // subsection, so a peak whose sectionIndex points to the hovered
    // index is treated as 'child' (the Phase-4 default behavior).
    expect(relationshipToHover(peaks[1], 0, 1)).toBe('child')
    expect(relationshipToHover(peaks[3], 0, 3)).toBe('unrelated')
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

describe('resolveHoveredTopLevel', () => {
  const peaks = [
    { depth: 1, sectionIndex: 0 },
    { depth: 2, sectionIndex: 0 },
    { depth: 2, sectionIndex: 0 },
    { depth: 1, sectionIndex: 3 },
    { depth: 2, sectionIndex: 3 },
  ]

  it('returns -1 for null/negative/undefined hover', () => {
    expect(resolveHoveredTopLevel(null, peaks)).toBe(-1)
    expect(resolveHoveredTopLevel(-1, peaks)).toBe(-1)
    expect(resolveHoveredTopLevel(undefined, peaks)).toBe(-1)
  })

  it('returns the same index when hovered is already a top-level', () => {
    expect(resolveHoveredTopLevel(0, peaks)).toBe(0)
    expect(resolveHoveredTopLevel(3, peaks)).toBe(3)
  })

  it('returns the sectionIndex when hovered is a subsection', () => {
    expect(resolveHoveredTopLevel(1, peaks)).toBe(0)
    expect(resolveHoveredTopLevel(4, peaks)).toBe(3)
  })

  it('returns -1 when peaks array is missing or the index is out of range', () => {
    expect(resolveHoveredTopLevel(0, null)).toBe(-1)
    expect(resolveHoveredTopLevel(99, peaks)).toBe(-1)
  })
})

describe('resolveSectionAnchor', () => {
  const peaks = [
    { depth: 1, sectionIndex: 0, anchor: 'Early_life' },
    { depth: 2, sectionIndex: 0, anchor: 'Childhood' },
    { depth: 1, sectionIndex: 2, anchor: 'Career' },
    { depth: 2, sectionIndex: 2, anchor: null },
    // The synthetic folded range (see sectionPeakLimits.js) — no heading.
    { depth: 1, sectionIndex: 4, anchor: null },
  ]

  it('returns a top-level peak\'s own anchor', () => {
    expect(resolveSectionAnchor(0, peaks)).toBe('Early_life')
    expect(resolveSectionAnchor(2, peaks)).toBe('Career')
  })

  it('resolves a subsection to its owning top-level anchor', () => {
    expect(resolveSectionAnchor(1, peaks)).toBe('Early_life')
    // Even when the subsection itself has no anchor of its own.
    expect(resolveSectionAnchor(3, peaks)).toBe('Career')
  })

  it('returns null for a peak with no anchor (folded "Miscellaneous" range)', () => {
    expect(resolveSectionAnchor(4, peaks)).toBeNull()
  })

  it('returns null for an unknown peak or a missing peaks array', () => {
    expect(resolveSectionAnchor(99, peaks)).toBeNull()
    expect(resolveSectionAnchor(null, peaks)).toBeNull()
    expect(resolveSectionAnchor(0, null)).toBeNull()
  })
})
