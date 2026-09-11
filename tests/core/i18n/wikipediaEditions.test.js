import { describe, expect, it } from 'vitest'
import {
  DEFAULT_LANGUAGE,
  getEdition,
  isKnownEdition,
  listEditions,
  normalizeLanguage,
  wikipediaApiRoot,
} from '../../../src/core/i18n/wikipediaEditions.js'
import { realmId, jump, visit, createVisitGraph, journeyForLanguage } from '../../../src/core/traversal/visitGraph.js'

describe('wikipediaEditions catalog', () => {
  it('includes every open Wikipedia and a featured MVP subset', () => {
    const all = listEditions()
    const featured = listEditions({ featuredOnly: true })

    expect(all.length).toBeGreaterThan(300)
    expect(featured.map((edition) => edition.code).sort()).toEqual(['de', 'en', 'es', 'fa', 'fr', 'he'])
  })

  it('knows RTL and sentence-model metadata', () => {
    expect(getEdition('he')).toMatchObject({ dir: 'rtl', sentenceModel: 'unicode-punct', lushnessSupport: 'relative' })
    expect(getEdition('fa')).toMatchObject({ dir: 'rtl', sentenceModel: 'unicode-punct', lushnessSupport: 'relative' })
    expect(getEdition('zh')).toMatchObject({ sentenceModel: 'char-estimate', lushnessSupport: 'experimental' })
    expect(getEdition('en')).toMatchObject({ dir: 'ltr', sentenceModel: 'latin-punct', lushnessSupport: 'full' })
  })

  it('normalizes unknown codes to English', () => {
    expect(isKnownEdition('nope')).toBe(false)
    expect(normalizeLanguage('nope')).toBe(DEFAULT_LANGUAGE)
    expect(wikipediaApiRoot('de')).toBe('https://de.wikipedia.org/w/api.php')
  })
})

describe('language-aware realm identity', () => {
  it('keeps the same title on two editions as different realms', () => {
    let journey = jump(createVisitGraph(), 'Paris', { language: 'en' })
    journey = jump(journey, 'Paris', { language: 'fr' })

    expect(Object.keys(journey.realms).sort()).toEqual(['r:en:Paris', 'r:fr:Paris'])
    expect(realmId('Paris', 'fr')).toBe('r:fr:Paris')
  })

  it('filters the trail to one language for display', () => {
    let journey = visit(jump(createVisitGraph(), 'Saturn', { language: 'en' }), 'Titan', { language: 'en' })
    journey = jump(journey, 'שבתאי', { language: 'he' })

    const english = journeyForLanguage(journey, 'en')
    expect(Object.keys(english.realms).sort()).toEqual(['r:en:Saturn', 'r:en:Titan'])
    expect(english.edges).toHaveLength(1)
  })
})
