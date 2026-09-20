import { actionApiEndpoint } from '../i18n/wikipediaHosts.js'
import { DEFAULT_LANGUAGE, normalizeLanguage } from '../i18n/wikipediaEditions.js'

/**
 * Normalizes a Wikipedia OpenSearch API response into a flat list of results.
 * The raw response has the shape: [term, titles[], descriptions[], urls[]]
 * @param {[string, string[], string[], string[]]} raw
 * @returns {{ title: string, description: string, url: string }[]}
 */
export function normalizeOpenSearchResponse(raw) {
  if (!Array.isArray(raw) || raw.length < 4) {
    return []
  }

  const [, titles, descriptions, urls] = raw

  if (!Array.isArray(titles)) {
    return []
  }

  return titles.map((title, index) => ({
    title,
    description: descriptions?.[index] ?? '',
    url: urls?.[index] ?? '',
  }))
}

/**
 * Builds the OpenSearch request URL for a given query.
 * @param {string} query
 * @param {{ limit?: number, language?: string }} [options]
 */
export function buildOpenSearchUrl(query, { limit = 10, language = DEFAULT_LANGUAGE } = {}) {
  const url = new URL(actionApiEndpoint(normalizeLanguage(language)))
  url.searchParams.set('action', 'opensearch')
  url.searchParams.set('format', 'json')
  url.searchParams.set('formatversion', '2')
  url.searchParams.set('namespace', '0')
  url.searchParams.set('limit', String(limit))
  url.searchParams.set('search', query)
  url.searchParams.set('origin', '*')
  return url.toString()
}
