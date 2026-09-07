import { describe, expect, it } from 'vitest'
import { BIOME } from '../../../src/engine/generation/terrain.js'
import {
  buildTooltipModel,
  countDirectSubsections,
  projectClipToScreen,
} from '../../../src/ui/rendering/sectionTooltip.js'

describe('projectClipToScreen', () => {
  const rect = { width: 800, height: 600 }

  it('maps clip-space origin (0,0,0) to the canvas center', () => {
    const p = projectClipToScreen({ x: 0, y: 0, z: 0 }, rect)
    expect(p.screenX).toBe(400)
    expect(p.screenY).toBe(300)
    expect(p.isBehindCamera).toBe(false)
    expect(p.isOnScreen).toBe(true)
  })

  it('maps clip (-1, 1) to canvas top-left', () => {
    const p = projectClipToScreen({ x: -1, y: 1, z: 0 }, rect)
    expect(p.screenX).toBe(0)
    expect(p.screenY).toBe(0)
  })

  it('maps clip (1, -1) to canvas bottom-right', () => {
    const p = projectClipToScreen({ x: 1, y: -1, z: 0 }, rect)
    expect(p.screenX).toBe(800)
    expect(p.screenY).toBe(600)
  })

  it('flags a point behind the camera (z outside [-1, 1])', () => {
    expect(projectClipToScreen({ x: 0, y: 0, z: 1.5 }, rect).isBehindCamera).toBe(true)
    expect(projectClipToScreen({ x: 0, y: 0, z: -1.5 }, rect).isBehindCamera).toBe(true)
  })

  it('flags an off-screen point (x or y outside [-1, 1]) but not behind camera', () => {
    const off = projectClipToScreen({ x: 1.5, y: 0, z: 0 }, rect)
    expect(off.isBehindCamera).toBe(false)
    expect(off.isOnScreen).toBe(false)
  })
})

describe('countDirectSubsections', () => {
  // Simulated flattenPeaks output shape (depth-first order).
  const peaks = [
    { title: 'A', depth: 1, sectionIndex: 0 },
    { title: 'A.1', depth: 2, sectionIndex: 0 },
    { title: 'A.1.a', depth: 3, sectionIndex: 0 },
    { title: 'A.2', depth: 2, sectionIndex: 0 },
    { title: 'B', depth: 1, sectionIndex: 4 },
    { title: 'B.1', depth: 2, sectionIndex: 4 },
  ]

  it('counts direct children of a top-level section', () => {
    // A has two direct children (A.1, A.2). A.1.a is a grandchild, doesn't count.
    expect(countDirectSubsections(peaks, 0)).toBe(2)
    expect(countDirectSubsections(peaks, 4)).toBe(1)
  })

  it('counts direct children of a subsection (depth-agnostic)', () => {
    // A.1 (index 1) has one direct child (A.1.a). A.2 has none.
    expect(countDirectSubsections(peaks, 1)).toBe(1)
    expect(countDirectSubsections(peaks, 3)).toBe(0)
  })

  it('returns 0 for a top-level with no subsections', () => {
    const single = [{ title: 'Only', depth: 1, sectionIndex: 0 }]
    expect(countDirectSubsections(single, 0)).toBe(0)
  })

  it('returns 0 for invalid indices', () => {
    expect(countDirectSubsections(peaks, -1)).toBe(0)
    expect(countDirectSubsections(peaks, 99)).toBe(0)
    expect(countDirectSubsections(null, 0)).toBe(0)
  })
})

describe('buildTooltipModel', () => {
  const peaks = [
    {
      title: 'Life and career',
      depth: 1,
      sectionIndex: 0,
      ownSize: 2200,
      subtreeSize: 3400,
      lushness: 0.5,
    },
    { title: 'Early life', depth: 2, sectionIndex: 0 },
    { title: 'Later years', depth: 2, sectionIndex: 0 },
  ]

  it('produces a full tooltip model with title, count, size, and density', () => {
    const model = buildTooltipModel(peaks[0], peaks)
    expect(model.title).toBe('Life and career')
    expect(model.subsectionCount).toBe(2)
    expect(model.wordsLabel).toMatch(/word/)
    expect(model.densityBand).toBe(BIOME.MEADOW)
  })

  it('prefers subtreeSize when it is larger than ownSize', () => {
    // A section whose own prose is empty but whose subsections are large —
    // reflects Wikipedia sections that only contain subsection headings.
    const parent = { ...peaks[0], ownSize: 0, subtreeSize: 5500 }
    const model = buildTooltipModel(parent, peaks)
    expect(model.wordsLabel).toBe('1,000 words') // 5500 / 5.5 = 1000
  })

  it('returns a safe empty-ish model for a null peak', () => {
    const model = buildTooltipModel(null, peaks)
    expect(model.title).toBe('')
    expect(model.subsectionCount).toBe(0)
    expect(model.densityBand).toBeNull()
  })

  it('counts children of a subsection when peakIndex is provided', () => {
    // Build a peaks list where index 1 is a subsection with one grandchild.
    const deep = [
      { title: 'Root', depth: 1, sectionIndex: 0, ownSize: 100 },
      { title: 'Sub', depth: 2, sectionIndex: 0, ownSize: 200, lushness: 0.1 },
      { title: 'Sub.Sub', depth: 3, sectionIndex: 0 },
    ]
    const model = buildTooltipModel(deep[1], deep, 1)
    expect(model.title).toBe('Sub')
    expect(model.subsectionCount).toBe(1)
    expect(model.densityBand).toBe(BIOME.STEPPE)
  })

  it('reads the same scalar the ground under the cursor was coloured by', () => {
    // The tooltip used to run its own absolute thresholds over
    // citations-per-sentence, so it could say "dense" over meadow.
    const uncited = buildTooltipModel({ title: 'X', lushness: 0 }, [])
    const best = buildTooltipModel({ title: 'Y', lushness: 1 }, [])

    expect(uncited.densityBand).toBe(BIOME.DUNES)
    expect(best.densityBand).toBe(BIOME.JUNGLE)
  })
})
