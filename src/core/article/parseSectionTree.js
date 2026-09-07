import { EXCLUDED_SECTION_TITLES } from '../../engine/generation/config.js'
import { CITATION_MARKER_SELECTOR } from './citationMarkers.js'
import { countSentenceUnits } from './countSentences.js'

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
    // Red links: an article nobody has written yet. MediaWiki marks them
    // class="new" and points them at the edit form rather than at a page,
    // so travelling to one would arrive nowhere.
    if (anchor.classList.contains('new')) continue

    const href = anchor.getAttribute('href') ?? ''
    const raw = href.replace(/^\.\//, '').split('#')[0]
    if (!raw || NON_ARTICLE_NAMESPACE.test(raw)) continue

    // A query string is the other half of the same signal, and the half
    // that actually showed: the href is "./Politics_South?action=edit&
    // redlink=1", and splitting on "#" alone left the whole query inside
    // the title. A "?" in a real title is percent-encoded as %3F, so a
    // literal one here is always a query and never part of the name.
    if (raw.includes('?')) continue

    titles.add(decodeURIComponent(raw).replace(/_/g, ' '))
  }

  return Array.from(titles)
}

/** Counts Wikipedia's inline citation markers, excluding nested sections. */
function countCitations(sectionEl) {
  const clone = sectionEl.cloneNode(true)
  for (const nestedSection of clone.querySelectorAll('section')) {
    nestedSection.remove()
  }
  return clone.querySelectorAll(CITATION_MARKER_SELECTOR).length
}

function citationDensity(citationCount, ownSize) {
  return ownSize > 0 ? citationCount / ownSize : 0
}

/**
 * Measures a section's own prose length and sentence count, excluding
 * non-prose wrapper content (citation lists, navboxes, infoboxes, styles)
 * so a citation-heavy section isn't measured as if it were a large amount
 * of real content.
 *
 * `ownSize` is read BEFORE the sentence counter runs. The counter needs
 * block boundaries marked with newlines to see them at all (see
 * countSentences.js), and those newlines are not prose — ownSize feeds
 * peak height, so it must stay a count of characters an author wrote.
 *
 * @param {Element} sectionEl
 * @returns {{ text: string, ownSize: number, sentenceCount: number }}
 */
function measureOwnText(sectionEl) {
  const clone = sectionEl.cloneNode(true)
  for (const el of clone.querySelectorAll(NON_PROSE_SELECTOR)) {
    el.remove()
  }
  for (const nestedSection of clone.querySelectorAll('section')) {
    nestedSection.remove()
  }
  const text = clone.textContent.trim()
  return {
    text,
    ownSize: text.length,
    sentenceCount: countSentenceUnits(clone, text.length),
  }
}

function isInsideExcludedSection(sectionEl) {
  let parent = sectionEl.parentElement?.closest('section')
  while (parent) {
    const heading = parent.querySelector(HEADING_SELECTOR)
    if (heading && EXCLUDED_SECTION_TITLES.includes(heading.textContent.trim().toLowerCase())) return true
    parent = parent.parentElement?.closest('section')
  }
  return false
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
 * Recursively computes each node's subtreeSize and subtreeSentenceCount
 * (total prose length and sentence count for this node plus all
 * descendants), mutating the tree in place.
 * @param {object[]} nodes
 */
function computeSubtreeSizes(nodes) {
  let total = 0
  for (const node of nodes) {
    const childrenTotal = computeSubtreeSizes(node.children)
    const childrenSentences = node.children.reduce((sum, child) => sum + child.subtreeSentenceCount, 0)
    node.subtreeSize = node.ownSize + childrenTotal
    node.subtreeSentenceCount = node.sentenceCount + childrenSentences
    total += node.subtreeSize
  }
  return total
}

function computeSubtreeCitations(nodes) {
  for (const node of nodes) {
    const childrenTotal = computeSubtreeCitations(node.children)
    node.subtreeCitationCount = node.citationCount + childrenTotal
    node.subtreeCitationDensity = node.subtreeSize > 0 ? node.subtreeCitationCount / node.subtreeSize : 0
    node.subtreeCitationsPerSentence = node.subtreeSentenceCount > 0 ? node.subtreeCitationCount / node.subtreeSentenceCount : 0
  }
  return nodes.reduce((total, node) => total + node.subtreeCitationCount, 0)
}

function countTreeCitations(nodes) {
  return nodes.reduce(
    (total, node) => total + node.citationCount + countTreeCitations(node.children),
    0,
  )
}

/**
 * Parses a Wikipedia article's rendered HTML (from the REST `with_html`
 * endpoint — see docs/generation.md) into a hierarchical section tree.
 * Pure and deterministic: the same HTML always produces the same tree.
 *
 * @param {string} html
 * @returns {{ lead: object, sections: object[], totalSize: number, citationCount: number, sentenceCount: number }}
 */
export function parseSectionTree(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const articleSections = doc.body.querySelectorAll('section')

  let lead = { ownSize: 0, links: [], citationCount: 0, citationDensity: 0 }
  const flatSections = []

  for (const sectionEl of articleSections) {
    const heading = sectionEl.querySelector(HEADING_SELECTOR)

    if (!heading) {
      // The lead section (before the first heading) has no heading of its own.
      const { ownSize, sentenceCount } = measureOwnText(sectionEl)
      const citations = countCitations(sectionEl)
      lead = {
        ownSize,
        sentenceCount,
        links: extractLinks(sectionEl),
        citationCount: citations,
        citationDensity: citationDensity(citations, ownSize),
        citationsPerSentence: sentenceCount > 0 ? citations / sentenceCount : 0,
      }
      continue
    }

    const title = heading.textContent.trim()
  if (EXCLUDED_SECTION_TITLES.includes(title.toLowerCase()) || isInsideExcludedSection(sectionEl)) continue

    const { ownSize, sentenceCount } = measureOwnText(sectionEl)
    const citations = countCitations(sectionEl)
    flatSections.push({
      title,
      depth: depthFromHeadingTag(heading.tagName),
      anchor: heading.id || null,
      ownSize,
      sentenceCount,
      links: extractLinks(sectionEl),
      citationCount: citations,
      citationDensity: citationDensity(citations, ownSize),
      citationsPerSentence: sentenceCount > 0 ? citations / sentenceCount : 0,
    })
  }

  const sections = buildHierarchy(flatSections)
  const sectionsTotal = computeSubtreeSizes(sections)
  computeSubtreeCitations(sections)
  const citationCount = lead.citationCount + countTreeCitations(sections)

  // Article-wide sentence total, summed over the LEAD plus each top-level
  // subtree so nothing is counted twice. This is the denominator of the
  // article's own citation rate (see lushness.js), and it has to be a
  // ratio of totals rather than an average of per-section ratios — an
  // average double-counts every nested section and follows outliers.
  const sentenceCount =
    (lead.sentenceCount ?? 0) + sections.reduce((sum, section) => sum + section.subtreeSentenceCount, 0)

  return { lead, sections, totalSize: lead.ownSize + sectionsTotal, citationCount, sentenceCount }
}
