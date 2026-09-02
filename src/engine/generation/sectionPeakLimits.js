import { SECTION_LIMITS } from './config.js'

/**
 * Applies SECTION_LIMITS to a parsed section tree (see
 * parseSectionTree.js) for terrain/peak generation purposes only.
 * Sections beyond the caps at any level are folded into a single
 * synthetic "Miscellaneous" node preserving their total size — nothing
 * is lost numerically, they just don't get an individually distinguishable
 * peak. Portal generation is intentionally independent of this folding
 * (see sectionPortals.js) — a folded section's links still become
 * portals, since a portal is a cheap point-marker, not a full peak.
 *
 * @param {object[]} sections output of parseSectionTree's `sections`
 * @param {{ limits?: typeof SECTION_LIMITS }} [options]
 * @returns {object[]} a new tree, capped and folded, with the same node shape
 */
export function applyPeakLimits(sections, { limits = SECTION_LIMITS } = {}) {
  return limitLevel(sections, 1, limits)
}

function limitLevel(nodes, depth, limits) {
  const maxCount = depth === 1 ? limits.maxTopLevelSections : limits.maxSubsectionsPerParent
  const sorted = [...nodes].sort((a, b) => b.subtreeSize - a.subtreeSize)

  const overflow = sorted.length > maxCount
  const kept = overflow ? sorted.slice(0, maxCount - 1) : sorted
  const folded = overflow ? sorted.slice(maxCount - 1) : []

  const limited = kept.map((node) => ({
    ...node,
    depth,  // Explicitly set depth to ensure all nodes have it
    children: depth < limits.maxPeakDepth ? limitLevel(node.children, depth + 1, limits) : [],
  }))

  if (folded.length > 0) {
    const foldedSize = folded.reduce((sum, node) => sum + node.subtreeSize, 0)
    const foldedCitations = folded.reduce((sum, node) => sum + (node.subtreeCitationCount ?? node.citationCount ?? 0), 0)
    limited.push({
      title: 'Miscellaneous',
      depth,
      anchor: null,
      ownSize: foldedSize,
      subtreeSize: foldedSize,
      citationCount: foldedCitations,
      citationDensity: foldedSize > 0 ? foldedCitations / foldedSize : 0,
      subtreeCitationCount: foldedCitations,
      subtreeCitationDensity: foldedSize > 0 ? foldedCitations / foldedSize : 0,
      children: [],
      folded: true,
    })
  }

  return limited
}
