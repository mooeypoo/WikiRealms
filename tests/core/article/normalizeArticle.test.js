import { describe, expect, it } from 'vitest'
import {
  ArticleNotFoundError,
  buildArticleQueryUrl,
  normalizeArticleResponse,
} from '../../../src/core/article/normalizeArticle.js'

function makeRawResponse(overrides = {}) {
  return {
    query: {
      pages: [
        {
          pageid: 736,
          ns: 0,
          title: 'Albert Einstein',
          fullurl: 'https://en.wikipedia.org/wiki/Albert_Einstein',
          extract: 'German-born theoretical physicist.',
          revisions: [{ revid: 1234, timestamp: '2026-08-01T00:00:00Z' }],
          categories: [{ ns: 14, title: 'Category:1879 births' }, { ns: 14, title: 'Category:Physicists' }],
          links: [{ ns: 0, title: 'Physics' }, { ns: 0, title: 'Nobel Prize in Physics' }],
          images: [{ ns: 6, title: 'File:Einstein.jpg' }],
          ...overrides,
        },
      ],
    },
  }
}

describe('normalizeArticleResponse', () => {
  it('normalizes a well-formed query response into the Article model', () => {
    const article = normalizeArticleResponse(makeRawResponse())

    expect(article).toEqual({
      articleId: 'en:736',
      title: 'Albert Einstein',
      language: 'en',
      pageId: 736,
      url: 'https://en.wikipedia.org/wiki/Albert_Einstein',
      namespace: 0,
      latestRevisionId: 1234,
      latestRevisionTimestamp: '2026-08-01T00:00:00Z',
      summary: 'German-born theoretical physicist.',
      categories: ['1879 births', 'Physicists'],
      links: ['Physics', 'Nobel Prize in Physics'],
      images: ['File:Einstein.jpg'],
      pageviews: null,
      sectionCount: null,
    })
  })

  it('throws ArticleNotFoundError when the page is missing', () => {
    const raw = makeRawResponse({ missing: true })

    expect(() => normalizeArticleResponse(raw)).toThrow(ArticleNotFoundError)
  })

  it('throws ArticleNotFoundError when there is no page at all', () => {
    expect(() => normalizeArticleResponse({ query: { pages: [] } })).toThrow(ArticleNotFoundError)
    expect(() => normalizeArticleResponse({})).toThrow(ArticleNotFoundError)
  })

  it('falls back to empty arrays/nulls for missing optional fields', () => {
    const raw = {
      query: {
        pages: [
          {
            pageid: 1,
            ns: 0,
            title: 'Stub Article',
          },
        ],
      },
    }

    const article = normalizeArticleResponse(raw)

    expect(article.url).toBe('')
    expect(article.summary).toBe('')
    expect(article.categories).toEqual([])
    expect(article.links).toEqual([])
    expect(article.images).toEqual([])
    expect(article.latestRevisionId).toBeNull()
    expect(article.latestRevisionTimestamp).toBeNull()
  })

  it('uses the provided language when building the articleId', () => {
    const article = normalizeArticleResponse(makeRawResponse(), { language: 'de' })

    expect(article.articleId).toBe('de:736')
    expect(article.language).toBe('de')
  })
})

describe('buildArticleQueryUrl', () => {
  it('builds a URL targeting English Wikipedia with the requested title', () => {
    const url = new URL(buildArticleQueryUrl('Albert Einstein'))

    expect(url.origin + url.pathname).toBe('https://en.wikipedia.org/w/api.php')
    expect(url.searchParams.get('action')).toBe('query')
    expect(url.searchParams.get('titles')).toBe('Albert Einstein')
    expect(url.searchParams.get('redirects')).toBe('1')
    expect(url.searchParams.get('origin')).toBe('*')
  })
})
