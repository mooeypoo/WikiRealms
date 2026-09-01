import { buildOpenSearchUrl, normalizeOpenSearchResponse } from '../core/search/normalizeSearchResults.js'
import { WIKIMEDIA_USER_AGENT } from '../appInfo.js'

export class WikipediaSearchError extends Error {
  constructor(message, { cause } = {}) {
    super(message)
    this.name = 'WikipediaSearchError'
    this.cause = cause
  }
}

/**
 * Searches English Wikipedia article titles via the OpenSearch API.
 * @param {string} query
 * @param {{ fetchImpl?: typeof fetch, limit?: number, signal?: AbortSignal }} [options]
 * @returns {Promise<{ title: string, description: string, url: string }[]>}
 */
export async function searchWikipediaTitles(query, { fetchImpl = fetch, limit = 10, signal } = {}) {
  const trimmed = query?.trim() ?? ''
  if (!trimmed) {
    return []
  }

  const url = buildOpenSearchUrl(trimmed, { limit })

  let response
  try {
    // Browsers block scripts from setting the real User-Agent header, so
    // MediaWiki's documented workaround (Api-User-Agent) is used instead.
    response = await fetchImpl(url, { signal, headers: { 'Api-User-Agent': WIKIMEDIA_USER_AGENT } })
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw error
    }
    throw new WikipediaSearchError('Failed to reach Wikipedia search API', { cause: error })
  }

  if (!response.ok) {
    throw new WikipediaSearchError(`Wikipedia search API responded with status ${response.status}`)
  }

  const raw = await response.json()
  return normalizeOpenSearchResponse(raw)
}
