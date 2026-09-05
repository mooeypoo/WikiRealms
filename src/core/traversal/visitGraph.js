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
 * Pure and serializable: every function takes a journey and returns a new
 * one, and the whole thing round-trips through JSON.
 */

/**
 * @typedef {object} Realm
 * @property {string} id
 * @property {string} title
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
 * A realm's identity is its title. Two arrivals at the same title are the
 * same place, because they generate the same world.
 */
export function realmId(title) {
  return `r:${title}`
}

export function currentRealm(journey) {
  const id = journey.history[journey.cursor]
  return id ? (journey.realms[id] ?? null) : null
}

export function currentTitle(journey) {
  return currentRealm(journey)?.title ?? null
}

/** Kept for callers that speak in node ids; a realm id IS the node id now. */
export function currentId(journey) {
  return journey.history[journey.cursor] ?? null
}

export function realmsOf(journey) {
  return Object.values(journey.realms).sort((a, b) => a.order - b.order)
}

export function neighboursOf(journey, id) {
  return journey.edges.filter((edge) => edge.from === id).map((edge) => journey.realms[edge.to])
}

function ensureRealm(journey, title) {
  const id = realmId(title)
  if (journey.realms[id]) return id

  journey.realms[id] = { id, title, order: journey.nextOrder }
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
 */
export function visit(journey, title) {
  if (!title) return journey
  if (currentTitle(journey) === title) return journey

  const next = clone(journey)
  const from = currentId(journey)
  const to = ensureRealm(next, title)

  connect(next, from, to)
  pushHistory(next, to)
  return next
}

/**
 * A jump: a search, a shared link, a curated realm. It records no edge,
 * because no portal was taken — claiming a connection that does not exist
 * would put a road on the map where there is none.
 */
export function jump(journey, title) {
  if (!title) return journey

  const next = clone(journey)
  pushHistory(next, ensureRealm(next, title))
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
 */
export function fromLinearHistory({ current = null, backstack = [], forwardstack = [] } = {}) {
  const chain = [...backstack, ...(current ? [current] : []), ...forwardstack]
  if (chain.length === 0) return createVisitGraph()

  let journey = createVisitGraph()
  for (const title of chain) journey = jump(journey, title)

  for (let step = 0; step < forwardstack.length; step += 1) journey = goBack(journey)

  return journey
}

/**
 * Rebuilds from the 2.0 per-arrival tree. Realms merge by title, parent
 * links become edges, and the history is the path to where the viewer was —
 * the best that shape can say about the order things happened, since it
 * recorded structure rather than sequence.
 */
export function fromVisitTree(tree) {
  if (!tree?.nodes) return createVisitGraph()

  let journey = createVisitGraph()
  const ordered = Object.values(tree.nodes).sort((a, b) => order(a.id) - order(b.id))

  for (const node of ordered) {
    const next = clone(journey)
    const to = ensureRealm(next, node.title)
    const parent = node.parentId ? tree.nodes[node.parentId] : null
    if (parent) connect(next, realmId(parent.title), to)
    journey = next
  }

  const path = []
  let cursor = tree.currentId ? tree.nodes[tree.currentId] : null
  while (cursor) {
    path.unshift(cursor.title)
    cursor = cursor.parentId ? tree.nodes[cursor.parentId] : null
  }

  journey.history = path.map(realmId)
  journey.cursor = journey.history.length - 1
  return journey
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
