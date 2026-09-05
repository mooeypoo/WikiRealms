/**
 * Placing a journey's realms so the map can be drawn.
 *
 * This laid out an indented tree until real journeys broke it: a realm
 * reached by two routes appeared twice, and a loop — Spacetime → Template
 * talk → Physics → Spacetime — could not be represented at all. A tree
 * cannot hold a cycle, so the shape was not merely redundant, it was unable
 * to record what happened.
 *
 * So this places a GRAPH. Layered rather than force-directed: ranks come
 * from how far a realm is from where the journey started, which is a fact
 * about the journey rather than an artefact of a simulation, and the same
 * journey therefore lays out the same way every time it is opened. A
 * force-directed graph would settle differently on each open, which for a
 * record of where you have been is the wrong kind of alive.
 *
 * Pure numbers: no Vue, no DOM, no three.js. Rendering it in the 3D scene
 * was considered and declined — the third axis carries no information here,
 * titles need to stay real selectable text, and a canvas is opaque to a
 * screen reader (docs/ux-vision.md §3).
 */

export const NODE_WIDTH = 132
export const NODE_HEIGHT = 34
export const RANK_GAP = 62
export const COLUMN_GAP = 18

/**
 * @typedef {object} PlacedRealm
 * @property {string} id
 * @property {string} title
 * @property {number} rank how many portals from the start of the journey
 * @property {number} x
 * @property {number} y
 * @property {boolean} isCurrent
 * @property {number} routesIn how many different ways lead here
 * @property {boolean} isStart nothing leads here — a search, a shared link,
 *   or the first realm of the session
 */

/**
 * @param {object} journey
 * @returns {{ nodes: PlacedRealm[], links: object[], width: number, height: number }}
 */
export function layoutJourney(journey) {
  if (!journey?.realms || Object.keys(journey.realms).length === 0) {
    return { nodes: [], links: [], width: 0, height: 0 }
  }

  const ranks = rankRealms(journey)
  const byRank = groupByRank(journey, ranks)
  const positions = place(byRank)

  const currentId = journey.history[journey.cursor] ?? null
  const routesIn = countRoutesIn(journey)

  const nodes = Object.values(journey.realms).map((realm) => ({
    id: realm.id,
    title: realm.title,
    rank: ranks.get(realm.id) ?? 0,
    ...positions.get(realm.id),
    isCurrent: realm.id === currentId,
    routesIn: routesIn.get(realm.id) ?? 0,
    // Nothing leads here, so the viewer arrived by searching or by opening
    // a link. Worth marking: an unconnected node otherwise reads as a
    // drawing that failed rather than as a journey that began.
    isStart: (routesIn.get(realm.id) ?? 0) === 0,
  }))

  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const links = journey.edges
    .filter((edge) => nodeById.has(edge.from) && nodeById.has(edge.to))
    .map((edge) => ({
      from: edge.from,
      to: edge.to,
      // An edge running back up the ranks is a loop closing. Worth knowing:
      // it is drawn differently, because a straight line between distant
      // ranks reads as a mistake.
      isBackEdge: (nodeById.get(edge.to).rank ?? 0) <= (nodeById.get(edge.from).rank ?? 0),
    }))

  return {
    nodes,
    links,
    width: Math.max(...nodes.map((node) => node.x + NODE_WIDTH)) + COLUMN_GAP,
    height: Math.max(...nodes.map((node) => node.y + NODE_HEIGHT)) + COLUMN_GAP,
  }
}

/**
 * Breadth-first from every realm that was jumped to rather than walked to —
 * the starts of journeys. Anything unreachable from one (which the edges
 * being one-directional can produce) starts its own rank 0.
 */
function rankRealms(journey) {
  const ranks = new Map()
  const outgoing = new Map()
  for (const edge of journey.edges) {
    if (!outgoing.has(edge.from)) outgoing.set(edge.from, [])
    outgoing.get(edge.from).push(edge.to)
  }

  const hasIncoming = new Set(journey.edges.map((edge) => edge.to))
  const ordered = Object.values(journey.realms).sort((a, b) => a.order - b.order)
  const starts = ordered.filter((realm) => !hasIncoming.has(realm.id))

  const queue = [...(starts.length > 0 ? starts : ordered.slice(0, 1))].map((realm) => realm.id)
  for (const id of queue) ranks.set(id, 0)

  while (queue.length > 0) {
    const id = queue.shift()
    for (const next of outgoing.get(id) ?? []) {
      if (ranks.has(next)) continue // a shorter route already claimed it
      ranks.set(next, ranks.get(id) + 1)
      queue.push(next)
    }
  }

  // Anything the walk never reached — an island left by a jump.
  for (const realm of ordered) {
    if (!ranks.has(realm.id)) ranks.set(realm.id, 0)
  }

  return ranks
}

function groupByRank(journey, ranks) {
  const byRank = new Map()
  for (const realm of Object.values(journey.realms).sort((a, b) => a.order - b.order)) {
    const rank = ranks.get(realm.id)
    if (!byRank.has(rank)) byRank.set(rank, [])
    byRank.get(rank).push(realm)
  }
  return byRank
}

/** Ranks run down the panel; realms within a rank sit side by side. */
function place(byRank) {
  const positions = new Map()
  const widest = Math.max(...[...byRank.values()].map((realms) => realms.length))

  for (const [rank, realms] of byRank) {
    const rowWidth = realms.length * NODE_WIDTH + (realms.length - 1) * COLUMN_GAP
    const fullWidth = widest * NODE_WIDTH + (widest - 1) * COLUMN_GAP
    // Centred, so a journey that narrows reads as narrowing rather than as
    // drifting left.
    const offset = (fullWidth - rowWidth) / 2

    realms.forEach((realm, index) => {
      positions.set(realm.id, {
        x: offset + index * (NODE_WIDTH + COLUMN_GAP),
        y: rank * (NODE_HEIGHT + RANK_GAP),
      })
    })
  }

  return positions
}

function countRoutesIn(journey) {
  const counts = new Map()
  for (const edge of journey.edges) {
    counts.set(edge.to, (counts.get(edge.to) ?? 0) + 1)
  }
  return counts
}

/** The realms on the way to one, following edges backwards. */
export function routeInto(journey, id) {
  const incoming = new Map()
  for (const edge of journey.edges) {
    if (!incoming.has(edge.to)) incoming.set(edge.to, [])
    incoming.get(edge.to).push(edge.from)
  }

  const seen = new Set([id])
  const queue = [id]
  while (queue.length > 0) {
    for (const previous of incoming.get(queue.shift()) ?? []) {
      if (seen.has(previous)) continue
      seen.add(previous)
      queue.push(previous)
    }
  }

  return [...seen]
}
