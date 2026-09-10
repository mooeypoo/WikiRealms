import { describe, expect, it } from 'vitest'
import {
  allowSeaCreatures,
  pageviewDensityScale,
} from '../../../src/ui/rendering/pageviewDensity.js'

describe('pageviewDensityScale', () => {
  it('uses a quiet default when pageviews are unknown', () => {
    expect(pageviewDensityScale(null)).toBe(0.28)
    expect(pageviewDensityScale(undefined)).toBe(0.28)
  })

  it('rises with pageviews on a log curve', () => {
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
  it('always allows sea fauna — pageviews only scale how many fish', () => {
    expect(allowSeaCreatures(0)).toBe(true)
    expect(allowSeaCreatures(500)).toBe(true)
    expect(allowSeaCreatures(5_000_000)).toBe(true)
    expect(allowSeaCreatures(null, 0.1)).toBe(true)
  })
})
