import { wikimediaFetchInit } from './wikimediaFetch.js'

/** Direct AQS origin — used from Node and when an explicit root is passed. */
export const AQS_PAGEVIEWS_ORIGIN = 'https://wikimedia.org/api/rest_v1'

/**
 * Same-origin Vite / Netlify proxy prefix. Browser fetches go here so we
 * can send `Api-User-Agent` without AQS's broken CORS preflight (OPTIONS
 * returns 405 even though GET allows the header).
 */
export const AQS_PAGEVIEWS_PROXY_PREFIX = '/api/aqs'

/**
 * Root for pageviews URLs. Browsers use the proxy; everything else hits AQS.
 * @returns {string}
 */
export function pageviewsApiRoot() {
  if (typeof window !== 'undefined') return AQS_PAGEVIEWS_PROXY_PREFIX
  return AQS_PAGEVIEWS_ORIGIN
}

/**
 * Formats a Date as the YYYYMMDD string the pageviews API wants.
 * @param {Date} date
 */
export function formatPageviewsDay(date) {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}${m}${d}`
}

/**
 * Builds the AQS pageviews URL for the last `days` complete UTC days.
 * Ends yesterday — today's partial day is noisy and often incomplete.
 *
 * @param {string} title
 * @param {{ language?: string, days?: number, now?: Date, apiRoot?: string }} [options]
 */
export function buildPageviewsUrl(title, { language = 'en', days = 30, now = new Date(), apiRoot = pageviewsApiRoot() } = {}) {
  const normalized = title.trim().replace(/ /g, '_')
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1))
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - (days - 1))
  const project = `${language}.wikipedia`
  return `${apiRoot}/metrics/pageviews/per-article/${project}/all-access/user/${encodeURIComponent(normalized)}/daily/${formatPageviewsDay(start)}/${formatPageviewsDay(end)}`
}

/**
 * Sums daily `views` from an AQS pageviews response.
 * @param {object} raw
 * @returns {number|null}
 */
export function sumPageviewsResponse(raw) {
  const items = raw?.items
  if (!Array.isArray(items) || items.length === 0) return null
  let total = 0
  for (const item of items) {
    const views = Number(item?.views)
    if (Number.isFinite(views) && views > 0) total += views
  }
  return total
}

/**
 * Fetches the last 30 days of user pageviews for an English Wikipedia
 * article. Soft-failing callers should catch and treat null as "unknown".
 *
 * Uses the shared `Api-User-Agent` on a same-origin `/api/aqs` proxy in
 * the browser (see vite.config.js / netlify.toml). Hitting AQS directly
 * with that header forces a CORS preflight that AQS answers with 405.
 *
 * @param {string} title
 * @param {{ fetchImpl?: typeof fetch, signal?: AbortSignal, language?: string, days?: number, now?: Date, apiRoot?: string }} [options]
 * @returns {Promise<number|null>}
 */
export async function fetchArticlePageviews(
  title,
  { fetchImpl = fetch, signal, language = 'en', days = 30, now = new Date(), apiRoot = pageviewsApiRoot() } = {},
) {
  const trimmed = title?.trim() ?? ''
  if (!trimmed) return null

  const url = buildPageviewsUrl(trimmed, { language, days, now, apiRoot })

  let response
  try {
    response = await fetchImpl(url, wikimediaFetchInit(signal))
  } catch (error) {
    if (error?.name === 'AbortError') throw error
    return null
  }

  if (!response.ok) return null

  try {
    const raw = await response.json()
    return sumPageviewsResponse(raw)
  } catch {
    return null
  }
}
