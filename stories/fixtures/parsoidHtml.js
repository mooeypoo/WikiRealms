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
 *
 * The MARKUP, though, has to be shaped like Parsoid's, and for a while it
 * was not. It emitted one `<p>` per section with empty `<sup>` markers,
 * which meant the fixture could not exhibit either of the two sentence-
 * counting bugs the parser had — a paragraph boundary swallowing its last
 * sentence, and a citation marker's own text ("[1]") hiding the full stop
 * it sits after. A fixture that cannot produce the failures the parser is
 * built to survive is not exercising the parser. So: several paragraphs
 * per section, markers carrying real reflink text at the ends of
 * sentences, and an optional list body for the sections that are tables
 * and lists rather than prose.
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

/**
 * One inline citation marker, in the shape Parsoid emits — including the
 * `mw-reflink-text` span whose "[1]" lands directly after the sentence's
 * full stop. That text is the whole reason countSentences has to strip
 * markers before it can see a sentence end.
 *
 * @param {number} n reference number
 */
function citationMarker(n) {
  return (
    `<sup about="#mwt${n}" class="mw-ref reference" id="cite_ref-${n}" ` +
    `rel="dc:references" typeof="mw:Extension/ref">` +
    `<a href="./X#cite_note-${n}"><span class="mw-reflink-text">[${n}]</span></a></sup>`
  )
}

/** Sentences per paragraph. Long enough to be prose, short enough to give
 * a section several paragraph boundaries to lose sentences at. */
const SENTENCES_PER_PARAGRAPH = 4

/**
 * Prose body: several paragraphs, with `cites` markers distributed at the
 * ENDS of the first sentences rather than clumped at the very end, which
 * is where a citation actually goes.
 */
function proseBody({ sentences = 12, cites = 0, links = [], proseOffset = 0 }) {
  const lines = []
  for (let i = 0; i < sentences; i++) {
    lines.push(SENTENCE_POOL[(i + proseOffset) % SENTENCE_POOL.length])
  }
  if (links.length > 0) lines.push(`See also ${links.map(wikiLink).join(', ')}.`)

  // Spread the markers evenly over the sentences, so a well-cited section
  // has one every few sentences rather than a block of them at the end.
  const step = cites > 0 ? Math.max(1, Math.floor(lines.length / cites)) : 0
  let placed = 0
  const cited = lines.map((line, i) => {
    if (placed < cites && step > 0 && i % step === 0) {
      placed += 1
      return line + citationMarker(placed)
    }
    return line
  })
  // Any markers the spread could not fit (more citations than sentences)
  // go on the last line, which is also what a dense stub looks like.
  if (placed < cites) {
    const extra = Array.from({ length: cites - placed }, (_, i) => citationMarker(placed + i + 1)).join('')
    cited[cited.length - 1] += extra
  }

  const paragraphs = []
  for (let i = 0; i < cited.length; i += SENTENCES_PER_PARAGRAPH) {
    paragraphs.push(`<p>${cited.slice(i, i + SENTENCES_PER_PARAGRAPH).join(' ')}</p>`)
  }
  return paragraphs.join('')
}

/**
 * List body, for a section that is a filmography, a discography or a
 * results table rather than prose. Items carry no sentence punctuation,
 * which is exactly the case that used to count as zero sentences and
 * render the section as uncited whatever it referenced.
 */
function listBody({ items = 8, cites = 0, links = [], proseOffset = 0 }) {
  const entries = []
  for (let i = 0; i < items; i++) {
    const label = SENTENCE_POOL[(i + proseOffset) % SENTENCE_POOL.length].split(' ').slice(0, 4).join(' ')
    const marker = i < cites ? citationMarker(i + 1) : ''
    entries.push(`<li>${label}${marker}</li>`)
  }
  const linkMarkup =
    links.length > 0 ? `<p>See also ${links.map(wikiLink).join(', ')}.</p>` : ''
  return `${linkMarkup}<ul>${entries.join('')}</ul>`
}

function sectionBody(node) {
  return node.list ? listBody(node) : proseBody(node)
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
 * @param {{ lead: object, sections: object[] }} outline each node takes
 *   `{ title, anchor, sentences, cites, links, children }`, or
 *   `{ list: true, items, cites }` for a list/table section
 * @returns {string} HTML in the shape parseSectionTree expects
 */
export function buildParsoidHtml({ lead, sections }) {
  const leadHtml = `<section>${sectionBody(lead)}</section>`
  const sectionsHtml = sections.map((node, index) => renderSection(node, 1, index)).join('')
  return `<body>${leadHtml}${sectionsHtml}</body>`
}
