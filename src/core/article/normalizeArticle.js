const WIKIPEDIA_QUERY_ENDPOINT = 'https://en.wikipedia.org/w/api.php'

/**
 * Builds the MediaWiki Action API URL to fetch a single article's identity,
 * latest revision, and the minimal content features needed by the app.
 * @param {string} title
 */
export function buildArticleQueryUrl(title) {
  const url = new URL(WIKIPEDIA_QUERY_ENDPOINT)
  url.searchParams.set('action', 'query')
  url.searchParams.set('format', 'json')
  url.searchParams.set('formatversion', '2')
  url.searchParams.set('titles', title)
  url.searchParams.set('redirects', '1')
  url.searchParams.set('prop', 'info|extracts|categories|links|images|revisions')
  url.searchParams.set('inprop', 'url')
  url.searchParams.set('exintro', '1')
  url.searchParams.set('explaintext', '1')
  url.searchParams.set('cllimit', 'max')
  url.searchParams.set('pllimit', 'max')
  url.searchParams.set('imlimit', 'max')
  url.searchParams.set('rvprop', 'ids|timestamp')
  url.searchParams.set('origin', '*')
  return url.toString()
}

/**
 * Strips the "Category:" namespace prefix from a category title.
 * @param {string} title
 */
function stripCategoryPrefix(title) {
  return title.replace(/^Category:/, '')
}

/**
 * Normalizes a MediaWiki Action API `query` response for a single title into
 * the app's `Article` model (see docs/model.md).
 * @param {object} raw
 * @param {{ language?: string }} [options]
 * @returns {object} Article
 */
export function normalizeArticleResponse(raw, { language = 'en' } = {}) {
  const page = raw?.query?.pages?.[0]

  if (!page) {
    throw new ArticleNotFoundError('Wikipedia API response did not contain a page')
  }

  if (page.missing) {
    throw new ArticleNotFoundError(`No Wikipedia article found for "${page.title}"`)
  }

  const revision = page.revisions?.[0]

  return {
    articleId: `${language}:${page.pageid}`,
    title: page.title,
    language,
    pageId: page.pageid,
    url: page.fullurl ?? '',
    namespace: page.ns,
    latestRevisionId: revision?.revid ?? null,
    latestRevisionTimestamp: revision?.timestamp ?? null,
    summary: page.extract ?? '',
    categories: (page.categories ?? []).map((category) => stripCategoryPrefix(category.title)),
    links: (page.links ?? []).map((link) => link.title),
    images: (page.images ?? []).map((image) => image.title),
    // Not fetched in MVP v1; left as explicit placeholders for future milestones.
    pageviews: null,
    sectionCount: null,
  }
}

export class ArticleNotFoundError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ArticleNotFoundError'
  }
}
