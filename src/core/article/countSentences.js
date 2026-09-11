/**
 * Counts the units of claim in a section's prose — the denominator for
 * citations-per-sentence, which drives land lushness (docs/generation.md).
 *
 * "Sentence" here is a proxy for "a statement that could carry a
 * citation", so this counts two kinds of unit and adds them:
 *
 * - prose sentences, found by punctuation;
 * - structural items (list entries, table rows, definition bodies), each
 *   of which is one claim whether or not it is punctuated as a sentence.
 *
 * Both are needed. Counting only punctuation reports zero units for a
 * filmography, a discography or a results table, and the section then
 * reads as uncited however many references it carries. Counting only
 * items reports zero for ordinary paragraphs.
 *
 * Pure and deterministic: the same element always yields the same count.
 */
import { CITATION_MARKER_SELECTOR } from './citationMarkers.js'

/**
 * Block-level elements Parsoid emits inside article prose.
 *
 * `textContent` concatenates across element boundaries with NO separator,
 * so `<p>One.</p><p>Two.</p>` arrives as "One.Two." — the period has no
 * whitespace after it, the sentence pattern below cannot fire, and the
 * last sentence of every block is lost. Appending a newline inside each
 * of these before reading the text is what makes block boundaries
 * visible to a text-based counter.
 */
const BLOCK_SELECTOR =
  'p, li, dd, dt, tr, td, th, div, blockquote, pre, figcaption, h1, h2, h3, h4, h5, h6'

/**
 * Structural elements that each carry one claim.
 *
 * A table ROW is the unit, not a cell: "1998 | Film | Director" is one
 * citable statement split across three cells, and counting cells would
 * treble every table's denominator.
 *
 * KNOWN LIMITATION: `p` is deliberately absent, so a paragraph carrying no
 * sentence-ending punctuation contributes nothing unless it is the only
 * content in the section, in which case the length estimate in
 * countSentenceUnits catches it. Adding `p` here would fight the row rule
 * above — a `<tr>` whose cells wrap their text in `<p>` would then count
 * once per cell again. Unpunctuated paragraphs are rare in article prose,
 * and the effect is a slightly small denominator rather than a zero one.
 */
const ITEM_SELECTOR = 'li, tr, dd'

/**
 * Characters per sentence, used only to estimate a denominator for prose
 * where nothing was detected at all (see countSentenceUnits).
 *
 * 110 = ~20 words at the ~5.5 chars-per-word figure sectionTooltip.js
 * already uses for English Wikipedia prose.
 */
const CHARS_PER_SENTENCE = 110

/**
 * Sentence-ending punctuation, accepted when followed by a block
 * boundary, a capitalised word, or the end of the text.
 *
 * `\p{Lu}` rather than `[A-Z]` so a sentence starting on a name like
 * "Ólafur" or "Żeleński" still terminates the one before it.
 *
 * KNOWN LIMITATION: an abbreviation followed by a capitalised word is
 * counted as a sentence end — "Dr. Smith" and "et al. Later" both fire.
 * The count is therefore an overestimate on prose carrying titles and
 * initials. This is deliberate: suppressing abbreviations also suppresses
 * the real sentence ends in "...founded in the U.S. The next year...",
 * which is at least as common in article prose, so a guard trades one
 * error for another. The overcount is roughly uniform across a section
 * and lands in the denominator, where it makes lushness conservative.
 *
 * For languages without capital sentence starts (Arabic, Hebrew, …) use
 * `unicode-punct` via countProseSentences(..., { sentenceModel }). For
 * CJK / Thai-family scripts use `char-estimate`, which prefers the length
 * fallback over Latin punctuation matches.
 */
const SENTENCE_END_LATIN = /[.!?]+(?=\s*\n|\s+\p{Lu}|\s*$)/gu

/** Broader terminator set; does not require a following capital letter. */
const SENTENCE_END_UNICODE = /[.!?。．؟！…]+(?=\s*\n|\s+|\s*$)/gu

/**
 * The element's text, with inline citation markers removed and block
 * boundaries marked by newlines — the two edits a text-based sentence
 * counter needs before it can see a sentence at all.
 *
 * Clones, so the caller's element is untouched.
 *
 * @param {Element} el
 * @returns {string}
 */
export function blockSeparatedText(el) {
  const clone = el.cloneNode(true)
  // Before the newlines: a marker's own text ("[1]") sits between the
  // full stop and the whitespace after it, hiding the sentence end.
  for (const marker of clone.querySelectorAll(CITATION_MARKER_SELECTOR)) {
    marker.remove()
  }
  for (const block of clone.querySelectorAll(BLOCK_SELECTOR)) {
    block.appendChild(clone.ownerDocument.createTextNode('\n'))
  }
  return clone.textContent
}

/**
 * Counts sentences in text by punctuation. Expects block boundaries to
 * already be newlines — see blockSeparatedText.
 *
 * @param {string} text
 * @param {{ sentenceModel?: 'latin-punct' | 'unicode-punct' | 'char-estimate' }} [options]
 * @returns {number}
 */
export function countProseSentences(text, { sentenceModel = 'latin-punct' } = {}) {
  if (!text || text.trim().length === 0) return 0
  if (sentenceModel === 'char-estimate') {
    // Latin punctuation is rare in these scripts; trust length estimation
    // in countSentenceUnits rather than a handful of false matches.
    return 0
  }
  // `match` with a global regex resets lastIndex before it starts, so the
  // shared pattern is safe here. `test` and `exec` would NOT be — they
  // advance lastIndex and would make consecutive calls disagree.
  const pattern = sentenceModel === 'unicode-punct' ? SENTENCE_END_UNICODE : SENTENCE_END_LATIN
  const matches = text.match(pattern)
  return matches ? matches.length : 0
}

/**
 * Counts structural items that are not already counted as prose.
 *
 * @param {Element} el
 * @param {{ sentenceModel?: 'latin-punct' | 'unicode-punct' | 'char-estimate' }} [options]
 * @returns {number}
 */
export function countStructuralItems(el, { sentenceModel = 'latin-punct' } = {}) {
  let count = 0

  for (const item of el.querySelectorAll(ITEM_SELECTOR)) {
    // An outer <li> that exists only to group a nested list is not
    // itself a claim; counting it would count the group and its members.
    if (item.querySelector(ITEM_SELECTOR)) continue

    // A row of header cells labels the table, it does not assert
    // anything. A <tr> with no <td> at all is a header row or an empty
    // one, and neither is a claim.
    if (item.tagName === 'TR' && !item.querySelector('td')) continue

    if (item.textContent.trim().length === 0) continue

    // Already counted by countProseSentences — a list of full sentences
    // must not count twice. Tested through the same normalization the
    // prose counter uses, or an item ending "…sentence.[1]" would read as
    // unpunctuated here and be counted a second time.
    if (countProseSentences(blockSeparatedText(item), { sentenceModel }) > 0) continue

    count++
  }

  return count
}

/**
 * The section's sentence count: prose sentences plus unpunctuated
 * structural items.
 *
 * When neither finds anything but there IS prose, the count is estimated
 * from its length rather than floored at 1. A floor of 1 would hand a
 * 3000-character section a denominator of one, and any citation in it
 * would then read as maximally dense — the same small-sample failure
 * this counter exists to avoid, arriving from the other direction.
 *
 * @param {Element} el section element, already stripped of non-prose
 *   wrappers and nested sections by the caller
 * @param {number} proseLength the section's own prose length in characters
 * @param {{ sentenceModel?: 'latin-punct' | 'unicode-punct' | 'char-estimate' }} [options]
 * @returns {number}
 */
export function countSentenceUnits(el, proseLength, { sentenceModel = 'latin-punct' } = {}) {
  const counted =
    countProseSentences(blockSeparatedText(el), { sentenceModel }) +
    countStructuralItems(el, { sentenceModel })
  if (counted > 0) return counted
  if (proseLength <= 0) return 0
  return Math.max(1, Math.round(proseLength / CHARS_PER_SENTENCE))
}
