import { buildOpenSearchUrl, normalizeOpenSearchResponse } from '../core/search/normalizeSearchResults.js'
import { DEFAULT_LANGUAGE, normalizeLanguage } from '../core/i18n/wikipediaEditions.js'
import { wikimediaFetchInit } from './wikimediaFetch.js'

export class WikipediaSearchError extends Error {
  constructor(message, { cause } = {}) {
    super(message)
    this.name = 'WikipediaSearchError'
    this.cause = cause
  }
}

/**
 * Searches a language Wikipedia's article titles via the OpenSearch API.
 * @param {string} query
 * @param {{ fetchImpl?: typeof fetch, limit?: number, signal?: AbortSignal, language?: string }} [options]
 * @returns {Promise<{ title: string, description: string, url: string }[]>}
 */
export async function searchWikipediaTitles(
  query,
  { fetchImpl = fetch, limit = 10, signal, language = DEFAULT_LANGUAGE } = {},
) {
  const trimmed = query?.trim() ?? ''
  if (!trimmed) {
    return []
  }

  const url = buildOpenSearchUrl(trimmed, { limit, language: normalizeLanguage(language) })

  let response
  try {
    response = await fetchImpl(url, wikimediaFetchInit(signal))
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
