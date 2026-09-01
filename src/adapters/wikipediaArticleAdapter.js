import {
  ArticleNotFoundError,
  buildArticleQueryUrl,
  normalizeArticleResponse,
} from '../core/article/normalizeArticle.js'
import { fetchWikipediaSectionsHtml } from './wikipediaSectionsAdapter.js'
import { parseSectionTree } from '../core/article/parseSectionTree.js'

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
 * resolving its identity and latest revision information, and attaching
 * its parsed section tree (article.sections) for section-driven world
 * generation — see docs/generation.md. Two requests total: the action
 * API (identity/revision/categories/links) and the REST `with_html`
 * endpoint (section structure, deliberately not `action=parse` — see
 * docs/generation.md's fetching notes).
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
  const article = normalizeArticleResponse(raw)

  let html
  try {
    html = await fetchWikipediaSectionsHtml(article.title, { fetchImpl, signal })
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw error
    }
    throw new WikipediaArticleError('Failed to fetch article section structure', { cause: error })
  }

  return { ...article, sections: parseSectionTree(html) }
}
