import { describe, expect, it } from 'vitest'
import { createRng } from '../../../src/engine/generation/rng.js'
import { generatePortals } from '../../../src/engine/generation/portals.js'

describe('generatePortals', () => {
  it('creates one portal per link, up to the cap', () => {
    const links = ['A', 'B', 'C']
    const portals = generatePortals(links, createRng(1), { width: 10, height: 10 })

    expect(portals).toHaveLength(3)
    expect(portals.map((p) => p.targetArticleId)).toEqual(links)
  })

  it('caps the number of portals for articles with many links', () => {
    const links = Array.from({ length: 100 }, (_, i) => `Link ${i}`)
    const portals = generatePortals(links, createRng(1), { width: 20, height: 20 })

    expect(portals.length).toBeLessThan(links.length)
  })

  it('returns an empty array for an article with no links', () => {
    expect(generatePortals([], createRng(1), { width: 10, height: 10 })).toEqual([])
    expect(generatePortals(undefined, createRng(1), { width: 10, height: 10 })).toEqual([])
  })

  it('is deterministic for the same links and rng seed', () => {
    const links = ['A', 'B', 'C', 'D']
    const portalsA = generatePortals(links, createRng(42), { width: 10, height: 10 })
    const portalsB = generatePortals(links, createRng(42), { width: 10, height: 10 })

    expect(portalsA).toEqual(portalsB)
  })

  it('places every portal within the grid bounds', () => {
    const links = ['A', 'B', 'C', 'D', 'E']
    const portals = generatePortals(links, createRng(3), { width: 5, height: 5 })

    for (const portal of portals) {
      expect(portal.gridX).toBeGreaterThanOrEqual(0)
      expect(portal.gridX).toBeLessThan(5)
      expect(portal.gridY).toBeGreaterThanOrEqual(0)
      expect(portal.gridY).toBeLessThan(5)
      expect(portal.origin).toBe('article-link')
    }
  })

  it('avoids placing two portals on the same cell when space allows', () => {
    const links = ['A', 'B', 'C', 'D', 'E', 'F']
    const portals = generatePortals(links, createRng(9), { width: 10, height: 10 })

    const positions = new Set(portals.map((p) => `${p.gridX},${p.gridY}`))
    expect(positions.size).toBe(portals.length)
  })
})
