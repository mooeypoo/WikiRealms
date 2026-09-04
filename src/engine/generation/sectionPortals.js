import { PORTAL_LIMITS } from './config.js'

// Vogel/sunflower spacing: successive points separated by the golden
// angle never line up into spokes or rings, which is what makes a
// growing set of portals stay evenly spread instead of clumping.
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))

function clampInt(value, min, max) {
  return Math.min(max, Math.max(min, Math.round(value)))
}

/**
 * Wraps a column index into [0, width). Longitude wraps, so a portal
 * placed just past the ±180° meridian belongs on the far edge — clamping
 * it would pile every such portal onto column 0 in a visible line.
 */
function wrapInt(value, width) {
  const rounded = Math.round(value)
  return ((rounded % width) + width) % width
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

/**
 * Flattens the ORIGINAL (uncapped) section tree into one entry per
 * section that has outbound links, tagging each with its own anchor and
 * with its nearest top-level ancestor's title. The anchor is what lets a
 * subsection's portals land in the subsection's OWN footprint when that
 * subsection survived peak folding; the ancestor title is the fallback
 * (and always determines sectionIndex — see generateSectionPortals).
 * @param {object[]} nodes
 * @param {string|null} topLevelTitle
 */
function flattenLinkedSections(nodes, topLevelTitle) {
  const entries = []
  for (const node of nodes) {
    const ancestor = topLevelTitle ?? node.title
    if (node.links?.length) {
      entries.push({
        sectionKey: node.anchor ?? node.title,
        sectionAnchor: node.anchor ?? null,
        topLevelTitle: ancestor,
        links: node.links,
      })
    }
    entries.push(...flattenLinkedSections(node.children, ancestor))
  }
  return entries
}

/**
 * Round-robins (section, link) pairs so the maxPortals cap can't starve
 * whole sections. In document order, a link-heavy opening section eats
 * the entire budget and everything after it gets no portal at all;
 * taking one link per section per pass means every linked section places
 * its first portal before any section places its second.
 * @param {{ sectionKey: string }[]} pairs in document order
 */
function interleaveBySection(pairs) {
  const bySection = new Map()
  for (const pair of pairs) {
    if (!bySection.has(pair.sectionKey)) bySection.set(pair.sectionKey, [])
    bySection.get(pair.sectionKey).push(pair)
  }

  const queues = [...bySection.values()]
  const interleaved = []
  for (let round = 0; interleaved.length < pairs.length; round++) {
    for (const queue of queues) {
      if (round < queue.length) interleaved.push(queue[round])
    }
  }
  return interleaved
}

/**
 * Places one portal inside a circular region using sunflower spacing:
 * the i-th of n portals sits at radius ∝ √((i + ½)/n), which spreads
 * them evenly by AREA rather than by radius (a uniform random radius
 * piles most of them near the center). A seeded rotation and small
 * jitter keep it organic rather than visibly geometric.
 *
 * Every portal lands between minFootprintFraction and
 * maxFootprintFraction of the region radius — off the summit marker it
 * would otherwise sit under, and inside the section's own land.
 */
function placeInRegion(region, index, count, rng) {
  const spread = count > 1 ? Math.sqrt((index + 0.5) / count) : 0.62
  const { minFootprintFraction: min, maxFootprintFraction: max } = PORTAL_LIMITS
  const fraction = clamp((min + (max - min) * spread) * (1 + (rng() - 0.5) * 0.14), min, max)
  const angle = region.rotation + index * GOLDEN_ANGLE + (rng() - 0.5) * 0.35
  const distance = region.radius * fraction

  return {
    x: region.x + Math.cos(angle) * distance,
    y: region.y + Math.sin(angle) * distance,
  }
}

/**
 * Generates portals from a parsed article's section tree: one portal per
 * (section, distinct link) pair — the same target can appear as separate
 * portals in different sections, but a link repeated multiple times
 * within one section only produces one portal (already deduped by
 * parseSectionTree).
 *
 * Placement resolves in three steps, most specific first:
 *   1. the section's OWN peak, matched by anchor — a subsection that
 *      survived peak folding gets its portals in its own sub-peak's
 *      footprint, not scattered across the whole parent range;
 *   2. its top-level ancestor's peak;
 *   3. the "Miscellaneous" aggregate peak when that ancestor was folded
 *      away (see SECTION_LIMITS), or the central lead region if the
 *      article has no aggregate either.
 *
 * Lead-section links have no mountain of their own and are placed in a
 * region at the middle of the map rather than being lumped in with the
 * folded-sections aggregate.
 *
 * sectionIndex always identifies the owning TOP-LEVEL peak regardless of
 * which region the portal was placed in, since that's the granularity
 * the UI's hover-linking works at.
 *
 * @param {{ lead: { links: string[] }, sections: object[] }} sectionTree the UNCAPPED tree from parseSectionTree
 * @param {{ x: number, y: number, radius: number, title?: string, anchor?: string|null, depth?: number }[]} peaks flattened peaks from the CAPPED tree (see flattenPeaks)
 * @param {() => number} rng seeded RNG for in-region placement
 * @param {{ width: number, height: number }} gridSize
 * @returns {{ portalId: string, targetArticleId: string, gridX: number, gridY: number, origin: 'article-link', sectionTitle: string|null, sectionIndex: number }[]}
 */
export function generateSectionPortals({ lead, sections }, peaks, rng, { width, height }) {
  const peaksByAnchor = new Map()
  const topLevelPeaksByTitle = new Map()
  const topLevelPeakIndicesByTitle = new Map()
  for (let i = 0; i < peaks.length; i++) {
    const peak = peaks[i]
    if (peak.anchor && !peaksByAnchor.has(peak.anchor)) peaksByAnchor.set(peak.anchor, { key: `peak-${i}`, peak })
    if (peak.depth === 1 && peak.title && !topLevelPeaksByTitle.has(peak.title)) {
      topLevelPeaksByTitle.set(peak.title, { key: `peak-${i}`, peak })
      topLevelPeakIndicesByTitle.set(peak.title, i)
    }
  }

  // The lead has no peak of its own — its links belong to the article as
  // a whole, so they get the middle of the map.
  const leadRegion = {
    key: 'lead',
    peak: { x: width / 2, y: height / 2, radius: Math.min(width, height) * PORTAL_LIMITS.leadRegionRadiusRatio },
  }
  const foldedRegion = topLevelPeaksByTitle.get('Miscellaneous') ?? leadRegion

  const entries = []
  if (lead?.links?.length) {
    entries.push({ sectionKey: 'lead', sectionAnchor: null, topLevelTitle: null, links: lead.links })
  }
  entries.push(...flattenLinkedSections(sections, null))

  const pairs = []
  for (const entry of entries) {
    for (const link of entry.links) {
      pairs.push({
        sectionKey: entry.sectionKey,
        sectionAnchor: entry.sectionAnchor,
        topLevelTitle: entry.topLevelTitle,
        targetArticleId: link,
      })
    }
  }

  const selected = interleaveBySection(pairs).slice(0, PORTAL_LIMITS.maxPortals)

  // Group by the region each portal resolves to BEFORE placing any of
  // them: sunflower spacing needs to know how many portals share a
  // footprint, and two subsections that both fall back to the same
  // parent range have to be spread as one set, not two overlapping ones.
  const regions = new Map()
  const assignments = selected.map((pair) => {
    const resolved = (pair.sectionAnchor && peaksByAnchor.get(pair.sectionAnchor))
      || (pair.topLevelTitle && topLevelPeaksByTitle.get(pair.topLevelTitle))
      || (pair.topLevelTitle ? foldedRegion : leadRegion)

    if (!regions.has(resolved.key)) regions.set(resolved.key, { ...resolved.peak, rotation: null, count: 0 })
    const region = regions.get(resolved.key)
    const indexInRegion = region.count++

    return { pair, regionKey: resolved.key, indexInRegion }
  })

  // Seeded per-region rotation, drawn in a stable order so the same
  // (tree, peaks, seed) always yields the same map.
  for (const region of regions.values()) region.rotation = rng() * Math.PI * 2

  return assignments.map(({ pair, regionKey, indexInRegion }, index) => {
    const region = regions.get(regionKey)
    const { x, y } = placeInRegion(region, indexInRegion, region.count, rng)
    const sectionIndex = pair.topLevelTitle && topLevelPeakIndicesByTitle.has(pair.topLevelTitle)
      ? topLevelPeakIndicesByTitle.get(pair.topLevelTitle)
      : -1

    return {
      portalId: `portal-${index}`,
      targetArticleId: pair.targetArticleId,
      targetTitle: pair.targetArticleId,
      gridX: wrapInt(x, width),
      gridY: clampInt(y, 0, height - 1),
      origin: 'article-link',
      sectionTitle: pair.topLevelTitle,
      sectionIndex,
    }
  })
}
