import { describe, expect, it } from 'vitest'
import { createRng } from '../../../src/engine/generation/rng.js'
import { PORTAL_LIMITS } from '../../../src/engine/generation/config.js'
import { generateSectionPortals } from '../../../src/engine/generation/sectionPortals.js'

const width = 32
const height = 32
const peaks = [
  { x: 16, y: 16, radius: 10, title: 'Purpose', depth: 1 },
  { x: 5, y: 5, radius: 6, title: 'Features', depth: 1 },
]

describe('generateSectionPortals', () => {
  it('creates one portal per (section, distinct link) pair', () => {
    const tree = {
      lead: { links: [] },
      sections: [
        { title: 'Purpose', anchor: 'Purpose', links: ['Physics'], children: [] },
        { title: 'Features', anchor: 'Features', links: ['Physics', 'Chemistry'], children: [] },
      ],
    }

    const portals = generateSectionPortals(tree, peaks, createRng(1), { width, height })

    // "Physics" appears in both sections -> two separate portals
    expect(portals).toHaveLength(3)
    expect(portals.filter((p) => p.targetArticleId === 'Physics')).toHaveLength(2)
  })

  it('places a section\'s portals within that section\'s peak footprint', () => {
    const tree = {
      lead: { links: [] },
      sections: [{ title: 'Purpose', anchor: 'Purpose', links: ['Physics'], children: [] }],
    }

    const [portal] = generateSectionPortals(tree, peaks, createRng(1), { width, height })

    const distance = Math.hypot(portal.gridX - 16, portal.gridY - 16)
    expect(distance).toBeLessThanOrEqual(10)
    expect(portal.sectionTitle).toBe('Purpose')
  })

  it('places a subsection\'s portals within its top-level ancestor\'s footprint', () => {
    const tree = {
      lead: { links: [] },
      sections: [
        {
          title: 'Features',
          anchor: 'Features',
          links: [],
          children: [{ title: 'Sub Feature', anchor: 'Sub_Feature', links: ['Polystyrene'], children: [] }],
        },
      ],
    }

    const [portal] = generateSectionPortals(tree, peaks, createRng(1), { width, height })

    const distance = Math.hypot(portal.gridX - 5, portal.gridY - 5)
    expect(distance).toBeLessThanOrEqual(6)
    expect(portal.sectionTitle).toBe('Features')
  })

  it('includes lead-section links, placed near the fallback/center region', () => {
    const tree = { lead: { links: ['Pet'] }, sections: [] }

    const portals = generateSectionPortals(tree, [], createRng(1), { width, height })

    expect(portals).toHaveLength(1)
    expect(portals[0].targetArticleId).toBe('Pet')
    expect(portals[0].sectionTitle).toBeNull()
  })

  it('falls back to the Miscellaneous peak when a top-level ancestor was folded away', () => {
    const tree = {
      lead: { links: [] },
      sections: [{ title: 'Obscure Section', anchor: 'Obscure', links: ['SomeLink'], children: [] }],
    }
    const peaksWithMisc = [{ x: 20, y: 20, radius: 4, title: 'Miscellaneous', depth: 1 }]

    const [portal] = generateSectionPortals(tree, peaksWithMisc, createRng(1), { width, height })

    const distance = Math.hypot(portal.gridX - 20, portal.gridY - 20)
    expect(distance).toBeLessThanOrEqual(4)
  })

  it('caps the total number of portals', () => {
    const links = Array.from({ length: 100 }, (_, i) => `Link ${i}`)
    const tree = { lead: { links: [] }, sections: [{ title: 'Purpose', anchor: 'Purpose', links, children: [] }] }

    const portals = generateSectionPortals(tree, peaks, createRng(1), { width, height })

    expect(portals.length).toBeLessThan(links.length)
  })

  it('tags each portal with the peaks-array index of its owning top-level section', () => {
    const tree = {
      lead: { links: ['LeadLink'] },
      sections: [
        { title: 'Purpose', anchor: 'Purpose', links: ['Physics'], children: [] },
        {
          title: 'Features',
          anchor: 'Features',
          links: [],
          children: [{ title: 'Sub', anchor: 'Sub', links: ['Chem'], children: [] }],
        },
      ],
    }

    const portals = generateSectionPortals(tree, peaks, createRng(1), { width, height })
    const byTarget = Object.fromEntries(portals.map((p) => [p.targetArticleId, p]))

    // Purpose peak is at index 0, Features peak is at index 1 in the peaks fixture.
    expect(byTarget.Physics.sectionIndex).toBe(0)
    expect(byTarget.Chem.sectionIndex).toBe(1)
    // Lead-section portals have no top-level ancestor -> -1 sentinel.
    expect(byTarget.LeadLink.sectionIndex).toBe(-1)
  })

  it('is deterministic for the same tree, peaks, and rng seed', () => {
    const tree = {
      lead: { links: ['Pet'] },
      sections: [{ title: 'Purpose', anchor: 'Purpose', links: ['Physics'], children: [] }],
    }

    const a = generateSectionPortals(tree, peaks, createRng(42), { width, height })
    const b = generateSectionPortals(tree, peaks, createRng(42), { width, height })

    expect(a).toEqual(b)
  })

  it('places a subsection\'s portals in its OWN peak when that subsection kept one', () => {
    const peaksWithSubPeak = [
      ...peaks,
      { x: 26, y: 26, radius: 3, title: 'Sub Feature', anchor: 'Sub_Feature', depth: 2 },
    ]
    const tree = {
      lead: { links: [] },
      sections: [
        {
          title: 'Features',
          anchor: 'Features',
          links: [],
          children: [{ title: 'Sub Feature', anchor: 'Sub_Feature', links: ['Polystyrene'], children: [] }],
        },
      ],
    }

    const [portal] = generateSectionPortals(tree, peaksWithSubPeak, createRng(1), { width, height })

    // Inside the sub-peak, not merely somewhere in the parent range.
    expect(Math.hypot(portal.gridX - 26, portal.gridY - 26)).toBeLessThanOrEqual(3)
    // Hover-linking still resolves to the owning top-level range.
    expect(portal.sectionTitle).toBe('Features')
    expect(portal.sectionIndex).toBe(1)
  })

  it('spreads a link-heavy section across its footprint instead of stacking portals', () => {
    const links = Array.from({ length: 12 }, (_, i) => `Link ${i}`)
    const tree = { lead: { links: [] }, sections: [{ title: 'Purpose', anchor: 'Purpose', links, children: [] }] }

    const portals = generateSectionPortals(tree, peaks, createRng(3), { width, height })
    const cells = new Set(portals.map((p) => `${p.gridX},${p.gridY}`))
    const distances = portals.map((p) => Math.hypot(p.gridX - 16, p.gridY - 16))

    // No two portals land on the same grid cell.
    expect(cells.size).toBe(portals.length)
    // Spread by area, not piled at the summit: the set reaches the outer
    // footprint and still clears the middle where the section marker sits.
    expect(Math.max(...distances)).toBeGreaterThan(10 * 0.7)
    expect(Math.min(...distances)).toBeGreaterThan(0)
    for (const distance of distances) expect(distance).toBeLessThanOrEqual(10)
  })

  it('gives every linked section a portal before any section gets a second', () => {
    const tree = {
      lead: { links: [] },
      sections: [
        // Enough links to swallow the whole cap in document order.
        { title: 'Purpose', anchor: 'Purpose', links: Array.from({ length: 40 }, (_, i) => `P${i}`), children: [] },
        { title: 'Features', anchor: 'Features', links: ['Chemistry'], children: [] },
      ],
    }

    const portals = generateSectionPortals(tree, peaks, createRng(1), { width, height })

    expect(portals).toHaveLength(PORTAL_LIMITS.maxPortals)
    expect(portals.some((p) => p.targetArticleId === 'Chemistry')).toBe(true)
  })

  it('places lead links in the middle of the map, not in the folded-sections aggregate', () => {
    const tree = { lead: { links: ['Pet', 'Dog', 'Cat', 'Bird'] }, sections: [] }
    const peaksWithMisc = [{ x: 26, y: 26, radius: 3, title: 'Miscellaneous', depth: 1 }]

    const portals = generateSectionPortals(tree, peaksWithMisc, createRng(1), { width, height })
    const leadRadius = Math.min(width, height) * PORTAL_LIMITS.leadRegionRadiusRatio

    for (const portal of portals) {
      expect(Math.hypot(portal.gridX - width / 2, portal.gridY - height / 2)).toBeLessThanOrEqual(leadRadius)
    }
    // They'd all be inside the tiny Miscellaneous footprint if the lead
    // were still sharing its region.
    expect(portals.some((p) => Math.hypot(p.gridX - 26, p.gridY - 26) > 3)).toBe(true)
  })

  it('keeps every portal within the grid bounds', () => {
    const tree = {
      lead: { links: [] },
      sections: [{ title: 'Purpose', anchor: 'Purpose', links: ['A', 'B', 'C'], children: [] }],
    }

    const portals = generateSectionPortals(tree, peaks, createRng(9), { width, height })

    for (const portal of portals) {
      expect(portal.gridX).toBeGreaterThanOrEqual(0)
      expect(portal.gridX).toBeLessThan(width)
      expect(portal.gridY).toBeGreaterThanOrEqual(0)
      expect(portal.gridY).toBeLessThan(height)
    }
  })
})
