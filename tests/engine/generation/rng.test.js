import { describe, expect, it } from 'vitest'
import { createRng, deriveSeed, hashStringToSeed } from '../../../src/engine/generation/rng.js'

describe('hashStringToSeed', () => {
  it('is deterministic for the same input', () => {
    expect(hashStringToSeed('en:736@1234:v1')).toBe(hashStringToSeed('en:736@1234:v1'))
  })

  it('produces different hashes for different inputs', () => {
    expect(hashStringToSeed('en:736@1234:v1')).not.toBe(hashStringToSeed('en:736@1235:v1'))
    expect(hashStringToSeed('en:736@1234:v1')).not.toBe(hashStringToSeed('en:736@1234:v2'))
  })

  it('always returns a non-negative 32-bit integer', () => {
    const hash = hashStringToSeed('anything')
    expect(Number.isInteger(hash)).toBe(true)
    expect(hash).toBeGreaterThanOrEqual(0)
    expect(hash).toBeLessThanOrEqual(0xffffffff)
  })
})

describe('deriveSeed', () => {
  it('is deterministic given the same article/revision/engine identity', () => {
    const identity = { articleId: 'en:736', revisionId: 1234, engineVersion: 'v1' }
    expect(deriveSeed(identity)).toBe(deriveSeed({ ...identity }))
  })

  it('changes when the revision changes (staleness should regenerate)', () => {
    const a = deriveSeed({ articleId: 'en:736', revisionId: 1234, engineVersion: 'v1' })
    const b = deriveSeed({ articleId: 'en:736', revisionId: 5678, engineVersion: 'v1' })
    expect(a).not.toBe(b)
  })

  it('changes when the engine version changes', () => {
    const a = deriveSeed({ articleId: 'en:736', revisionId: 1234, engineVersion: 'v1' })
    const b = deriveSeed({ articleId: 'en:736', revisionId: 1234, engineVersion: 'v2' })
    expect(a).not.toBe(b)
  })
})

describe('createRng', () => {
  it('produces the same sequence of values for the same seed', () => {
    const rngA = createRng(42)
    const rngB = createRng(42)

    const sequenceA = Array.from({ length: 10 }, () => rngA())
    const sequenceB = Array.from({ length: 10 }, () => rngB())

    expect(sequenceA).toEqual(sequenceB)
  })

  it('produces different sequences for different seeds', () => {
    const rngA = createRng(1)
    const rngB = createRng(2)

    expect(rngA()).not.toBe(rngB())
  })

  it('produces values within [0, 1)', () => {
    const rng = createRng(7)
    for (let i = 0; i < 100; i++) {
      const value = rng()
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })
})
