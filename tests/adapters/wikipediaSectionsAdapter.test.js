import { describe, expect, it, vi } from 'vitest'
import { buildSectionsUrl, fetchWikipediaSectionsHtml, WikipediaSectionsError } from '../../src/adapters/wikipediaSectionsAdapter.js'
import { WIKIMEDIA_USER_AGENT } from '../../src/appInfo.js'

function makeFetchResponse(raw, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    json: () => Promise.resolve(raw),
  }
}

describe('buildSectionsUrl', () => {
  it('builds a REST API url targeting the core page/with_html endpoint', () => {
    expect(buildSectionsUrl('Albert Einstein')).toBe(
      'https://en.wikipedia.org/w/rest.php/v1/page/Albert_Einstein/with_html',
    )
  })

  it('encodes special characters in the title', () => {
    expect(buildSectionsUrl('C++')).toBe('https://en.wikipedia.org/w/rest.php/v1/page/C%2B%2B/with_html')
  })
})

describe('fetchWikipediaSectionsHtml', () => {
  it('throws without fetching for an empty title', async () => {
    const fetchImpl = vi.fn()

    await expect(fetchWikipediaSectionsHtml('   ', { fetchImpl })).rejects.toBeInstanceOf(WikipediaSectionsError)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('returns the html field from a successful response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(makeFetchResponse({ html: '<html>hi</html>' }))

    const html = await fetchWikipediaSectionsHtml('Albert Einstein', { fetchImpl })

    expect(html).toBe('<html>hi</html>')
    const [calledUrl, calledOptions] = fetchImpl.mock.calls[0]
    expect(calledUrl).toContain('/page/Albert_Einstein/with_html')
    expect(calledOptions.headers['Api-User-Agent']).toBe(WIKIMEDIA_USER_AGENT)
  })

  it('throws a WikipediaSectionsError when the response is not ok', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(makeFetchResponse({}, { ok: false, status: 404 }))

    await expect(fetchWikipediaSectionsHtml('Albert Einstein', { fetchImpl })).rejects.toBeInstanceOf(
      WikipediaSectionsError,
    )
  })

  it('throws a WikipediaSectionsError when the network request fails', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('network down'))

    await expect(fetchWikipediaSectionsHtml('Albert Einstein', { fetchImpl })).rejects.toBeInstanceOf(
      WikipediaSectionsError,
    )
  })

  it('rethrows AbortError without wrapping it', async () => {
    const abortError = new Error('aborted')
    abortError.name = 'AbortError'
    const fetchImpl = vi.fn().mockRejectedValue(abortError)

    await expect(fetchWikipediaSectionsHtml('Albert Einstein', { fetchImpl })).rejects.toBe(abortError)
  })
})
