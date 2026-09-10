import { WIKIMEDIA_USER_AGENT } from '../appInfo.js'

/**
 * Shared fetch options for every browser call to a Wikimedia API.
 *
 * Browsers block the real `User-Agent` header, so MediaWiki's documented
 * workaround (`Api-User-Agent`) is what we send — one string from
 * `appInfo.js`, used by every adapter.
 *
 * @param {AbortSignal} [signal]
 * @returns {{ signal?: AbortSignal, headers: { 'Api-User-Agent': string } }}
 */
export function wikimediaFetchInit(signal) {
  return {
    signal,
    headers: { 'Api-User-Agent': WIKIMEDIA_USER_AGENT },
  }
}
