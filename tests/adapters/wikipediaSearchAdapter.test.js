import { describe, expect, it, vi } from 'vitest'
import { WikipediaSearchError, searchWikipediaTitles } from '../../src/adapters/wikipediaSearchAdapter.js'

function makeFetchResponse(raw, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    json: () => Promise.resolve(raw),
  }
}

describe('searchWikipediaTitles', () => {
  it('returns an empty array without fetching for an empty query', async () => {
    const fetchImpl = vi.fn()

    const results = await searchWikipediaTitles('   ', { fetchImpl })

    expect(results).toEqual([])
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('fetches and normalizes results for a non-empty query', async () => {
    const raw = ['Ein', ['Einstein'], ['German physicist'], ['https://en.wikipedia.org/wiki/Einstein']]
    const fetchImpl = vi.fn().mockResolvedValue(makeFetchResponse(raw))

    const results = await searchWikipediaTitles('Ein', { fetchImpl })

    expect(results).toEqual([
      { title: 'Einstein', description: 'German physicist', url: 'https://en.wikipedia.org/wiki/Einstein' },
    ])
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [calledUrl] = fetchImpl.mock.calls[0]
    expect(calledUrl).toContain('search=Ein')
  })

  it('throws a WikipediaSearchError when the response is not ok', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(makeFetchResponse([], { ok: false, status: 503 }))

    await expect(searchWikipediaTitles('Ein', { fetchImpl })).rejects.toBeInstanceOf(WikipediaSearchError)
  })

  it('throws a WikipediaSearchError when the network request fails', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('network down'))

    await expect(searchWikipediaTitles('Ein', { fetchImpl })).rejects.toBeInstanceOf(WikipediaSearchError)
  })

  it('rethrows AbortError without wrapping it', async () => {
    const abortError = new Error('aborted')
    abortError.name = 'AbortError'
    const fetchImpl = vi.fn().mockRejectedValue(abortError)

    await expect(searchWikipediaTitles('Ein', { fetchImpl })).rejects.toBe(abortError)
  })
})
