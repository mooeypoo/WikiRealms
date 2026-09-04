/**
 * The journey as a tree of visits.
 *
 * Traversal used to be two flat stacks, which lost information the moment a
 * viewer backtracked: going back and taking a different portal discarded the
 * forward stack outright, so the branch they had already explored simply
 * ceased to exist. There was no way to render "the path we took" because the
 * path was not being kept.
 *
 * A node is one ARRIVAL, not one article. Visiting the same title twice from
 * different parents makes two nodes, because they are two different places in
 * the journey — the tree is the shape of where the viewer went, not a
 * deduplicated index of what they saw. Revisiting a title from the SAME
 * parent reuses that child, so bouncing back and forth does not grow it.
 *
 * Pure and serializable: every function takes a state and returns a new one,
 * and the whole thing round-trips through JSON for the session snapshot.
 * This is domain logic and lives in core/ accordingly — it knows nothing
 * about Vue, the URL, or how a trail might be drawn.
 */

/**
 * @typedef {object} VisitNode
 * @property {string} id
 * @property {string} title
 * @property {string|null} parentId
 * @property {string|null} lastChildId the child to return to on "forward"
 */

/**
 * @typedef {object} VisitGraph
 * @property {Record<string, VisitNode>} nodes
 * @property {string[]} rootIds journeys, in the order they were started
 * @property {string|null} currentId
 * @property {number} nextId
 */

/** @returns {VisitGraph} */
export function createVisitGraph() {
  return { nodes: {}, rootIds: [], currentId: null, nextId: 1 }
}

function clone(graph) {
  return {
    nodes: { ...graph.nodes },
    rootIds: [...graph.rootIds],
    currentId: graph.currentId,
    nextId: graph.nextId,
  }
}

export function currentNode(graph) {
  return graph.currentId ? (graph.nodes[graph.currentId] ?? null) : null
}

export function currentTitle(graph) {
  return currentNode(graph)?.title ?? null
}

export function childrenOf(graph, nodeId) {
  return Object.values(graph.nodes).filter((node) => node.parentId === nodeId)
}

/**
 * A viewer arriving somewhere new, from where they are. This is portal
 * travel: the destination hangs off the current node.
 */
export function visit(graph, title) {
  if (!title) return graph
  if (currentTitle(graph) === title) return graph
  if (!graph.currentId) return jump(graph, title)

  // Already been here from here? Step back onto that branch rather than
  // growing a duplicate every time the viewer paces between two realms.
  const existing = childrenOf(graph, graph.currentId).find((node) => node.title === title)
  if (existing) return goTo(graph, existing.id)

  const next = clone(graph)
  const id = `n${next.nextId}`
  next.nextId += 1
  next.nodes[id] = { id, title, parentId: graph.currentId, lastChildId: null }
  next.nodes[graph.currentId] = { ...next.nodes[graph.currentId], lastChildId: id }
  next.currentId = id
  return next
}

/**
 * A viewer starting somewhere unconnected — a search, a shared link, a
 * random realm. That begins a new journey rather than pretending the new
 * realm was reached from wherever they happened to be standing.
 */
export function jump(graph, title) {
  if (!title) return graph

  const next = clone(graph)
  const id = `n${next.nextId}`
  next.nextId += 1
  next.nodes[id] = { id, title, parentId: null, lastChildId: null }
  next.rootIds.push(id)
  next.currentId = id
  return next
}

/**
 * Moves to a node already in the journey — a breadcrumb, a trail click, the
 * browser's back button.
 *
 * Note what this does NOT do: the old breadcrumb called navigateTo, which
 * pushed a new entry and wiped the forward stack, so clicking your own
 * history rewrote it. Returning somewhere is not the same as going
 * somewhere, and the tree is left exactly as it was.
 */
export function goTo(graph, nodeId) {
  if (!graph.nodes[nodeId]) return graph

  const next = clone(graph)
  next.currentId = nodeId

  // Remember the branch we came down, so "forward" knows which child to
  // return to when there is more than one.
  const node = next.nodes[nodeId]
  for (const child of childrenOf(graph, nodeId)) {
    if (child.id === graph.currentId) {
      next.nodes[nodeId] = { ...node, lastChildId: child.id }
      break
    }
  }

  return next
}

export function canGoBack(graph) {
  return Boolean(currentNode(graph)?.parentId)
}

export function canGoForward(graph) {
  const node = currentNode(graph)
  return Boolean(node?.lastChildId && graph.nodes[node.lastChildId])
}

export function goBack(graph) {
  const node = currentNode(graph)
  if (!node?.parentId) return graph
  return goTo(graph, node.parentId)
}

export function goForward(graph) {
  const node = currentNode(graph)
  if (!node?.lastChildId) return graph
  return goTo(graph, node.lastChildId)
}

/** Root → current, the breadcrumb trail. */
export function pathToCurrent(graph) {
  const path = []
  let node = currentNode(graph)
  while (node) {
    path.unshift(node)
    node = node.parentId ? graph.nodes[node.parentId] : null
  }
  return path
}

/**
 * The ancestor titles, oldest first — the flat "backstack" the rest of the
 * app still speaks in.
 */
export function backTitles(graph) {
  return pathToCurrent(graph)
    .slice(0, -1)
    .map((node) => node.title)
}

/** The remembered forward chain, nearest first. */
export function forwardTitles(graph) {
  const titles = []
  let node = currentNode(graph)
  const seen = new Set()
  while (node?.lastChildId && graph.nodes[node.lastChildId] && !seen.has(node.lastChildId)) {
    seen.add(node.lastChildId)
    node = graph.nodes[node.lastChildId]
    titles.push(node.title)
  }
  return titles
}

/**
 * Rebuilds a graph from a linear history — the shape every session saved
 * before the tree existed. The result is one journey with no branches, which
 * is exactly what those sessions recorded.
 */
export function fromLinearHistory({ current = null, backstack = [], forwardstack = [] } = {}) {
  const chain = [...backstack, ...(current ? [current] : []), ...forwardstack]
  if (chain.length === 0) return createVisitGraph()

  let graph = jump(createVisitGraph(), chain[0])
  for (const title of chain.slice(1)) graph = visit(graph, title)

  // Wind back to where the viewer actually was, leaving the forward chain
  // reachable rather than discarding it.
  for (let step = 0; step < forwardstack.length; step += 1) graph = goBack(graph)

  return graph
}

/** Guards a graph read back from JSON, so a hand-edited file cannot poison it. */
export function isVisitGraph(value) {
  return Boolean(
    value &&
      typeof value === 'object' &&
      value.nodes &&
      typeof value.nodes === 'object' &&
      Array.isArray(value.rootIds) &&
      typeof value.nextId === 'number' &&
      (value.currentId === null || typeof value.currentId === 'string'),
  )
}
