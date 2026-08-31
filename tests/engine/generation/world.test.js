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
  })

  it('uses the injected clock for generatedAt', () => {
    const world = generateWorld(makeArticle(), { width: 4, height: 4, now: () => '2026-08-31T00:00:00Z' })

    expect(world.generatedAt).toBe('2026-08-31T00:00:00Z')
  })

  it('generates one portal per outbound link', () => {
    const world = generateWorld(makeArticle(), { width: 16, height: 16 })

    expect(world.portals).toHaveLength(3)
    expect(world.portals.every((p) => p.origin === 'article-link')).toBe(true)
  })
})
