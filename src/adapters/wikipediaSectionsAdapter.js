import { wikimediaFetchInit } from './wikimediaFetch.js'
import { sectionsRestUrl } from '../core/i18n/wikipediaHosts.js'
import { DEFAULT_LANGUAGE, normalizeLanguage } from '../core/i18n/wikipediaEditions.js'

export class WikipediaSectionsError extends Error {
  constructor(message, { cause } = {}) {
    super(message)
    this.name = 'WikipediaSectionsError'
    this.cause = cause
  }
}

/**
 * Builds the MediaWiki core REST API URL for a page's rendered HTML.
 * Deliberately NOT using action=parse, which MediaWiki's own API
 * etiquette flags as resource-intensive — this REST endpoint is the
 * lightweight, cacheable alternative (verified to also allow direct
 * cross-origin browser fetches, unlike the action API).
 * @param {string} title
 * @param {{ language?: string }} [options]
 */
export function buildSectionsUrl(title, { language = DEFAULT_LANGUAGE } = {}) {
  return sectionsRestUrl(title, language)
}

/**
 * Fetches the rendered HTML for a language Wikipedia article, used to
 * derive section structure, per-section links, and section anchors (see
 * docs/generation.md — the action API has no concept of sections).
 * @param {string} title
 * @param {{ fetchImpl?: typeof fetch, signal?: AbortSignal, language?: string }} [options]
 * @returns {Promise<string>} the article's rendered HTML
 */
export async function fetchWikipediaSectionsHtml(
  title,
  { fetchImpl = fetch, signal, language = DEFAULT_LANGUAGE } = {},
) {
  const trimmed = title?.trim() ?? ''
  if (!trimmed) {
    throw new WikipediaSectionsError('An article title is required')
  }

  const url = buildSectionsUrl(trimmed, { language: normalizeLanguage(language) })

  let response
  try {
    response = await fetchImpl(url, wikimediaFetchInit(signal))
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw error
    }
    throw new WikipediaSectionsError('Failed to reach Wikipedia REST API', { cause: error })
  }

  if (!response.ok) {
    throw new WikipediaSectionsError(`Wikipedia REST API responded with status ${response.status}`)
  }

  const data = await response.json()
  return data.html ?? ''
}
