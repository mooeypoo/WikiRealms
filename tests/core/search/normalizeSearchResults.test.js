import { describe, expect, it } from 'vitest'
import { buildOpenSearchUrl, normalizeOpenSearchResponse } from '../../../src/core/search/normalizeSearchResults.js'

describe('normalizeOpenSearchResponse', () => {
  it('maps a well-formed OpenSearch response into title/description/url objects', () => {
    const raw = [
      'Ein',
      ['Einstein', 'Einsteinium'],
      ['German physicist', 'A chemical element'],
      ['https://en.wikipedia.org/wiki/Einstein', 'https://en.wikipedia.org/wiki/Einsteinium'],
    ]

    expect(normalizeOpenSearchResponse(raw)).toEqual([
      { title: 'Einstein', description: 'German physicist', url: 'https://en.wikipedia.org/wiki/Einstein' },
      { title: 'Einsteinium', description: 'A chemical element', url: 'https://en.wikipedia.org/wiki/Einsteinium' },
    ])
  })

  it('fills in missing descriptions/urls with empty strings', () => {
    const raw = ['Ein', ['Einstein'], [], []]

    expect(normalizeOpenSearchResponse(raw)).toEqual([{ title: 'Einstein', description: '', url: '' }])
  })

  it('returns an empty array for malformed input', () => {
    expect(normalizeOpenSearchResponse(null)).toEqual([])
    expect(normalizeOpenSearchResponse(undefined)).toEqual([])
    expect(normalizeOpenSearchResponse([])).toEqual([])
    expect(normalizeOpenSearchResponse(['term', 'not-an-array'])).toEqual([])
  })

  it('returns an empty array when there are no titles', () => {
    expect(normalizeOpenSearchResponse(['term', [], [], []])).toEqual([])
  })
})

describe('buildOpenSearchUrl', () => {
  it('builds a URL targeting English Wikipedia with the query and default limit', () => {
    const url = new URL(buildOpenSearchUrl('Ein'))

    expect(url.origin + url.pathname).toBe('https://en.wikipedia.org/w/api.php')
    expect(url.searchParams.get('action')).toBe('opensearch')
    expect(url.searchParams.get('search')).toBe('Ein')
    expect(url.searchParams.get('limit')).toBe('10')
    expect(url.searchParams.get('namespace')).toBe('0')
    expect(url.searchParams.get('origin')).toBe('*')
  })

  it('honors a custom limit', () => {
    const url = new URL(buildOpenSearchUrl('Ein', { limit: 5 }))

    expect(url.searchParams.get('limit')).toBe('5')
  })
})
