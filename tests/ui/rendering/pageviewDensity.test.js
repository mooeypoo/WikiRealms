import { describe, expect, it } from 'vitest'
import {
  SEA_PAGEVIEW_THRESHOLD,
  allowSeaCreatures,
  pageviewDensityScale,
} from '../../../src/ui/rendering/pageviewDensity.js'

describe('pageviewDensityScale', () => {
  it('uses a quiet default when pageviews are unknown', () => {
    expect(pageviewDensityScale(null)).toBe(0.28)
    expect(pageviewDensityScale(undefined)).toBe(0.28)
  })

  it('rises on a log curve between stubs and mega-pages', () => {
    const quiet = pageviewDensityScale(100)
    const mid = pageviewDensityScale(50_000)
    const viral = pageviewDensityScale(5_000_000)
    expect(quiet).toBeLessThan(mid)
    expect(mid).toBeLessThan(viral)
    expect(viral).toBeLessThanOrEqual(1)
    expect(quiet).toBeGreaterThanOrEqual(0.12)
  })
})

describe('allowSeaCreatures', () => {
  it('allows sea above the pageview threshold', () => {
    expect(allowSeaCreatures(SEA_PAGEVIEW_THRESHOLD)).toBe(true)
    expect(allowSeaCreatures(SEA_PAGEVIEW_THRESHOLD - 1)).toBe(false)
  })

  it('allows sea when density alone is high enough', () => {
    expect(allowSeaCreatures(null, 0.5)).toBe(true)
    expect(allowSeaCreatures(null, 0.28)).toBe(false)
  })
})
