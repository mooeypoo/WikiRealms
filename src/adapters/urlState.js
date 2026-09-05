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

const PARAM = 'realm'

/**
 * Reads the realm from a URL.
 *
 * `article` is also accepted because that is what the broken share links
 * said. They never worked, so nobody can be relying on the behaviour — but
 * honouring the spelling costs one line and rescues any link already pasted
 * somewhere.
 */
export function readRealm(search = window.location.search) {
  const params = new URLSearchParams(search)
  const title = params.get(PARAM) ?? params.get('article')
  return title?.trim() || null
}

/** The canonical link to a realm, for sharing. */
export function realmUrl(title, origin = window.location.origin, pathname = window.location.pathname) {
  const params = new URLSearchParams({ [PARAM]: title })
  return `${origin}${pathname}?${params.toString()}`
}

/**
 * Records a move in browser history.
 *
 * The node id rides along in the history state so a later popstate can
 * return to that exact point in the journey, rather than re-deriving one
 * from the title — which would be ambiguous the moment a realm is visited
 * twice by different routes.
 */
export function pushRealm(title, nodeId, { replace = false } = {}) {
  if (typeof history === 'undefined') return
  const url = title ? `?${new URLSearchParams({ [PARAM]: title })}` : window.location.pathname
  const method = replace ? 'replaceState' : 'pushState'
  history[method]({ nodeId, title }, '', url)
}

/**
 * @param {(state: {nodeId?: string, title?: string}, realm: string|null) => void} handler
 * @returns {() => void} unsubscribe
 */
export function onHistoryPop(handler) {
  const listener = (event) => handler(event.state ?? {}, readRealm())
  window.addEventListener('popstate', listener)
  return () => window.removeEventListener('popstate', listener)
}
