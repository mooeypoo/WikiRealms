import { PORTAL_LIMITS } from './config.js'

function clampInt(value, min, max) {
  return Math.min(max, Math.max(min, Math.round(value)))
}

/**
 * Flattens the ORIGINAL (uncapped) section tree into one entry per
 * section that has outbound links, tagging each with its nearest
 * top-level ancestor's title — used to place a subsection's portals
 * within its top-level mountain's footprint (sub-peak-precise placement
 * is reserved for later; see docs/generation.md).
 * @param {object[]} nodes
 * @param {string|null} topLevelTitle
 */
function flattenLinkedSections(nodes, topLevelTitle) {
  const entries = []
  for (const node of nodes) {
    const ancestor = topLevelTitle ?? node.title
    if (node.links?.length) {
      entries.push({ sectionKey: node.anchor ?? node.title, topLevelTitle: ancestor, links: node.links })
    }
    entries.push(...flattenLinkedSections(node.children, ancestor))
  }
  return entries
}

/**
 * Generates portals from a parsed article's section tree: one portal per
 * (section, distinct link) pair — the same target can appear as separate
 * portals in different sections, but a link repeated multiple times
 * within one section only produces one portal (already deduped by
 * parseSectionTree). Deliberately independent of peak/terrain folding
 * (see SECTION_LIMITS) — a folded section's links still become portals,
 * placed within whichever peak absorbed it (its top-level ancestor, or
 * the "Miscellaneous" aggregate if that ancestor itself was folded).
 *
 * @param {{ lead: { links: string[] }, sections: object[] }} sectionTree the UNCAPPED tree from parseSectionTree
 * @param {{ x: number, y: number, radius: number, title?: string, depth?: number }[]} peaks flattened peaks from the CAPPED tree (see flattenPeaks)
 * @param {() => number} rng seeded RNG for in-region placement
 * @param {{ width: number, height: number }} gridSize
 * @returns {{ portalId: string, targetArticleId: string, gridX: number, gridY: number, origin: 'article-link', sectionTitle: string|null }[]}
 */
export function generateSectionPortals({ lead, sections }, peaks, rng, { width, height }) {
  const topLevelPeaksByTitle = new Map()
  for (const peak of peaks) {
    if (peak.depth === 1 && peak.title) topLevelPeaksByTitle.set(peak.title, peak)
  }
  const fallbackPeak = topLevelPeaksByTitle.get('Miscellaneous') ?? {
    x: width / 2,
    y: height / 2,
    radius: Math.min(width, height) * 0.3,
  }

  const entries = []
  if (lead?.links?.length) {
    entries.push({ sectionKey: 'lead', topLevelTitle: null, links: lead.links })
  }
  entries.push(...flattenLinkedSections(sections, null))

  const pairs = []
  for (const entry of entries) {
    for (const link of entry.links) {
      pairs.push({ sectionKey: entry.sectionKey, topLevelTitle: entry.topLevelTitle, targetArticleId: link })
    }
  }

  return pairs.slice(0, PORTAL_LIMITS.maxPortals).map((pair, index) => {
    const peak = (pair.topLevelTitle && topLevelPeaksByTitle.get(pair.topLevelTitle)) || fallbackPeak

    const angle = rng() * Math.PI * 2
    const distance = rng() * peak.radius

    return {
      portalId: `portal-${index}`,
      targetArticleId: pair.targetArticleId,
      targetTitle: pair.targetArticleId,
      gridX: clampInt(peak.x + Math.cos(angle) * distance, 0, width - 1),
      gridY: clampInt(peak.y + Math.sin(angle) * distance, 0, height - 1),
      origin: 'article-link',
      sectionTitle: pair.topLevelTitle,
    }
  })
}
