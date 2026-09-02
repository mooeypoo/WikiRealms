import { describe, expect, it } from 'vitest'
import { generateWorld } from '../../../src/engine/generation/world.js'
import { CURRENT_ENGINE_VERSION } from '../../../src/engine/generation/engineVersion.js'

function makeArticle(overrides = {}) {
  return {
    articleId: 'en:736',
    title: 'Albert Einstein',
    latestRevisionId: 1234,
    summary: 'German-born theoretical physicist.',
    categories: ['Physicists', '1879 births'],
    links: ['Physics', 'Nobel Prize in Physics', 'General relativity'],
    images: ['Einstein.jpg'],
    sections: {
      lead: { ownSize: 200, links: ['Physics'], citationCount: 3, citationDensity: 0.015 },
      citationCount: 10,
      totalSize: 500,
      sections: [
        { title: 'Early life', anchor: 'Early_life', ownSize: 150, subtreeSize: 150, links: ['Germany'], citationCount: 5, citationDensity: 0.033, children: [] },
        {
          title: 'Career',
          anchor: 'Career',
          ownSize: 100,
          subtreeSize: 150,
          links: ['Nobel Prize in Physics'],
          children: [
            {
              title: 'Relativity',
              anchor: 'Relativity',
              ownSize: 50,
              subtreeSize: 50,
              links: ['General relativity'],
              citationCount: 2,
              citationDensity: 0.04,
              children: [],
            },
          ],
        },
      ],
    },
    ...overrides,
  }
}

describe('generateWorld', () => {
  it('produces identical terrain and portals for the same article/revision/engine version', () => {
    const worldA = generateWorld(makeArticle(), { width: 16, height: 16 })
    const worldB = generateWorld(makeArticle(), { width: 16, height: 16 })

    expect(Array.from(worldA.terrain.heightMap)).toEqual(Array.from(worldB.terrain.heightMap))
    expect(worldA.portals).toEqual(worldB.portals)
    expect(worldA.seed).toBe(worldB.seed)
    expect(worldA.worldId).toBe(worldB.worldId)
  })

  it('produces a different world when the revision changes (staleness)', () => {
    const worldA = generateWorld(makeArticle({ latestRevisionId: 1234 }), { width: 16, height: 16 })
    const worldB = generateWorld(makeArticle({ latestRevisionId: 5678 }), { width: 16, height: 16 })

    expect(worldA.seed).not.toBe(worldB.seed)
    expect(Array.from(worldA.terrain.heightMap)).not.toEqual(Array.from(worldB.terrain.heightMap))
  })

  it('produces a different world for a different engine version', () => {
    const worldA = generateWorld(makeArticle(), { width: 16, height: 16, engineVersion: 'v1' })
    const worldB = generateWorld(makeArticle(), { width: 16, height: 16, engineVersion: 'v2' })

    expect(worldA.seed).not.toBe(worldB.seed)
  })

  it('carries the article and revision identity, and defaults to the current engine version', () => {
    const world = generateWorld(makeArticle(), { width: 8, height: 8 })

    expect(world.articleId).toBe('en:736')
    expect(world.revisionId).toBe(1234)
    expect(world.engineVersion).toBe(CURRENT_ENGINE_VERSION)
    expect(world.worldId).toBe(`en:736@1234:${CURRENT_ENGINE_VERSION}`)
    expect(world.citationCount).toBe(10)
  })

  it('uses the injected clock for generatedAt', () => {
    const world = generateWorld(makeArticle(), { width: 4, height: 4, now: () => '2026-08-31T00:00:00Z' })

    expect(world.generatedAt).toBe('2026-08-31T00:00:00Z')
  })

  it('generates one portal per (section, distinct link) pair, including the lead', () => {
    const world = generateWorld(makeArticle(), { width: 16, height: 16 })

    // lead(Physics) + Early life(Germany) + Career(Nobel Prize in Physics) + Relativity(General relativity)
    expect(world.portals).toHaveLength(4)
    expect(world.portals.every((p) => p.origin === 'article-link')).toBe(true)
  })

  it('preserves citation metadata for section peaks', () => {
    const world = generateWorld(makeArticle(), { width: 16, height: 16 })

    expect(world.terrain.peaks.find((peak) => peak.title === 'Early life')).toMatchObject({
      citationCount: 5,
      citationDensity: 0.033,
    })
  })

  it('degrades gracefully to an empty section tree when article.sections is missing', () => {
    const article = makeArticle()
    delete article.sections

    const world = generateWorld(article, { width: 8, height: 8 })

    expect(world.portals).toEqual([])
    expect(world.terrain.heightMap).toHaveLength(64)
  })
})
