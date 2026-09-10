import {
  ArticleNotFoundError,
  buildArticleQueryUrl,
  normalizeArticleResponse,
} from '../core/article/normalizeArticle.js'
import { fetchWikipediaSectionsHtml } from './wikipediaSectionsAdapter.js'
import { fetchArticlePageviews } from './wikipediaPageviewsAdapter.js'
import { parseSectionTree } from '../core/article/parseSectionTree.js'
import { wikimediaFetchInit } from './wikimediaFetch.js'

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
 * generation — see docs/generation.md.
 *
 * Three requests: the action API (identity/revision/categories/links),
 * the REST `with_html` endpoint (section structure), and AQS pageviews
 * (last 30 days of user views). Pageviews soft-fail to null so a metrics
 * outage never blocks arriving in a realm.
 *
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
    // Browsers block scripts from setting the real User-Agent header, so
    // MediaWiki's documented workaround (Api-User-Agent) is used instead.
    response = await fetchImpl(url, wikimediaFetchInit(signal))
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

  // Sections are required for terrain; pageviews are atmosphere. Run them
  // together, then only hard-fail if the section tree did not arrive.
  const [sectionsResult, pageviews] = await Promise.all([
    fetchWikipediaSectionsHtml(article.title, { fetchImpl, signal })
      .then((html) => ({ ok: true, html }))
      .catch((error) => ({ ok: false, error })),
    fetchArticlePageviews(article.title, { fetchImpl, signal, language: article.language }),
  ])

  if (!sectionsResult.ok) {
    if (sectionsResult.error?.name === 'AbortError') {
      throw sectionsResult.error
    }
    throw new WikipediaArticleError('Failed to fetch article section structure', {
      cause: sectionsResult.error,
    })
  }

  return {
    ...article,
    pageviews,
    sections: parseSectionTree(sectionsResult.html),
  }
}
