/**
 * The address bar as session state.
 *
 * Until now the URL was not part of the app at all: useShare minted links
 * with a `?article=` parameter that nothing ever read, so every share link
 * ever produced opened an empty app, and the browser's own back button left
 * the site instead of retracing the journey.
 *
 * This is the platform boundary for that — reading, writing and listening to
 * history — kept in adapters/ beside snapshotStorage.js rather than in a
 * composable, since it is a browser concern rather than a domain one.
 */

import { DEFAULT_LANGUAGE, isKnownEdition, normalizeLanguage } from '../core/i18n/wikipediaEditions.js'

const REALM_PARAM = 'realm'
const LANG_PARAM = 'lang'

/**
 * Reads the realm title from a URL.
 *
 * `article` is also accepted because that is what the broken share links
 * said. They never worked, so nobody can be relying on the behaviour — but
 * honouring the spelling costs one line and rescues any link already pasted
 * somewhere.
 */
export function readRealm(search = window.location.search) {
  const params = new URLSearchParams(search)
  const title = params.get(REALM_PARAM) ?? params.get('article')
  return title?.trim() || null
}

/**
 * Reads the Wikipedia language edition from a URL.
 * Unknown or missing codes return null so the caller can fall back carefully.
 */
export function readLanguage(search = window.location.search) {
  const params = new URLSearchParams(search)
  const code = params.get(LANG_PARAM)?.trim()
  if (!code || !isKnownEdition(code)) return null
  return code
}

/**
 * Language for a URL that already names a realm.
 *
 * Share links are a (title, language) pair. English omits `lang`, so a
 * missing code means English — never the viewer's search preference. Mixing
 * a bookmarked English title with a leftover Hebrew preference is what
 * produced "English title on he.wikipedia" 404s.
 *
 * @param {string} [search]
 * @returns {string}
 */
export function languageForRealmUrl(search = window.location.search) {
  return normalizeLanguage(readLanguage(search) ?? DEFAULT_LANGUAGE)
}

/**
 * The canonical link to a realm, for sharing.
 *
 * Call as `realmUrl(title, { language, origin, pathname })`.
 * Older call sites used positional `(title, origin, pathname)` — still accepted.
 *
 * @param {string} title
 * @param {string | { language?: string, origin?: string, pathname?: string }} [originOrOptions]
 * @param {string} [pathname]
 */
export function realmUrl(title, originOrOptions, pathname) {
  let language = DEFAULT_LANGUAGE
  let origin = typeof window !== 'undefined' ? window.location.origin : ''
  let path = typeof window !== 'undefined' ? window.location.pathname : '/'

  if (typeof originOrOptions === 'string') {
    origin = originOrOptions
    path = pathname ?? '/'
  } else if (originOrOptions && typeof originOrOptions === 'object') {
    language = originOrOptions.language ?? language
    origin = originOrOptions.origin ?? origin
    path = originOrOptions.pathname ?? path
  }

  const params = new URLSearchParams({ [REALM_PARAM]: title })
  const code = normalizeLanguage(language)
  if (code !== DEFAULT_LANGUAGE) params.set(LANG_PARAM, code)
  return `${origin}${path}?${params.toString()}`
}

/**
 * Records a move in browser history.
 *
 * The node id rides along in the history state so a later popstate can
 * return to that exact point in the journey, rather than re-deriving one
 * from the title — which would be ambiguous the moment a realm is visited
 * twice by different routes.
 *
 * @param {string|null} title
 * @param {string|null} nodeId
 * @param {{ replace?: boolean, language?: string }} [options]
 */
export function pushRealm(title, nodeId, { replace = false, language = DEFAULT_LANGUAGE } = {}) {
  if (typeof history === 'undefined') return
  const code = normalizeLanguage(language)
  let url = window.location.pathname
  if (title) {
    const params = new URLSearchParams({ [REALM_PARAM]: title })
    if (code !== DEFAULT_LANGUAGE) params.set(LANG_PARAM, code)
    url = `?${params.toString()}`
  }
  const method = replace ? 'replaceState' : 'pushState'
  history[method]({ nodeId, title, language: code }, '', url)
}

/**
 * @param {(state: {nodeId?: string, title?: string, language?: string}, realm: string|null, language: string|null) => void} handler
 * @returns {() => void} unsubscribe
 */
export function onHistoryPop(handler) {
  const listener = (event) => handler(event.state ?? {}, readRealm(), readLanguage())
  window.addEventListener('popstate', listener)
  return () => window.removeEventListener('popstate', listener)
}
