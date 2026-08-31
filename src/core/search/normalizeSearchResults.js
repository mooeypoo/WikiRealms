const WIKIPEDIA_OPENSEARCH_ENDPOINT = 'https://en.wikipedia.org/w/api.php'

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
 * @param {{ limit?: number }} [options]
 */
export function buildOpenSearchUrl(query, { limit = 10 } = {}) {
  const url = new URL(WIKIPEDIA_OPENSEARCH_ENDPOINT)
  url.searchParams.set('action', 'opensearch')
  url.searchParams.set('format', 'json')
  url.searchParams.set('formatversion', '2')
  url.searchParams.set('namespace', '0')
  url.searchParams.set('limit', String(limit))
  url.searchParams.set('search', query)
  url.searchParams.set('origin', '*')
  return url.toString()
}
