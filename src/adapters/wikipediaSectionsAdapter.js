const REST_BASE = 'https://en.wikipedia.org/w/rest.php/v1/page'

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
 */
export function buildSectionsUrl(title) {
  const normalized = title.trim().replace(/ /g, '_')
  return `${REST_BASE}/${encodeURIComponent(normalized)}/with_html`
}

/**
 * Fetches the rendered HTML for an English Wikipedia article, used to
 * derive section structure, per-section links, and section anchors (see
 * docs/generation.md — the action API has no concept of sections).
 * @param {string} title
 * @param {{ fetchImpl?: typeof fetch, signal?: AbortSignal }} [options]
 * @returns {Promise<string>} the article's rendered HTML
 */
export async function fetchWikipediaSectionsHtml(title, { fetchImpl = fetch, signal } = {}) {
  const trimmed = title?.trim() ?? ''
  if (!trimmed) {
    throw new WikipediaSectionsError('An article title is required')
  }

  const url = buildSectionsUrl(trimmed)

  let response
  try {
    response = await fetchImpl(url, { signal })
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
