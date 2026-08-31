import { describe, expect, it } from 'vitest'
import { isWorldStale } from '../../../src/core/article/staleness.js'

describe('isWorldStale', () => {
  it('is false when revisions match', () => {
    expect(isWorldStale(1234, 1234)).toBe(false)
  })

  it('is true when revisions differ', () => {
    expect(isWorldStale(1234, 5678)).toBe(true)
  })

  it('is false when there is no previous revision to compare against', () => {
    expect(isWorldStale(null, 1234)).toBe(false)
    expect(isWorldStale(undefined, 1234)).toBe(false)
  })

  it('is false when the current revision is unknown', () => {
    expect(isWorldStale(1234, null)).toBe(false)
  })
})
