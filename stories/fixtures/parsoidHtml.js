/**
 * Builds Parsoid-shaped article HTML from a declarative outline.
 *
 * Story fixtures go article HTML → parseSectionTree → generateWorld, through
 * the real parser and the real engine. Hand-authoring a section tree instead
 * would mean restating ownSize, subtreeSize, subtreeCitationCount and the
 * citation densities by hand — values the parser computes — so the fixture
 * would drift from the parser the first time either changed, and stories
 * would show terrain the app could never produce.
 *
 * Prose is generated rather than written: terrain height reads a section's
 * text LENGTH, so what a fixture needs is a controllable number of
 * characters, not meaningful copy.
 */

// Cycled deterministically, so the same outline always yields the same
// character counts and therefore the same terrain.
const SENTENCE_POOL = [
  'The gap is not empty, and resolved imaging shows structure throughout its width.',
  'Ringlet positions were measured across several occultations and found to be stable.',
  'Density waves propagate outward from the inner edge at a predictable rate.',
  'Spectra indicate water ice with a small fraction of darker contaminants.',
  'Shepherding by a nearby resonance accounts for much of the observed sharpness.',
  'Later passes refined the eccentricity estimate by an order of magnitude.',
  'The boundary is sharper on its inner side than on its outer side.',
  'Optical depth varies by a factor of several across the region.',
]

/**
 * Deterministic filler prose of a given sentence count.
 * @param {number} sentences
 * @param {number} [offset] shifts where in the pool the run starts
 * @returns {string}
 */
export function prose(sentences, offset = 0) {
  const out = []
  for (let i = 0; i < sentences; i++) {
    out.push(SENTENCE_POOL[(i + offset) % SENTENCE_POOL.length])
  }
  return out.join(' ')
}

function wikiLink(title) {
  const href = `./${title.replace(/ /g, '_')}`
  return `<a rel="mw:WikiLink" href="${href}">${title}</a>`
}

function citations(count) {
  return '<sup class="mw-ref"></sup>'.repeat(count)
}

function sectionBody({ sentences = 12, cites = 0, links = [], proseOffset = 0 }) {
  const linkMarkup = links.length > 0 ? ` See also ${links.map(wikiLink).join(', ')}.` : ''
  return `<p>${prose(sentences, proseOffset)}${linkMarkup}${citations(cites)}</p>`
}

function renderSection(node, depth, index) {
  const tag = `h${depth + 1}` // depth 1 → h2, matching depthFromHeadingTag
  const children = (node.children ?? [])
    .map((child, childIndex) => renderSection(child, depth + 1, childIndex))
    .join('')

  return (
    `<section>` +
    `<${tag} id="${node.anchor}">${node.title}</${tag}>` +
    sectionBody({ ...node, proseOffset: index + depth }) +
    children +
    `</section>`
  )
}

/**
 * @param {{ lead: object, sections: object[] }} outline
 * @returns {string} HTML in the shape parseSectionTree expects
 */
export function buildParsoidHtml({ lead, sections }) {
  const leadHtml = `<section>${sectionBody(lead)}</section>`
  const sectionsHtml = sections.map((node, index) => renderSection(node, 1, index)).join('')
  return `<body>${leadHtml}${sectionsHtml}</body>`
}
