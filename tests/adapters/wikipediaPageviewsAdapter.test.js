import { describe, expect, it, vi } from 'vitest'
import {
  AQS_PAGEVIEWS_ORIGIN,
  AQS_PAGEVIEWS_PROXY_PREFIX,
  buildPageviewsUrl,
  fetchArticlePageviews,
  formatPageviewsDay,
  sumPageviewsResponse,
} from '../../src/adapters/wikipediaPageviewsAdapter.js'
import { WIKIMEDIA_USER_AGENT } from '../../src/appInfo.js'

describe('formatPageviewsDay', () => {
  it('formats UTC dates as YYYYMMDD', () => {
    expect(formatPageviewsDay(new Date(Date.UTC(2026, 8, 9)))).toBe('20260909')
  })
})

describe('buildPageviewsUrl', () => {
  it('covers the last 30 complete UTC days ending yesterday via the browser proxy', () => {
    const now = new Date(Date.UTC(2026, 8, 10, 15, 0, 0))
    // jsdom provides window, so the default root is the same-origin proxy.
    expect(buildPageviewsUrl('Albert Einstein', { now })).toBe(
      `${AQS_PAGEVIEWS_PROXY_PREFIX}/metrics/pageviews/per-article/en.wikipedia/all-access/user/Albert_Einstein/daily/20260811/20260909`,
    )
  })

  it('can target AQS directly when an absolute root is passed', () => {
    const now = new Date(Date.UTC(2026, 8, 10, 15, 0, 0))
    expect(buildPageviewsUrl('Albert Einstein', { now, apiRoot: AQS_PAGEVIEWS_ORIGIN })).toBe(
      `${AQS_PAGEVIEWS_ORIGIN}/metrics/pageviews/per-article/en.wikipedia/all-access/user/Albert_Einstein/daily/20260811/20260909`,
    )
  })

  it('encodes titles and respects language', () => {
    const now = new Date(Date.UTC(2026, 0, 31))
    expect(buildPageviewsUrl('C++', { language: 'de', days: 7, now })).toContain(
      'de.wikipedia/all-access/user/C%2B%2B/daily/20260124/20260130',
    )
  })
})

describe('sumPageviewsResponse', () => {
  it('sums daily views', () => {
    expect(sumPageviewsResponse({ items: [{ views: 10 }, { views: 20 }] })).toBe(30)
  })

  it('returns null for empty or missing items', () => {
    expect(sumPageviewsResponse({})).toBeNull()
    expect(sumPageviewsResponse({ items: [] })).toBeNull()
  })
})

describe('fetchArticlePageviews', () => {
  it('returns null for an empty title without fetching', async () => {
    const fetchImpl = vi.fn()
    expect(await fetchArticlePageviews('  ', { fetchImpl })).toBeNull()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('sums a successful AQS response and sends the shared Api-User-Agent', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [{ views: 100 }, { views: 250 }] }),
    })
    const now = new Date(Date.UTC(2026, 8, 10))

    expect(await fetchArticlePageviews('Saturn', { fetchImpl, now })).toBe(350)
    expect(fetchImpl).toHaveBeenCalledOnce()
    const [url, options] = fetchImpl.mock.calls[0]
    expect(url).toContain('Saturn')
    expect(url.startsWith(AQS_PAGEVIEWS_PROXY_PREFIX)).toBe(true)
    expect(options.headers['Api-User-Agent']).toBe(WIKIMEDIA_USER_AGENT)
  })

  it('soft-fails to null on HTTP errors', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 404 })
    expect(await fetchArticlePageviews('Missing', { fetchImpl })).toBeNull()
  })

  it('soft-fails to null on network errors', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('offline'))
    expect(await fetchArticlePageviews('Saturn', { fetchImpl })).toBeNull()
  })

  it('rethrows AbortError', async () => {
    const abortError = new Error('aborted')
    abortError.name = 'AbortError'
    const fetchImpl = vi.fn().mockRejectedValue(abortError)
    await expect(fetchArticlePageviews('Saturn', { fetchImpl })).rejects.toBe(abortError)
  })
})
