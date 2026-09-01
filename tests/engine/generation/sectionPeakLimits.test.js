import { describe, expect, it } from 'vitest'
import { applyPeakLimits } from '../../../src/engine/generation/sectionPeakLimits.js'

function makeNode(title, subtreeSize, children = []) {
  return { title, depth: 1, anchor: title, ownSize: subtreeSize, subtreeSize, links: [], children }
}

describe('applyPeakLimits', () => {
  it('leaves the tree untouched when under every limit', () => {
    const nodes = [makeNode('A', 10), makeNode('B', 5)]
    const limited = applyPeakLimits(nodes, { limits: { maxTopLevelSections: 12, maxSubsectionsPerParent: 6, maxPeakDepth: 3 } })

    expect(limited.map((n) => n.title)).toEqual(['A', 'B'])
    expect(limited.some((n) => n.folded)).toBe(false)
  })

  it('folds top-level sections beyond the cap into a single Miscellaneous node', () => {
    const nodes = [makeNode('A', 50), makeNode('B', 40), makeNode('C', 5), makeNode('D', 3)]
    const limited = applyPeakLimits(nodes, { limits: { maxTopLevelSections: 3, maxSubsectionsPerParent: 6, maxPeakDepth: 3 } })

    expect(limited.map((n) => n.title)).toEqual(['A', 'B', 'Miscellaneous'])
    const misc = limited.find((n) => n.title === 'Miscellaneous')
    expect(misc.folded).toBe(true)
    expect(misc.subtreeSize).toBe(5 + 3)
  })

  it('keeps the largest sections and folds the smallest, regardless of input order', () => {
    const nodes = [makeNode('Small', 1), makeNode('Big', 100), makeNode('Medium', 10)]
    const limited = applyPeakLimits(nodes, { limits: { maxTopLevelSections: 2, maxSubsectionsPerParent: 6, maxPeakDepth: 3 } })

    expect(limited.map((n) => n.title)).toEqual(['Big', 'Miscellaneous'])
  })

  it('applies the per-parent subsection cap recursively', () => {
    const children = [makeNode('C1', 10), makeNode('C2', 8), makeNode('C3', 1)]
    const nodes = [makeNode('Parent', 19, children)]
    const limited = applyPeakLimits(nodes, { limits: { maxTopLevelSections: 12, maxSubsectionsPerParent: 2, maxPeakDepth: 3 } })

    expect(limited[0].children.map((n) => n.title)).toEqual(['C1', 'Miscellaneous'])
  })

  it('drops (but does not lose the size of) children beyond the max peak depth', () => {
    const grandchild = makeNode('Grandchild', 5)
    const child = makeNode('Child', 15, [grandchild])
    const nodes = [makeNode('Parent', 15, [child])]

    const limited = applyPeakLimits(nodes, { limits: { maxTopLevelSections: 12, maxSubsectionsPerParent: 6, maxPeakDepth: 2 } })

    expect(limited[0].children).toHaveLength(1)
    expect(limited[0].children[0].title).toBe('Child')
    expect(limited[0].children[0].children).toEqual([]) // depth 3 grandchild dropped
    expect(limited[0].children[0].subtreeSize).toBe(15) // size still includes the grandchild
  })

  it('is deterministic for the same input', () => {
    const nodes = [makeNode('A', 5), makeNode('B', 9), makeNode('C', 1)]
    const limitsOptions = { limits: { maxTopLevelSections: 2, maxSubsectionsPerParent: 6, maxPeakDepth: 3 } }

    expect(applyPeakLimits(nodes, limitsOptions)).toEqual(applyPeakLimits([...nodes], limitsOptions))
  })
})
