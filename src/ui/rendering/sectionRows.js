/**
 * The section list the Ledger draws, assembled from the world rather than
 * from the article.
 *
 * These are two different trees and they had been quietly confused. The
 * parser produces every heading in the article, to any depth. The engine
 * then runs applyPeakLimits over it, which sorts each level by subtree
 * size, keeps the largest, folds the remainder into one synthetic
 * "Miscellaneous" node, and stops at maxPeakDepth. What ends up on the
 * map is that second tree, and only that second tree.
 *
 * The Ledger was listing the first one, top level only, and matching
 * bands onto it by anchor. Three things followed. A long article showed
 * rows for sections that had been folded away, which carried no band and
 * no explanation. The "Miscellaneous" range that genuinely existed on the
 * map had no row at all, so the mountain a reader could see and click was
 * absent from the list of what they were looking at. And subsections —
 * which do get their own summits and their own bands — appeared nowhere.
 *
 * So the list is built from the peaks, which is what the reader is
 * standing on, and the parsed tree is consulted for two things the peaks
 * cannot supply: the order the sections appear in the article, and the
 * names of the sections that were folded away.
 *
 * Identity is the PEAK INDEX, not the anchor. Anchors are Wikipedia's and
 * the synthetic aggregate has none, so an anchor cannot name every row —
 * which is exactly why clicking the "Miscellaneous" range used to do
 * nothing at all. A peak index names every row that has ground, and the
 * halo renderer already speaks it.
 *
 * Pure and framework-free, so the tree-shaping is testable without
 * mounting anything.
 */
import { computeArticleCitationRate, computeLushnessCeiling } from '../../engine/generation/lushness.js'

/** Title applyPeakLimits gives the node it folds the overflow into. */
const AGGREGATE_TITLE = 'Miscellaneous'

/**
 * Where a section that cites exactly like its article sits on the [0, 1]
 * lushness scale.
 *
 * Not 0.5. relativeRateToUnit maps a ratio of 1 to 0.5, and the absolute
 * ceiling then scales the whole scale down for an article that cites
 * little — so in a thinly-sourced article every section, including a
 * perfectly typical one, sits low. A tick drawn at a fixed midpoint would
 * report that whole article as below its own average, which is
 * arithmetically impossible.
 *
 * Returns null when the article cites nothing, since there is then no
 * average to compare anything against.
 *
 * @param {{ citationCount?: number, sentenceCount?: number }} sectionTree
 * @returns {number | null}
 */
export function articleAverageLushness(sectionTree) {
  const rate = computeArticleCitationRate(sectionTree ?? {})
  if (!(rate > 0)) return null
  return 0.5 * computeLushnessCeiling(rate)
}

/**
 * A key that identifies the same section in both trees.
 *
 * Anchor where there is one, since a heading id is unique in an article
 * and a title is not — "History" appears twice in plenty of them. Where
 * there is not (the synthetic aggregate, and fixtures with bare titles)
 * the title is scoped under its parent, which is enough: a level's
 * titles are unique among their siblings even when they repeat across
 * the article.
 */
function keyFor(node, parentKey) {
  return node.anchor ?? `${parentKey ?? ''}/${node.title}`
}

/**
 * Article order for every parsed section, plus the node itself, keyed the
 * same way the peaks will be.
 *
 * Both are needed and neither comes from the peaks. Order, because
 * applyPeakLimits sorts by subtree size and a ledger sorted by size reads
 * as a ranking of an article rather than as a reading of one. The nodes,
 * because the folded sections survive nowhere else.
 */
function indexParsedTree(nodes, parentKey = null, into = new Map(), depth = 1) {
  ;(nodes ?? []).forEach((node, position) => {
    const key = keyFor(node, parentKey)
    into.set(key, { node, key, parentKey, depth, position })
    indexParsedTree(node.children, key, into, depth + 1)
  })
  return into
}

/**
 * Maps every parsed anchor — at any depth — to the key of the nearest
 * section at or above it that the Ledger actually draws a row for.
 *
 * Portals are generated from the uncapped tree, so a link inside an h4
 * carries that h4's anchor while the deepest row is depth 2. Attributing
 * it to the nearest listed ancestor is what makes a range's portal count
 * equal the sum of its subsections' plus its own, instead of quietly
 * losing the ones that came from too deep to list.
 */
function mapAnchorsToRows(nodes, rowKeys, parentKey = null, nearestRow = null, into = new Map()) {
  for (const node of nodes ?? []) {
    const key = keyFor(node, parentKey)
    const owner = rowKeys.has(key) ? key : nearestRow
    if (node.anchor) into.set(node.anchor, owner)
    mapAnchorsToRows(node.children, rowKeys, key, owner, into)
  }
  return into
}

/**
 * Groups the flat depth-first peaks array into top-level ranges and the
 * summits that belong to them.
 *
 * By `sectionIndex` where the engine has stamped one, and by depth-first
 * position where it has not — flattenPeaks emits a parent immediately
 * followed by its subtree, which is the same invariant
 * annotateSectionIndices relies on. Both, because a summit silently
 * dropping out of the list is a far worse failure than a summit in the
 * wrong range, and a peaks array assembled by hand in a test or a story
 * is unlikely to carry the annotation.
 */
function groupPeaks(peaks) {
  const ranges = []
  const byIndex = new Map()

  peaks.forEach((peak, index) => {
    if ((peak.depth ?? 1) <= 1) {
      const range = { peak, index, children: [] }
      ranges.push(range)
      byIndex.set(index, range)
    }
  })

  let mostRecent = null
  peaks.forEach((peak, index) => {
    if ((peak.depth ?? 1) <= 1) {
      mostRecent = byIndex.get(index)
      return
    }
    const owner = byIndex.get(peak.sectionIndex ?? -1) ?? mostRecent
    owner?.children.push({ peak, index })
  })

  return ranges
}

/**
 * Sorts entries into the order their sections appear in the article,
 * leaving anything the parse does not know about — which in practice is
 * only the synthetic aggregate — at the end, where it belongs: it is
 * everything that did not fit, so it reads as a remainder.
 */
function inArticleOrder(entries, parsed, parentKey) {
  return [...entries]
    .map((entry, arrival) => ({
      entry,
      arrival,
      position: parsed.get(keyFor(entry.peak, parentKey))?.position ?? Number.POSITIVE_INFINITY,
    }))
    .sort((a, b) => a.position - b.position || a.arrival - b.arrival)
    .map(({ entry }) => entry)
}

/**
 * Own and subtree figures, from the peak where there is one and from the
 * parsed node otherwise.
 *
 * Both, and labelled as such, because the row prints one and the opened
 * row prints the split. The old row took `Math.max(subtreeSize, ownSize)`
 * for its word count and subtree totals for its citations, so a parent's
 * "1,240 words" silently included its children while sitting beside "3
 * subsections" — leaving no way to tell whether the figure described the
 * section or the range.
 */
function figuresOf(peak, node) {
  const source = peak ?? node ?? {}
  const ownSize = source.ownSize ?? 0
  const ownSentences = source.sentenceCount ?? 0
  return {
    ownSize,
    ownRefs: source.ownCitationCount ?? source.citationCount ?? 0,
    ownSentences,
    subtreeSize: source.subtreeSize ?? ownSize,
    refs: source.subtreeCitationCount ?? source.citationCount ?? 0,
    sentences: source.subtreeSentenceCount ?? ownSentences,
  }
}

function makeRow({ key, parentKey, depth, title, anchor, entry, node, portals, children }) {
  const figures = figuresOf(entry?.peak, node)
  return {
    key,
    parentKey,
    depth,
    title,
    anchor: anchor ?? null,
    /** Identity on the map. null for a section with no ground of its own. */
    peakIndex: entry ? entry.index : null,
    hasGround: Boolean(entry),
    /**
     * The synthetic range standing in for everything that did not earn a
     * summit. It has ground and a band, but no heading on Wikipedia and
     * no single thing it describes, so it is labelled rather than linked.
     */
    isAggregate: Boolean(entry) && !anchor && title === AGGREGATE_TITLE,
    lushness: entry ? (entry.peak.lushness ?? null) : null,
    ...figures,
    /** Whether the subtree figures say anything the own figures don't. */
    hasNestedProse: figures.subtreeSize > figures.ownSize,
    portals,
    children,
  }
}

/**
 * The Ledger's section list: top-level ranges in article order, each with
 * the summits the engine gave it, plus rows for the sections that were
 * folded away so the reader can see where they went.
 *
 * @param {object} article parsed article (needs `sections`)
 * @param {object | null} world generated world (needs `terrain.peaks`, `portals`)
 * @returns {{ rows: object[], count: number, average: number | null }}
 */
export function buildSectionRows(article, world) {
  const tree = article?.sections
  const parsed = indexParsedTree(tree?.sections)
  const ranges = inArticleOrder(groupPeaks(world?.terrain?.peaks ?? []), parsed, null)

  // Which keys get a row, settled before any row exists so a portal can
  // be attributed to the nearest one: everything the peaks cover, plus
  // the folded sections listed under the aggregate they went into. A
  // section below the deepest row is deliberately absent, so a link
  // written inside an h4 counts toward the h3 the reader can see rather
  // than toward a row that is not there.
  const grounded = new Set()
  for (const range of ranges) {
    const rangeKey = keyFor(range.peak, null)
    grounded.add(rangeKey)
    for (const child of range.children) grounded.add(keyFor(child.peak, rangeKey))
  }
  const rowKeys = new Set(grounded)
  for (const { key, parentKey, depth } of parsed.values()) {
    if (grounded.has(key)) continue
    // Folding happens per level, so a section gets a folded row only
    // where there is an aggregate to hang it under — at the top, or
    // inside a range that has ground of its own.
    if (depth === 1 || (depth === 2 && grounded.has(parentKey))) rowKeys.add(key)
  }

  const anchorOwner = mapAnchorsToRows(tree?.sections, rowKeys)
  const portalCounts = new Map()
  for (const portal of world?.portals ?? []) {
    const owner = portal.sectionAnchor ? anchorOwner.get(portal.sectionAnchor) : null
    if (!owner) continue
    portalCounts.set(owner, (portalCounts.get(owner) ?? 0) + 1)
  }

  const rows = []
  for (const range of ranges) {
    const rangeKey = keyFor(range.peak, null)

    const children = inArticleOrder(range.children, parsed, rangeKey).map((child) => {
      const childKey = keyFor(child.peak, rangeKey)
      return makeRow({
        key: childKey,
        parentKey: rangeKey,
        depth: 2,
        title: child.peak.title,
        anchor: child.peak.anchor,
        entry: child,
        node: parsed.get(childKey)?.node ?? null,
        portals: portalCounts.get(childKey) ?? 0,
        children: [],
      })
    })

    rows.push(
      makeRow({
        key: rangeKey,
        parentKey: null,
        depth: 1,
        title: range.peak.title,
        anchor: range.peak.anchor,
        entry: range,
        node: parsed.get(rangeKey)?.node ?? null,
        portals: 0, // summed below, once the folded rows are in place
        children,
      }),
    )
  }

  attachFoldedSections(rows, parsed, grounded, portalCounts)
  // A row's count covers everything nested under it, so it can only be
  // totalled once its children are final.
  rollUpPortals(rows, portalCounts)

  return { rows, count: countRows(rows), average: articleAverageLushness(tree) }
}

/** Every row at every level — what the Ledger uses to decide how much to open. */
export function countRows(rows) {
  return (rows ?? []).reduce((total, row) => total + 1 + countRows(row.children), 0)
}

/**
 * Hangs the sections that were folded away under the aggregate range they
 * were folded into, as rows with no ground.
 *
 * They are listed rather than dropped because the alternative is a
 * mountain labelled "Miscellaneous" that never says what is in it. They
 * are visibly groundless rather than banded because that is the truth:
 * their prose raised the aggregate's height and their citations coloured
 * it, but no particular patch of the map is theirs.
 *
 * Folding happens per level, so a range can have folded subsections of
 * its own; those hang under that range's own aggregate summit.
 */
function attachFoldedSections(rows, parsed, grounded, portalCounts) {
  const aggregateFor = new Map()
  for (const row of rows) {
    if (row.isAggregate) aggregateFor.set(null, row)
    for (const child of row.children) {
      if (child.isAggregate) aggregateFor.set(row.key, child)
    }
  }
  if (aggregateFor.size === 0) return

  for (const { node, key, parentKey, depth } of parsed.values()) {
    if (depth > 2 || grounded.has(key)) continue
    const aggregate = aggregateFor.get(parentKey)
    if (!aggregate) continue

    aggregate.children.push(
      makeRow({
        key,
        parentKey: aggregate.key,
        depth: aggregate.depth + 1,
        title: node.title,
        anchor: node.anchor,
        entry: null,
        node,
        portals: portalCounts.get(key) ?? 0,
        children: [],
      }),
    )
  }
}

function rollUpPortals(rows, portalCounts) {
  for (const row of rows) {
    rollUpPortals(row.children, portalCounts)
    row.portals = (portalCounts.get(row.key) ?? 0) + row.children.reduce((sum, child) => sum + child.portals, 0)
  }
}
