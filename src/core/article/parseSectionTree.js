import { EXCLUDED_SECTION_TITLES } from '../../engine/generation/config.js'

const HEADING_SELECTOR = ':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6'
const NON_PROSE_SELECTOR = '.mw-references-wrap, .reflist, .navbox, .infobox, style, script'
const NON_ARTICLE_NAMESPACE = /^(File|Category|Help|Wikipedia|Template|Portal|Special|Talk|Module):/i

function depthFromHeadingTag(tagName) {
  return Number(tagName.slice(1)) - 1 // h2 -> depth 1, h3 -> depth 2, ...
}

/**
 * Extracts the internal wiki links (rel="mw:WikiLink") within a single
 * section element, excluding non-article namespaces (categories, files,
 * etc.) and de-duplicated. Citation backlinks use rel="mw:referencedBy"
 * and external/citation links use rel="mw:ExtLink", so neither is picked
 * up here without any extra filtering.
 * @param {Element} sectionEl
 */
function extractLinks(sectionEl) {
  const titles = new Set()

  for (const anchor of sectionEl.querySelectorAll('a[rel="mw:WikiLink"]')) {
    const href = anchor.getAttribute('href') ?? ''
    const raw = href.replace(/^\.\//, '').split('#')[0]
    if (!raw || NON_ARTICLE_NAMESPACE.test(raw)) continue

    titles.add(decodeURIComponent(raw).replace(/_/g, ' '))
  }

  return Array.from(titles)
}

/**
 * Measures a section's own prose length, excluding non-prose wrapper
 * content (citation lists, navboxes, infoboxes, styles) so a
 * citation-heavy section isn't measured as if it were a large amount of
 * real content.
 * @param {Element} sectionEl
 */
function measureOwnSize(sectionEl) {
  const clone = sectionEl.cloneNode(true)
  for (const el of clone.querySelectorAll(NON_PROSE_SELECTOR)) {
    el.remove()
  }
  return clone.textContent.trim().length
}

/**
 * Builds a hierarchical section tree from a flat, depth-tagged list,
 * using a stack keyed by depth (headings in the source HTML are flat
 * siblings, not nested elements).
 * @param {object[]} flatSections
 */
function buildHierarchy(flatSections) {
  const roots = []
  const stack = []

  for (const section of flatSections) {
    while (stack.length && stack[stack.length - 1].depth >= section.depth) {
      stack.pop()
    }

    const node = { ...section, children: [] }
    if (stack.length === 0) {
      roots.push(node)
    } else {
      stack[stack.length - 1].node.children.push(node)
    }
    stack.push({ depth: section.depth, node })
  }

  return roots
}

/**
 * Recursively computes each node's subtreeSize (its own size plus all
 * descendants' sizes), mutating the tree in place.
 * @param {object[]} nodes
 */
function computeSubtreeSizes(nodes) {
  let total = 0
  for (const node of nodes) {
    const childrenTotal = computeSubtreeSizes(node.children)
    node.subtreeSize = node.ownSize + childrenTotal
    total += node.subtreeSize
  }
  return total
}

/**
 * Parses a Wikipedia article's rendered HTML (from the REST `with_html`
 * endpoint — see docs/generation.md) into a hierarchical section tree.
 * Pure and deterministic: the same HTML always produces the same tree.
 *
 * @param {string} html
 * @returns {{ lead: { ownSize: number, links: string[] }, sections: object[], totalSize: number }}
 */
export function parseSectionTree(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const topLevelSections = doc.body.querySelectorAll(':scope > section')

  let lead = { ownSize: 0, links: [] }
  const flatSections = []

  for (const sectionEl of topLevelSections) {
    const heading = sectionEl.querySelector(HEADING_SELECTOR)

    if (!heading) {
      // The lead section (before the first heading) has no heading of its own.
      lead = { ownSize: measureOwnSize(sectionEl), links: extractLinks(sectionEl) }
      continue
    }

    const title = heading.textContent.trim()
    if (EXCLUDED_SECTION_TITLES.includes(title.toLowerCase())) continue

    flatSections.push({
      title,
      depth: depthFromHeadingTag(heading.tagName),
      anchor: heading.id || null,
      ownSize: measureOwnSize(sectionEl),
      links: extractLinks(sectionEl),
    })
  }

  const sections = buildHierarchy(flatSections)
  const sectionsTotal = computeSubtreeSizes(sections)

  return { lead, sections, totalSize: lead.ownSize + sectionsTotal }
}
