import { describe, expect, it } from 'vitest'
import {
  SECTION_MARKERS,
  computeBreathingPulse,
  computeRingRadii,
  computeWallHeight,
  computeWallRadius,
  ringMarginFor,
  pickHaloOpacity,
  pickWallHeightScale,
  relationshipToHover,
  resolveHoveredTopLevel,
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

// These are MARGINS outside whatever footprint haloGeometry traces, not
// radii — the footprint of a section is the envelope of its subsections.
describe('computeRingRadii', () => {
  it('puts the ribbon\'s outer edge at the configured margin', () => {
    expect(computeRingRadii().outer).toBeCloseTo(SECTION_MARKERS.ring.margin)
  })

  it('inner edge is exactly outer minus the configured thickness', () => {
    const { inner, outer } = computeRingRadii()
    expect(outer - inner).toBeCloseTo(SECTION_MARKERS.ring.thickness)
  })

  it('never lets the inner edge collapse through the footprint', () => {
    expect(computeRingRadii().inner).toBeGreaterThan(0)
  })
})

describe('computeWallRadius', () => {
  it('stands the curtain just inside the ring', () => {
    const margin = SECTION_MARKERS.ring.margin
    expect(computeWallRadius(margin)).toBeCloseTo(margin - SECTION_MARKERS.wall.inset)
    expect(computeWallRadius(margin)).toBeLessThan(computeRingRadii(margin).outer)
  })

  // A subsection's margin is small, so the inset must not drive the
  // curtain inside the footprint it is supposed to stand on.
  it('never collapses through the footprint at a tight margin', () => {
    expect(computeWallRadius(SECTION_MARKERS.ring.subsectionMargin)).toBeGreaterThan(0)
    expect(computeWallRadius(0.1)).toBeGreaterThan(0)
  })
})

describe('ringMarginFor', () => {
  it('holds subsections at arm\'s length from their section, but not from each other', () => {
    expect(ringMarginFor(true)).toBe(SECTION_MARKERS.ring.margin)
    expect(ringMarginFor(false)).toBe(SECTION_MARKERS.ring.subsectionMargin)
    expect(ringMarginFor(false)).toBeLessThan(ringMarginFor(true))
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

  it('keeps the hovered peak clearly brighter than its own context', () => {
    const o = SECTION_MARKERS.opacity
    // The hovered peak has to dominate, or a hovered range and its
    // revealed subsections read as "everything is highlighted".
    expect(o.hovered).toBeGreaterThan(o.parent * 2)
    expect(o.hovered).toBeGreaterThan(o.child * 2)
    // Related-but-not-hovered ranks below the direct parent/child pair,
    // and everything related stays above the unrelated background.
    expect(o.parent).toBeGreaterThan(o.sibling)
    expect(o.child).toBeGreaterThan(o.sibling)
    expect(o.sibling).toBeGreaterThan(o.unrelated)
  })

  it('keeps sibling subsections hoverable so the cursor can travel between them', () => {
    // tryHoverHalo ignores halos below 0.1 — a sibling under that floor
    // would drop the cursor back through terrain hover on its way over.
    expect(SECTION_MARKERS.opacity.sibling).toBeGreaterThan(0.1)
  })
})

describe('pickWallHeightScale', () => {
  it('mirrors the opacity vocabulary, one scale per relationship', () => {
    const h = SECTION_MARKERS.heightScale
    expect(pickWallHeightScale('self')).toBe(h.hovered)
    expect(pickWallHeightScale('child')).toBe(h.child)
    expect(pickWallHeightScale('parent')).toBe(h.parent)
    expect(pickWallHeightScale('sibling')).toBe(h.sibling)
    expect(pickWallHeightScale('unrelated')).toBe(h.unrelated)
    expect(pickWallHeightScale(null)).toBe(h.idle)
    expect(pickWallHeightScale(undefined)).toBe(h.idle)
  })

  it('gives the hovered peak the tallest wall on the map', () => {
    const h = SECTION_MARKERS.heightScale
    const others = [h.idle, h.child, h.parent, h.sibling, h.unrelated, h.subsectionIdle]

    expect(h.hovered).toBe(1)
    for (const scale of others) expect(scale).toBeLessThan(h.hovered)
  })

  it('ranks context above bystanders: parent/child taller than sibling and unrelated', () => {
    const h = SECTION_MARKERS.heightScale
    expect(h.parent).toBeGreaterThan(h.sibling)
    expect(h.child).toBeGreaterThan(h.sibling)
    expect(h.sibling).toBeGreaterThan(h.unrelated)
    // Hovering anything makes unrelated ranges sink below the resting skyline.
    expect(h.unrelated).toBeLessThan(h.idle)
  })

  it('uses the subsection floor when a subsection is idle or unrelated', () => {
    const h = SECTION_MARKERS.heightScale
    expect(pickWallHeightScale(null, true)).toBe(h.subsectionIdle)
    expect(pickWallHeightScale('unrelated', true)).toBe(h.subsectionIdle)
    // Never exactly zero — a zero-scaled mesh has a singular world matrix.
    expect(h.subsectionIdle).toBeGreaterThan(0)
  })

  it('reveals a subsection at its child height regardless of depth flag', () => {
    expect(pickWallHeightScale('child', true)).toBe(SECTION_MARKERS.heightScale.child)
    expect(pickWallHeightScale('child', false)).toBe(SECTION_MARKERS.heightScale.child)
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

