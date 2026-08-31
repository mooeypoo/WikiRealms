import { describe, expect, it } from 'vitest'
import { extractFeatureVector } from '../../../src/engine/generation/featureVector.js'

describe('extractFeatureVector', () => {
  it('returns all-zero features for an article with no content signals', () => {
    const vector = extractFeatureVector({ summary: '', categories: [], links: [], images: [] })

    expect(vector).toEqual({
      summaryLength: 0,
      categoryDensity: 0,
      linkDensity: 0,
      imageDensity: 0,
    })
  })

  it('handles missing optional fields gracefully', () => {
    const vector = extractFeatureVector({})

    expect(vector).toEqual({
      summaryLength: 0,
      categoryDensity: 0,
      linkDensity: 0,
      imageDensity: 0,
    })
  })

  it('normalizes counts into [0, 1], clamped at the soft cap', () => {
    const vector = extractFeatureVector({
      summary: 'a'.repeat(2400), // 2x the soft cap
      categories: Array.from({ length: 30 }), // 2x the soft cap
      links: Array.from({ length: 300 }), // 2x the soft cap
      images: Array.from({ length: 40 }), // 2x the soft cap
    })

    expect(vector.summaryLength).toBe(1)
    expect(vector.categoryDensity).toBe(1)
    expect(vector.linkDensity).toBe(1)
    expect(vector.imageDensity).toBe(1)
  })

  it('is deterministic for the same article', () => {
    const article = { summary: 'hello world', categories: ['A', 'B'], links: ['C'], images: [] }

    expect(extractFeatureVector(article)).toEqual(extractFeatureVector({ ...article }))
  })

  it('produces proportional values below the soft cap', () => {
    const vector = extractFeatureVector({ categories: Array.from({ length: 15 } , (_, i) => i) })
    // 15 categories against a soft cap where half the cap yields ~0.5
    const half = extractFeatureVector({ categories: Array.from({ length: 7 }) })
    expect(half.categoryDensity).toBeLessThan(vector.categoryDensity)
  })
})
