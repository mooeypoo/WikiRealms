/**
 * Turning a visit graph into drawable rows.
 *
 * The shape a git client draws: a gutter of vertical rails with a dot per
 * stop, and text beside it. A journey tree is structurally a commit graph —
 * one history that forks when you go back and leave a different way — and
 * that idiom already solves branching legibly.
 *
 * Deliberately not a node-link diagram in the 3D scene. The third axis
 * would carry no information here, article titles are text that should stay
 * selectable and readable to a screen reader, and the stage belongs to the
 * world rather than to the session (docs/ux-vision.md §3). Rows also scroll,
 * where a diagram would need pan and zoom the moment a journey got long.
 *
 * Pure: numbers and booleans in, numbers and booleans out. No Vue, no DOM.
 */

import { childrenOf } from '../../core/traversal/visitGraph.js'

/**
 * @typedef {object} TrailRow
 * @property {string} id
 * @property {string} title
 * @property {number} depth how far from the start of its journey
 * @property {number} journey which root this belongs to, 0-based
 * @property {boolean} isCurrent
 * @property {boolean} isLastChild draws an elbow rather than a tee
 * @property {boolean} isBranchPoint more than one way was taken from here
 * @property {boolean[]} rails one entry per ANCESTOR LANE, oldest first —
 *   whether that ancestor still has siblings below this row, and so whether
 *   a line passes through the gutter beside it. Length is depth - 1: a row
 *   at depth 1 has none, because the root's lane is never drawn
 * @property {number} childCount
 */

/**
 * Depth-first, in the order the journeys were made.
 *
 * Order matters: a viewer reads this to remember what they did, and visit
 * order is the order they did it in. Sorting by title or size would be a
 * different document about the same data.
 *
 * @param {object} graph
 * @returns {{ rows: TrailRow[], journeys: number, maxDepth: number }}
 */
export function layoutTrail(graph) {
  if (!graph?.nodes) return { rows: [], journeys: 0, maxDepth: 0 }

  const rows = []

  graph.rootIds.forEach((rootId, journey) => {
    if (!graph.nodes[rootId]) return
    walk(graph, rootId, { depth: 0, journey, rails: [], isLastChild: true, rows })
  })

  return {
    rows,
    journeys: graph.rootIds.length,
    maxDepth: rows.reduce((deepest, row) => Math.max(deepest, row.depth), 0),
  }
}

function walk(graph, nodeId, { depth, journey, rails, isLastChild, rows }) {
  const node = graph.nodes[nodeId]
  if (!node) return

  const children = orderedChildren(graph, nodeId)

  rows.push({
    id: node.id,
    title: node.title,
    depth,
    journey,
    isCurrent: graph.currentId === node.id,
    isLastChild,
    // A fork: the viewer came back here and left a different way. This is
    // the whole reason the panel exists, so it is worth marking.
    isBranchPoint: children.length > 1,
    rails: [...rails],
    childCount: children.length,
  })

  children.forEach((child, index) => {
    const last = index === children.length - 1
    walk(graph, child.id, {
      depth: depth + 1,
      journey,
      // The child inherits this row's ancestor lanes, plus one for THIS row
      // — a line passing beside the child wherever this row still has
      // siblings waiting below it. A root contributes no lane, because a
      // journey's start has nothing beside it to draw.
      rails: depth === 0 ? [] : [...rails, !isLastChild],
      isLastChild: last,
      rows,
    })
  })
}

/**
 * Children in the order they were first visited, which the id encodes: ids
 * are handed out in sequence, so n2 was reached before n7.
 */
function orderedChildren(graph, nodeId) {
  return childrenOf(graph, nodeId).sort((a, b) => idOrder(a.id) - idOrder(b.id))
}

function idOrder(id) {
  const value = Number(String(id).replace(/^n/, ''))
  return Number.isFinite(value) ? value : 0
}

/**
 * The rows between the start of a journey and a given node — what to
 * highlight when the viewer is deciding where to jump back to.
 */
export function ancestryOf(rows, nodeId) {
  const index = rows.findIndex((row) => row.id === nodeId)
  if (index < 0) return []

  const line = new Set([nodeId])
  let depth = rows[index].depth

  for (let cursor = index - 1; cursor >= 0 && depth > 0; cursor -= 1) {
    if (rows[cursor].depth < depth) {
      line.add(rows[cursor].id)
      depth = rows[cursor].depth
    }
  }

  return [...line]
}
