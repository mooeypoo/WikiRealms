/**
 * The journey: which realms you have been to, how they connect, and the
 * order you moved between them.
 *
 * THIS WAS A TREE, AND THE TREE WAS WRONG.
 *
 * A node used to be one ARRIVAL, so reaching a realm by two routes made two
 * nodes. Real journeys disprove it immediately: Spacetime diagram → Spacetime,
 * and later Physics → Spacetime, is one realm reached twice, not two places.
 * The app already says so — worldId derives from articleId, revision and
 * engine version, so both arrivals generate the byte-identical world. A model
 * that calls them different contradicts the generator.
 *
 * Real journeys also LOOP: Spacetime → Template talk → Physics → Spacetime.
 * A tree cannot hold a cycle at all, so the old model was not merely
 * redundant, it was unable to record what happened.
 *
 * So there are two structures here, which is the split a browser makes:
 *
 *   - a GRAPH of realms and the transitions between them: where you have
 *     been and how those places connect. Cycles are ordinary.
 *   - a HISTORY: the order you actually moved, which is what back and
 *     forward walk. A graph has no unique "previous"; a history does.
 *
 * A realm's identity is (language, title): the same title on German and
 * English Wikipedia are different worlds. Trails may hold multiple
 * languages in one graph; the UI usually filters to the active edition.
 *
 * Pure and serializable: every function takes a journey and returns a new
 * one, and the whole thing round-trips through JSON.
 */

import { DEFAULT_LANGUAGE, isKnownEdition, normalizeLanguage } from '../i18n/wikipediaEditions.js'

/**
 * @typedef {object} Realm
 * @property {string} id
 * @property {string} title
 * @property {string} language Wikipedia edition code
 * @property {number} order when it was first reached, for stable layout
 */

/**
 * @typedef {object} Journey
 * @property {Record<string, Realm>} realms
 * @property {Array<{from: string, to: string}>} edges transitions taken, once each
 * @property {string[]} history realm ids in the order they were visited
 * @property {number} cursor index into history; back and forward move it
 * @property {number} nextOrder
 */

/** @returns {Journey} */
export function createVisitGraph() {
  return { realms: {}, edges: [], history: [], cursor: -1, nextOrder: 1 }
}

function clone(journey) {
  return {
    realms: { ...journey.realms },
    edges: [...journey.edges],
    history: [...journey.history],
    cursor: journey.cursor,
    nextOrder: journey.nextOrder,
  }
}

/**
 * A realm's identity is its language edition and title. Two arrivals at
 * the same title on the same Wikipedia are the same place.
 *
 * @param {string} title
 * @param {string} [language]
 */
export function realmId(title, language = DEFAULT_LANGUAGE) {
  return `r:${normalizeLanguage(language)}:${title}`
}

/**
 * Migrates a pre-4.0 realm id (`r:Title`) or returns a modern id unchanged.
 * @param {string} id
 * @param {string} [fallbackLanguage]
 */
export function migrateRealmId(id, fallbackLanguage = DEFAULT_LANGUAGE) {
  if (typeof id !== 'string' || !id.startsWith('r:')) return id
  const rest = id.slice(2)
  const colon = rest.indexOf(':')
  if (colon === -1) return realmId(rest, fallbackLanguage)
  const maybeLang = rest.slice(0, colon)
  // Modern ids always start with a known edition code: r:en:Saturn
  if (isKnownEdition(maybeLang)) return id
  return realmId(rest, fallbackLanguage)
}

export function currentRealm(journey) {
  const id = journey.history[journey.cursor]
  return id ? (journey.realms[id] ?? null) : null
}

export function currentTitle(journey) {
  return currentRealm(journey)?.title ?? null
}

export function currentLanguage(journey) {
  return currentRealm(journey)?.language ?? null
}

/** Kept for callers that speak in node ids; a realm id IS the node id now. */
export function currentId(journey) {
  return journey.history[journey.cursor] ?? null
}

export function realmsOf(journey) {
  return Object.values(journey.realms).sort((a, b) => a.order - b.order)
}

/**
 * Realms for one Wikipedia edition — the trail the UI usually shows.
 * @param {Journey} journey
 * @param {string} language
 */
export function realmsForLanguage(journey, language) {
  const code = normalizeLanguage(language)
  return realmsOf(journey).filter((realm) => realm.language === code)
}

/**
 * A journey view containing only realms/edges/history for one language.
 * Used so the trail map does not mix editions.
 * @param {Journey} journey
 * @param {string} language
 * @returns {Journey}
 */
export function journeyForLanguage(journey, language) {
  const code = normalizeLanguage(language)
  const realms = {}
  for (const realm of Object.values(journey.realms)) {
    if (realm.language === code) realms[realm.id] = realm
  }
  const edges = journey.edges.filter((edge) => realms[edge.from] && realms[edge.to])
  const history = journey.history.filter((id) => realms[id])
  let cursor = -1
  const current = currentId(journey)
  if (current && realms[current]) {
    cursor = history.lastIndexOf(current)
  } else if (history.length) {
    cursor = history.length - 1
  }
  return {
    realms,
    edges,
    history,
    cursor,
    nextOrder: journey.nextOrder,
  }
}

export function neighboursOf(journey, id) {
  return journey.edges.filter((edge) => edge.from === id).map((edge) => journey.realms[edge.to])
}

function ensureRealm(journey, title, language) {
  const code = normalizeLanguage(language)
  const id = realmId(title, code)
  if (journey.realms[id]) return id

  journey.realms[id] = { id, title, language: code, order: journey.nextOrder }
  journey.nextOrder += 1
  return id
}

function pushHistory(journey, id) {
  // Moving after going back discards what was ahead, exactly as a browser
  // does — the forward path is no longer where you are going.
  journey.history = [...journey.history.slice(0, journey.cursor + 1), id]
  journey.cursor = journey.history.length - 1
}

function connect(journey, from, to) {
  if (!from || from === to) return
  if (journey.edges.some((edge) => edge.from === from && edge.to === to)) return
  journey.edges.push({ from, to })
}

/**
 * Travel: arriving somewhere through a portal from where you are. Records
 * both the realm and the connection, which is what makes the graph a map
 * of the part of Wikipedia this session has walked.
 *
 * @param {Journey} journey
 * @param {string} title
 * @param {{ language?: string }} [options]
 */
export function visit(journey, title, { language } = {}) {
  if (!title) return journey
  const code = normalizeLanguage(language ?? currentLanguage(journey) ?? DEFAULT_LANGUAGE)
  if (currentTitle(journey) === title && currentLanguage(journey) === code) return journey

  const next = clone(journey)
  const from = currentId(journey)
  const to = ensureRealm(next, title, code)

  connect(next, from, to)
  pushHistory(next, to)
  return next
}

/**
 * A jump: a search, a shared link, a curated realm. It records no edge,
 * because no portal was taken — claiming a connection that does not exist
 * would put a road on the map where there is none.
 *
 * @param {Journey} journey
 * @param {string} title
 * @param {{ language?: string }} [options]
 */
export function jump(journey, title, { language } = {}) {
  if (!title) return journey
  const code = normalizeLanguage(language ?? currentLanguage(journey) ?? DEFAULT_LANGUAGE)

  const next = clone(journey)
  pushHistory(next, ensureRealm(next, title, code))
  return next
}

/**
 * Returning to a realm already on the map — a trail click, a breadcrumb.
 *
 * It moves history forward, because going somewhere is going somewhere
 * even when you have been before. It records no edge: the viewer teleported
 * rather than walking a link.
 */
export function goTo(journey, id) {
  if (!journey.realms[id] || currentId(journey) === id) return journey

  const next = clone(journey)
  pushHistory(next, id)
  return next
}

export function canGoBack(journey) {
  return journey.cursor > 0
}

export function canGoForward(journey) {
  return journey.cursor >= 0 && journey.cursor < journey.history.length - 1
}

export function goBack(journey) {
  if (!canGoBack(journey)) return journey
  return { ...clone(journey), cursor: journey.cursor - 1 }
}

export function goForward(journey) {
  if (!canGoForward(journey)) return journey
  return { ...clone(journey), cursor: journey.cursor + 1 }
}

/** Titles behind the cursor, oldest first. */
export function backTitles(journey) {
  return journey.history.slice(0, Math.max(0, journey.cursor)).map((id) => journey.realms[id]?.title)
}

/** Titles ahead of the cursor, nearest first. */
export function forwardTitles(journey) {
  return journey.history.slice(journey.cursor + 1).map((id) => journey.realms[id]?.title)
}

/**
 * Rebuilds a journey from a linear history — every session saved before the
 * graph existed.
 *
 * NO EDGES. A 1.0 snapshot recorded only "these articles, in this order":
 * it had no concept of search versus portal, because the app it came from
 * had none either. Chaining consecutive entries — which this used to do —
 * invents a portal between anything that merely happened to follow
 * something else, and it produced visibly false claims: an article reached
 * by searching appeared linked to whatever the viewer had been reading.
 *
 * An edge is a claim about WIKIPEDIA (a link exists between these two
 * articles). A history is a claim about the SESSION (I was here, then
 * there). This shape knows the second and not the first, so it asserts only
 * the second. The map fills in properly from the next portal taken.
 *
 * @param {{ current?: string|null, backstack?: string[], forwardstack?: string[], language?: string }} [state]
 */
export function fromLinearHistory({
  current = null,
  backstack = [],
  forwardstack = [],
  language = DEFAULT_LANGUAGE,
} = {}) {
  const chain = [...backstack, ...(current ? [current] : []), ...forwardstack]
  if (chain.length === 0) return createVisitGraph()

  const code = normalizeLanguage(language)
  let journey = createVisitGraph()
  for (const title of chain) journey = jump(journey, title, { language: code })

  for (let step = 0; step < forwardstack.length; step += 1) journey = goBack(journey)

  return journey
}

/**
 * Rebuilds from the 2.0 per-arrival tree. Realms merge by title, parent
 * links become edges, and the history is the path to where the viewer was —
 * the best that shape can say about the order things happened, since it
 * recorded structure rather than sequence.
 *
 * @param {object} tree
 * @param {{ language?: string }} [options]
 */
export function fromVisitTree(tree, { language = DEFAULT_LANGUAGE } = {}) {
  if (!tree?.nodes) return createVisitGraph()

  const code = normalizeLanguage(language)
  let journey = createVisitGraph()
  const ordered = Object.values(tree.nodes).sort((a, b) => order(a.id) - order(b.id))

  for (const node of ordered) {
    const next = clone(journey)
    const to = ensureRealm(next, node.title, code)
    const parent = node.parentId ? tree.nodes[node.parentId] : null
    if (parent) connect(next, realmId(parent.title, code), to)
    journey = next
  }

  const path = []
  let cursor = tree.currentId ? tree.nodes[tree.currentId] : null
  while (cursor) {
    path.unshift(cursor.title)
    cursor = cursor.parentId ? tree.nodes[cursor.parentId] : null
  }

  journey.history = path.map((title) => realmId(title, code))
  journey.cursor = journey.history.length - 1
  return journey
}

/**
 * Rewrites a 3.0 title-only journey into language-aware realm ids.
 * @param {Journey} journey
 * @param {string} [language]
 * @returns {Journey}
 */
export function migrateJourneyLanguages(journey, language = DEFAULT_LANGUAGE) {
  if (!isVisitGraph(journey)) return createVisitGraph()
  const code = normalizeLanguage(language)
  const next = createVisitGraph()
  next.nextOrder = journey.nextOrder

  const idMap = new Map()
  for (const realm of Object.values(journey.realms)) {
    const lang = realm.language ? normalizeLanguage(realm.language) : code
    const id = realmId(realm.title, lang)
    idMap.set(realm.id, id)
    next.realms[id] = {
      id,
      title: realm.title,
      language: lang,
      order: realm.order,
    }
  }

  next.edges = journey.edges
    .map((edge) => ({
      from: idMap.get(edge.from) ?? migrateRealmId(edge.from, code),
      to: idMap.get(edge.to) ?? migrateRealmId(edge.to, code),
    }))
    .filter((edge) => next.realms[edge.from] && next.realms[edge.to])

  next.history = journey.history
    .map((id) => idMap.get(id) ?? migrateRealmId(id, code))
    .filter((id) => next.realms[id])
  next.cursor = Math.min(journey.cursor, next.history.length - 1)
  if (next.history.length === 0) next.cursor = -1
  return next
}

function order(id) {
  const value = Number(String(id).replace(/^\D+/, ''))
  return Number.isFinite(value) ? value : 0
}

/** Guards a journey read back from JSON. */
export function isVisitGraph(value) {
  return Boolean(
    value &&
      typeof value === 'object' &&
      value.realms &&
      typeof value.realms === 'object' &&
      Array.isArray(value.edges) &&
      Array.isArray(value.history) &&
      typeof value.cursor === 'number',
  )
}
