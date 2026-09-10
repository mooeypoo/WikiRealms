import { describe, expect, it } from 'vitest'
import {
  CREATURE_FAMILY,
  WANDERER_FLOOR,
  classifyCategory,
  computeCreatureMix,
  countFamilyHits,
  pickFamilyFromMix,
} from '../../../src/ui/rendering/creatureTaxonomy.js'

describe('classifyCategory', () => {
  it('maps topical titles to families', () => {
    expect(classifyCategory('Mammals of Europe')).toBe(CREATURE_FAMILY.nature)
    expect(classifyCategory('Mathematical physics')).toBe(CREATURE_FAMILY.science)
    expect(classifyCategory('British painters')).toBe(CREATURE_FAMILY.arts)
    expect(classifyCategory('Wars involving France')).toBe(CREATURE_FAMILY.history)
    expect(classifyCategory('Cities in Italy')).toBe(CREATURE_FAMILY.places)
    expect(classifyCategory('Olympic sports')).toBe(CREATURE_FAMILY.sport)
  })

  it('ignores maintenance leftovers', () => {
    expect(classifyCategory('Articles with short description')).toBeNull()
    expect(classifyCategory('CS1: long volume value')).toBeNull()
    expect(classifyCategory('All stub articles')).toBeNull()
  })

  it('prefers the longest matching stem', () => {
    // "mathematical" is longer than a stray shorter hit elsewhere.
    expect(classifyCategory('Mathematical physics')).toBe(CREATURE_FAMILY.science)
  })
})

describe('computeCreatureMix', () => {
  it('is all wanderer when nothing matches', () => {
    const mix = computeCreatureMix(['Articles with short description'])
    expect(mix[CREATURE_FAMILY.wanderer]).toBe(1)
    expect(mix[CREATURE_FAMILY.nature]).toBe(0)
  })

  it('always keeps a wanderer floor when topics match', () => {
    const mix = computeCreatureMix(['Mammals', 'Birds of Asia'])
    expect(mix[CREATURE_FAMILY.wanderer]).toBeCloseTo(WANDERER_FLOOR)
    expect(mix[CREATURE_FAMILY.nature]).toBeCloseTo(1 - WANDERER_FLOOR)
    const sum = Object.values(mix).reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(1)
  })

  it('splits topical weight across families that hit', () => {
    const mix = computeCreatureMix(['Mammals', 'Olympic sports'])
    expect(mix[CREATURE_FAMILY.nature]).toBeGreaterThan(0)
    expect(mix[CREATURE_FAMILY.sport]).toBeGreaterThan(0)
    expect(mix[CREATURE_FAMILY.nature]).toBeCloseTo(mix[CREATURE_FAMILY.sport])
  })

  it('is deterministic', () => {
    const cats = ['Astronomy', 'History of science']
    expect(computeCreatureMix(cats)).toEqual(computeCreatureMix(cats))
  })
})

describe('pickFamilyFromMix', () => {
  it('walks the cumulative weights', () => {
    const mix = {
      [CREATURE_FAMILY.nature]: 0.5,
      [CREATURE_FAMILY.science]: 0,
      [CREATURE_FAMILY.arts]: 0,
      [CREATURE_FAMILY.history]: 0,
      [CREATURE_FAMILY.places]: 0,
      [CREATURE_FAMILY.sport]: 0,
      [CREATURE_FAMILY.wanderer]: 0.5,
    }
    expect(pickFamilyFromMix(mix, 0)).toBe(CREATURE_FAMILY.nature)
    expect(pickFamilyFromMix(mix, 0.49)).toBe(CREATURE_FAMILY.nature)
    expect(pickFamilyFromMix(mix, 0.5)).toBe(CREATURE_FAMILY.wanderer)
  })
})

describe('countFamilyHits', () => {
  it('counts each matching category once', () => {
    const counts = countFamilyHits(['Mammals', 'Birds', 'Unrelated fluff'])
    expect(counts[CREATURE_FAMILY.nature]).toBe(2)
  })
})
