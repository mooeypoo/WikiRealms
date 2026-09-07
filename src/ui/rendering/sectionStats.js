/**
 * The facts a section reports about itself, in the words both surfaces
 * use for them.
 *
 * Two places describe a section: the tooltip that appears when you hover
 * its summit, and the Ledger row you get when you click it. They were
 * computing the same figures separately and phrasing them differently —
 * the tooltip said "1,240 words" and "46 refs in 38 sentences" while the
 * Ledger said "1.2K W" and "46 C" for the same section, and both divided
 * character counts by 5.5 in their own copy of the arithmetic.
 *
 * A reader who hovers a mountain and then clicks it should be reading the
 * same sentence twice, in more detail the second time. Not two dialects.
 *
 * Pure and framework-free.
 */

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
 * Formats an integer with thousands separators (e.g. 1200 -> "1,200
 * words"). Pure so tests don't depend on Intl.NumberFormat being
 * English-locale-only on every runner.
 *
 * @param {number} n
 */
export function formatWords(n) {
  const int = Math.max(0, Math.round(Number(n) || 0))
  return `${int.toLocaleString('en-US')} word${int === 1 ? '' : 's'}`
}

/**
 * Formats a section's evidence as something a reader can go and check.
 *
 * This is the only number either surface states about citations, and that
 * is deliberate. The band comes from a scalar built out of a shrinkage
 * estimator, a log-ratio against the article's own rate and a smooth
 * ceiling (see lushness.js); printing THAT as a percentage would be a
 * figure nobody can verify and the engine does not use, which is what got
 * an earlier version's percentages deleted. Two counts can be verified by
 * opening the article and counting.
 *
 * They also carry something the band cannot: the SIZE of the evidence.
 * One reference in one sentence and forty-six in thirty-eight are very
 * different claims, and the scale treats them differently — the first is
 * shrunk hard toward the article's own rate — so showing the counts shows
 * why a short section reads as ordinary.
 *
 * @param {number} citations
 * @param {number} sentences
 * @returns {string}
 */
export function formatSources(citations, sentences) {
  const refCount = Math.max(0, Math.round(Number(citations) || 0))
  const sentenceCount = Math.max(0, Math.round(Number(sentences) || 0))
  const refs = refCount === 0 ? 'no refs' : `${refCount} ref${refCount === 1 ? '' : 's'}`
  if (sentenceCount === 0) return refs
  return `${refs} in ${sentenceCount} sentence${sentenceCount === 1 ? '' : 's'}`
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
  return `${n} subsection${n === 1 ? '' : 's'}`
}
