import { describe, expect, it, vi } from 'vitest'
import {
  ArticleNotFoundError,
  WikipediaArticleError,
  fetchWikipediaArticle,
} from '../../src/adapters/wikipediaArticleAdapter.js'

function makeFetchResponse(raw, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    json: () => Promise.resolve(raw),
  }
}

function makeRawResponse() {
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
        },
      ],
    },
  }
}

describe('fetchWikipediaArticle', () => {
  it('throws a WikipediaArticleError without fetching for an empty title', async () => {
    const fetchImpl = vi.fn()

    await expect(fetchWikipediaArticle('   ', { fetchImpl })).rejects.toBeInstanceOf(WikipediaArticleError)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('fetches and normalizes the article for a valid title', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(makeFetchResponse(makeRawResponse()))

    const article = await fetchWikipediaArticle('Albert Einstein', { fetchImpl })

    expect(article.title).toBe('Albert Einstein')
    expect(article.latestRevisionId).toBe(1234)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [calledUrl] = fetchImpl.mock.calls[0]
    expect(calledUrl).toContain('titles=Albert+Einstein')
  })

  it('throws ArticleNotFoundError when the page is missing', async () => {
    const raw = { query: { pages: [{ ns: 0, title: 'Nonexistent Article', missing: true }] } }
    const fetchImpl = vi.fn().mockResolvedValue(makeFetchResponse(raw))

    await expect(fetchWikipediaArticle('Nonexistent Article', { fetchImpl })).rejects.toBeInstanceOf(
      ArticleNotFoundError,
    )
  })

  it('throws a WikipediaArticleError when the response is not ok', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(makeFetchResponse({}, { ok: false, status: 503 }))

    await expect(fetchWikipediaArticle('Albert Einstein', { fetchImpl })).rejects.toBeInstanceOf(
      WikipediaArticleError,
    )
  })

  it('throws a WikipediaArticleError when the network request fails', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('network down'))

    await expect(fetchWikipediaArticle('Albert Einstein', { fetchImpl })).rejects.toBeInstanceOf(
      WikipediaArticleError,
    )
  })

  it('rethrows AbortError without wrapping it', async () => {
    const abortError = new Error('aborted')
    abortError.name = 'AbortError'
    const fetchImpl = vi.fn().mockRejectedValue(abortError)

    await expect(fetchWikipediaArticle('Albert Einstein', { fetchImpl })).rejects.toBe(abortError)
  })
})
