import { describe, expect, it } from 'vitest'
import { createRng } from '../../../src/engine/generation/rng.js'
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

  it('is deterministic for the same tree, peaks, and rng seed', () => {
    const tree = {
      lead: { links: ['Pet'] },
      sections: [{ title: 'Purpose', anchor: 'Purpose', links: ['Physics'], children: [] }],
    }

    const a = generateSectionPortals(tree, peaks, createRng(42), { width, height })
    const b = generateSectionPortals(tree, peaks, createRng(42), { width, height })

    expect(a).toEqual(b)
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
