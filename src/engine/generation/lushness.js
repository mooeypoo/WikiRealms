/**
 * How a section's citation habits become one number.
 *
 * Land lushness answers a question about the article you are standing in:
 * "is this part of it better sourced than the rest?" That is a comparison,
 * so the signal is relative — but it also has to stay honest about
 * articles that cite almost nothing, or a stub's best paragraph would
 * read as lush as a featured article's.
 *
 * Four steps, in order:
 *
 *   1. SHRINKAGE. A section's citations-per-sentence is pulled toward the
 *      article's own rate by LUSHNESS.shrinkageSentences notional
 *      sentences. Short sections then read as typical rather than as
 *      extremes.
 *   2. ARTICLE RATE. Total citations over total sentences — a ratio of
 *      totals, counted once. Not a mean of per-section ratios, which
 *      double-counts nesting and follows outliers.
 *   3. RELATIVE INDEX. The section's rate over the article's, expressed
 *      in doublings so the scale is symmetric about "same as the
 *      article".
 *   4. ABSOLUTE CEILING. The relative figure is scaled by how well the
 *      article cites in absolute terms, so a poorly-sourced article
 *      cannot reach the top of the scale on internal variation alone.
 *
 * Every step is continuous. There is deliberately no threshold anywhere
 * in this file: two articles differing by one citation must not render
 * as visibly different worlds.
 *
 * Pure and deterministic. Tunables live in config.js LUSHNESS.
 */
import { LUSHNESS } from './config.js'

function clamp01(value) {
  return Math.min(1, Math.max(0, value))
}

/** Smooth 0→1 ramp with zero slope at both ends. */
function smoothstep(edge0, edge1, value) {
  if (edge1 <= edge0) return value >= edge1 ? 1 : 0
  const t = clamp01((value - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

/**
 * Step 2: the article's own citations-per-sentence.
 *
 * Takes the parsed section tree's article-wide totals, so the lead counts
 * and no subtree is counted twice.
 *
 * @param {{ citationCount?: number, sentenceCount?: number }} sectionTree
 * @returns {number} citations per sentence, 0 for an article with no prose
 */
export function computeArticleCitationRate({ citationCount = 0, sentenceCount = 0 } = {}) {
  return sentenceCount > 0 ? citationCount / sentenceCount : 0
}

/**
 * Step 1: a section's citations-per-sentence, shrunk toward the article's
 * rate.
 *
 * `(C + k·m) / (S + k)` — the section is treated as if it also contained
 * `k` sentences that cite exactly like the rest of the article. A long
 * section barely moves; a two-sentence one lands near the article rate,
 * which is the honest reading of two data points.
 *
 * @param {number} citations
 * @param {number} sentences
 * @param {number} articleRate
 * @returns {number}
 */
export function computeShrunkRate(citations, sentences, articleRate) {
  const k = LUSHNESS.shrinkageSentences
  return (Math.max(0, citations) + k * articleRate) / (Math.max(0, sentences) + k)
}

/**
 * Step 4: how much of the scale this article is allowed to use.
 *
 * Ramps from `ceilingFloor` to 1 as the article's own rate approaches
 * `articleRateSaturation`. Smooth at both ends, so no article sits on an
 * edge where a single citation changes the whole world.
 *
 * @param {number} articleRate
 * @returns {number} in [ceilingFloor, 1]
 */
export function computeLushnessCeiling(articleRate) {
  const reached = smoothstep(0, LUSHNESS.articleRateSaturation, articleRate)
  return LUSHNESS.ceilingFloor + (1 - LUSHNESS.ceilingFloor) * reached
}

/**
 * Step 3: a relative rate as a position on [0, 1], centred on 0.5.
 *
 * Measured in doublings: `ratio` 1 is 0.5, and `LUSHNESS.spanDoublings`
 * doublings either side reach the ends. Logarithmic because the
 * interesting comparison is multiplicative — "twice as cited" should be
 * the same step whether it starts at 0.1 or 0.4 citations per sentence.
 *
 * @param {number} ratio section rate over article rate
 * @returns {number} in [0, 1]
 */
export function relativeRateToUnit(ratio) {
  if (!(ratio > 0)) return 0
  return clamp01(0.5 + Math.log2(ratio) / (2 * LUSHNESS.spanDoublings))
}

/**
 * A section's lushness, in [0, 1]. Feeds ground colour, foliage and the
 * band the legend names.
 *
 * Counts are the section's SUBTREE totals: a section's territory on the
 * map covers everything nested inside it, so its ground should reflect
 * that whole subtree, the same way its peak's breadth already does.
 *
 * Exactly 0 is RESERVED for a section citing nothing at all, which
 * bypasses the shrinkage: shrinkage exists to stop small samples reading
 * as extremes, but "this section cites nothing" carries no sampling
 * doubt — it is a fact about the text as written, and the map should say
 * so plainly.
 *
 * Everything else is floored at `LUSHNESS.citedFloor`, just above 0, so a
 * poorly-cited section cannot land on the reserved value. Measured on the
 * fixture without that floor: a section with one citation in 22 sentences
 * came out at 0 and rendered as bare dunes, saying "no sources" about
 * text that had one.
 *
 * @param {{ citations?: number, sentences?: number }} section subtree totals
 * @param {number} articleRate from computeArticleCitationRate
 * @returns {number} 0, or in [LUSHNESS.citedFloor, 1]
 */
export function computeSectionLushness({ citations = 0, sentences = 0 } = {}, articleRate) {
  // No citations anywhere in the article: nothing to compare, and no
  // section has earned any greenery.
  if (!(articleRate > 0)) return 0
  if (citations <= 0) return 0

  const ratio = computeShrunkRate(citations, sentences, articleRate) / articleRate
  const lushness = relativeRateToUnit(ratio) * computeLushnessCeiling(articleRate)
  return Math.min(1, Math.max(LUSHNESS.citedFloor, lushness))
}

/**
 * Annotates each peak with its `lushness`, in place.
 *
 * Runs over peaks rather than over the section tree because the peaks are
 * what the terrain pass owns, and because peak folding (see
 * sectionPeakLimits.js) has already aggregated any sections that did not
 * earn their own summit.
 *
 * @param {object[]} peaks
 * @param {number} articleRate
 * @returns {object[]} the same array
 */
export function annotatePeakLushness(peaks, articleRate) {
  for (const peak of peaks) {
    peak.lushness = computeSectionLushness(
      { citations: peak.citationCount ?? 0, sentences: peak.subtreeSentenceCount ?? 0 },
      articleRate,
    )
  }
  return peaks
}
