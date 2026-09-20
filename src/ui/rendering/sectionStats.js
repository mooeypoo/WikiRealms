/**
 * The facts a section reports about itself, in the words both surfaces
 * use for them.
 *
 * Two places describe a section: the tooltip that appears when you hover
 * its summit, and the Ledger row you get when you click it. They were
 * computing the same figures separately and phrasing them differently —
 * the tooltip said "1,240 words" and the Ledger said "1.2K W" for the
 * same section, and both divided character counts by 5.5 in their own
 * copy of the arithmetic.
 *
 * A reader who hovers a mountain and then clicks it should be reading the
 * same sentence twice, in more detail the second time. Not two dialects.
 *
 * Phrasing goes through banana-i18n so the tooltip and Ledger stay on one
 * vocabulary when the UI locale changes. Number grouping follows the UI
 * locale's BCP-47 tag (via getEdition).
 */
import { getEdition } from '../../core/i18n/wikipediaEditions.js'
import { getUiLocale, t } from '../i18n/banana.js'

/** Engine id for the folded leftover-sections peak — keep for lookups. */
export const AGGREGATE_SECTION_TITLE = 'Miscellaneous'

/**
 * Localised label for a section title. Engine ids stay English; only the
 * synthetic aggregate is rewritten for display.
 *
 * @param {string | null | undefined} title
 * @returns {string}
 */
export function displaySectionTitle(title) {
  if (!title) return t('wikirealms-section-untitled')
  if (title === AGGREGATE_SECTION_TITLE) return t('wikirealms-section-miscellaneous')
  return title
}

/**
 * Rough "words" estimate from own-size (character count). Wikipedia's
 * average English-prose word length is ~5.1 chars including trailing
 * space, so dividing by 5.5 undershoots slightly — matches the "words
 * of actual prose" reading better than a tighter divisor would.
 *
 * @param {number} ownSizeChars
 */
export function estimateWordCount(ownSizeChars) {
  const chars = Math.max(0, Number(ownSizeChars) || 0)
  return Math.round(chars / 5.5)
}

/**
 * Thousands separators for the active UI locale (e.g. en → 1,200, de → 1.200).
 * @param {number} n
 * @returns {string}
 */
export function formatInteger(n) {
  const int = Math.max(0, Math.round(Number(n) || 0))
  const locale = getEdition(getUiLocale()).bcp47 || 'en'
  return int.toLocaleString(locale)
}

/**
 * Formats an integer with thousands separators (e.g. 1200 -> "1,200
 * words" in English UI).
 *
 * @param {number} n
 */
export function formatWords(n) {
  const int = Math.max(0, Math.round(Number(n) || 0))
  return t('wikirealms-stat-words', formatInteger(int), int)
}

/**
 * Formats a section's evidence as something a reader can go and check.
 *
 * @param {number} citations
 * @param {number} sentences
 * @returns {string}
 */
export function formatSources(citations, sentences) {
  const refCount = Math.max(0, Math.round(Number(citations) || 0))
  const sentenceCount = Math.max(0, Math.round(Number(sentences) || 0))
  if (refCount === 0 && sentenceCount === 0) return t('wikirealms-stat-no-refs')
  if (refCount === 0) {
    return t('wikirealms-stat-no-refs-in-sentences', sentenceCount)
  }
  if (sentenceCount === 0) return t('wikirealms-stat-refs', refCount)
  return t('wikirealms-stat-sources', refCount, sentenceCount)
}

/**
 * "3 subsections", or an empty string for a section with none — so a
 * caller can drop it rather than print a zero.
 *
 * @param {number} count
 */
export function formatSubsections(count) {
  const n = Math.max(0, Math.round(Number(count) || 0))
  if (n === 0) return ''
  return t('wikirealms-stat-subsections', n)
}

/**
 * "4 portals leave here", or an empty string for a section none leave.
 *
 * @param {number} count
 */
export function formatPortals(count) {
  const n = Math.max(0, Math.round(Number(count) || 0))
  if (n === 0) return ''
  return t('wikirealms-stat-portals-leave', n)
}

/** A bare integer with thousands separators, for a column that carries its own heading. */
export function formatCount(n) {
  return formatInteger(n)
}

/**
 * Compact 30-day pageviews for a Ledger readout tile.
 * Null / unknown → em dash (metrics soft-failed or not yet fetched).
 *
 * @param {number|null|undefined} n
 * @returns {string}
 */
export function formatPageviews(n) {
  if (n == null || !Number.isFinite(n) || n < 0) return '—'
  const int = Math.max(0, Math.round(n))
  if (int >= 1_000_000) return `${(int / 1_000_000).toFixed(1)}M`
  if (int >= 1000) return `${(int / 1000).toFixed(1)}k`
  return String(int)
}
