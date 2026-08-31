import {
  ArticleNotFoundError,
  buildArticleQueryUrl,
  normalizeArticleResponse,
} from '../core/article/normalizeArticle.js'

export class WikipediaArticleError extends Error {
  constructor(message, { cause } = {}) {
    super(message)
    this.name = 'WikipediaArticleError'
    this.cause = cause
  }
}

export { ArticleNotFoundError }

/**
 * Fetches and normalizes a single English Wikipedia article by title,
 * resolving its identity and latest revision information.
 * @param {string} title
 * @param {{ fetchImpl?: typeof fetch, signal?: AbortSignal }} [options]
 * @returns {Promise<object>} Article
 */
export async function fetchWikipediaArticle(title, { fetchImpl = fetch, signal } = {}) {
  const trimmed = title?.trim() ?? ''
  if (!trimmed) {
    throw new WikipediaArticleError('An article title is required')
  }

  const url = buildArticleQueryUrl(trimmed)

  let response
  try {
    response = await fetchImpl(url, { signal })
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw error
    }
    throw new WikipediaArticleError('Failed to reach Wikipedia article API', { cause: error })
  }

  if (!response.ok) {
    throw new WikipediaArticleError(`Wikipedia article API responded with status ${response.status}`)
  }

  const raw = await response.json()
  return normalizeArticleResponse(raw)
}
