import { describe, expect, it } from 'vitest'
import { LUSHNESS } from '../../../src/engine/generation/config.js'
import { lushnessBand } from '../../../src/engine/generation/terrain.js'
import {
  annotatePeakLushness,
  computeArticleCitationRate,
  computeLushnessCeiling,
  computeSectionLushness,
  computeShrunkRate,
  relativeRateToUnit,
} from '../../../src/engine/generation/lushness.js'

/**
 * An article well cited enough to use the whole scale — read from config
 * rather than written down, because the saturation point has moved once
 * already. It was 0.35 until live measurement showed real articles run
 * 0.185 to 0.922 citations per sentence, and every test that had spelled
 * 0.35 out started asserting against a throttled ceiling.
 */
const WELL_CITED = LUSHNESS.articleRateSaturation

/** Citations for a section citing at exactly WELL_CITED, for `sentences`. */
function atArticleRate(sentences) {
  return Math.round(sentences * WELL_CITED)
}

describe('computeArticleCitationRate', () => {
  it('is a ratio of totals', () => {
    expect(computeArticleCitationRate({ citationCount: 35, sentenceCount: 150 })).toBeCloseTo(0.2333)
  })

  it('is 0 for an article with no prose, rather than dividing by zero', () => {
    expect(computeArticleCitationRate({ citationCount: 5, sentenceCount: 0 })).toBe(0)
    expect(computeArticleCitationRate({})).toBe(0)
    expect(computeArticleCitationRate()).toBe(0)
  })
})

describe('computeShrunkRate', () => {
  it('leaves a long section close to its own raw rate', () => {
    // 100 sentences, 30 citations: 6 notional sentences barely move it.
    const shrunk = computeShrunkRate(30, 100, 0.1)
    expect(shrunk).toBeCloseTo(0.29, 2)
  })

  it('pulls a one-sentence section almost all the way to the article rate', () => {
    // The measured failure this exists for: 1 citation in 1 sentence used
    // to score 1.0 citations per sentence and render as the lushest land
    // on the map, from a single data point.
    const shrunk = computeShrunkRate(1, 1, 0.2)
    expect(shrunk).toBeLessThan(0.35)
    expect(shrunk).toBeGreaterThan(0.2)
  })

  it('moves a section further the more sentences it has to speak for it', () => {
    const articleRate = 0.2
    const distances = [1, 5, 20, 100].map((sentences) =>
      Math.abs(computeShrunkRate(sentences, sentences, articleRate) - articleRate),
    )

    // Every section here cites at 1.0/sentence; only the evidence differs.
    for (let i = 1; i < distances.length; i++) {
      expect(distances[i]).toBeGreaterThan(distances[i - 1])
    }
  })

  it('treats negative counts as zero rather than inverting the estimate', () => {
    expect(computeShrunkRate(-5, -5, 0.2)).toBeCloseTo(0.2)
  })
})

describe('relativeRateToUnit', () => {
  it('puts the article’s own rate at the middle of the scale', () => {
    expect(relativeRateToUnit(1)).toBeCloseTo(0.5)
  })

  it('is symmetric about the middle in doublings', () => {
    const up = relativeRateToUnit(2) - 0.5
    const down = 0.5 - relativeRateToUnit(0.5)

    expect(up).toBeCloseTo(down)
  })

  it('reaches the ends at the configured span', () => {
    expect(relativeRateToUnit(2 ** LUSHNESS.spanDoublings)).toBeCloseTo(1)
    expect(relativeRateToUnit(2 ** -LUSHNESS.spanDoublings)).toBeCloseTo(0)
  })

  it('is 0 for a zero or negative ratio', () => {
    expect(relativeRateToUnit(0)).toBe(0)
    expect(relativeRateToUnit(-1)).toBe(0)
  })

  it('is monotone increasing', () => {
    const ratios = [0.1, 0.3, 0.6, 1, 1.5, 2.5, 5, 20]
    const values = ratios.map(relativeRateToUnit)

    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThanOrEqual(values[i - 1])
    }
  })
})

describe('computeLushnessCeiling', () => {
  it('is the floor for an article that cites nothing', () => {
    expect(computeLushnessCeiling(0)).toBeCloseTo(LUSHNESS.ceilingFloor)
  })

  it('is 1 for an article at or past saturation', () => {
    expect(computeLushnessCeiling(LUSHNESS.articleRateSaturation)).toBeCloseTo(1)
    expect(computeLushnessCeiling(5)).toBeCloseTo(1)
  })

  it('rises smoothly in between, with no step anywhere', () => {
    // The behaviour the old binary switch at 0.15 did not have: two
    // articles a hair apart must not land in different worlds.
    let previous = computeLushnessCeiling(0)
    for (let rate = 0.005; rate <= 0.5; rate += 0.005) {
      const current = computeLushnessCeiling(rate)
      expect(current).toBeGreaterThanOrEqual(previous)
      expect(current - previous).toBeLessThan(0.02)
      previous = current
    }
  })
})

describe('computeSectionLushness', () => {
  it('puts a section citing at its article’s own rate mid-scale', () => {
    const lushness = computeSectionLushness({ citations: atArticleRate(40), sentences: 40 }, WELL_CITED)

    expect(lushness).toBeCloseTo(0.5, 1)
  })

  it('is exactly 0 for a section that cites nothing', () => {
    // Not a shrunk estimate: "cites nothing" carries no sampling doubt.
    expect(computeSectionLushness({ citations: 0, sentences: 40 }, WELL_CITED)).toBe(0)
    expect(computeSectionLushness({ citations: 0, sentences: 2 }, WELL_CITED)).toBe(0)
  })

  it('is 0 everywhere when the article itself cites nothing', () => {
    expect(computeSectionLushness({ citations: 3, sentences: 10 }, 0)).toBe(0)
  })

  it('ranks a better-cited section above a worse-cited one of the same length', () => {
    const worse = computeSectionLushness({ citations: 5, sentences: 40 }, WELL_CITED)
    const better = computeSectionLushness({ citations: 25, sentences: 40 }, WELL_CITED)

    expect(better).toBeGreaterThan(worse)
  })

  it('does not let a one-sentence section reach the top of the scale', () => {
    // Measured on the old system: cps 1.0, classified jungle.
    const fluke = computeSectionLushness({ citations: 1, sentences: 1 }, 0.2)

    expect(fluke).toBeLessThan(0.75)
  })

  it('caps a poorly cited article’s best section below a well cited one’s average', () => {
    // The absolute ceiling: internal variation alone must not make a
    // barely-sourced article look as green as a featured one.
    const bestOfPoor = computeSectionLushness({ citations: 4, sentences: 40 }, 0.02)
    const averageOfGood = computeSectionLushness({ citations: atArticleRate(40), sentences: 40 }, WELL_CITED)

    expect(bestOfPoor).toBeLessThan(averageOfGood)
  })

  it('stays within [0, 1] for extreme inputs', () => {
    const cases = [
      [{ citations: 9999, sentences: 1 }, 0.001],
      [{ citations: 1, sentences: 9999 }, 5],
      [{ citations: 0, sentences: 0 }, 0.2],
    ]

    for (const [section, rate] of cases) {
      const lushness = computeSectionLushness(section, rate)
      expect(lushness).toBeGreaterThanOrEqual(0)
      expect(lushness).toBeLessThanOrEqual(1)
    }
  })

  it('has no cliff: one more citation never jumps the scalar', () => {
    // The property the whole rewrite is for. 40 sentences, walking the
    // citation count up one at a time.
    let previous = computeSectionLushness({ citations: 1, sentences: 40 }, WELL_CITED)
    for (let citations = 2; citations <= 80; citations++) {
      const current = computeSectionLushness({ citations, sentences: 40 }, WELL_CITED)
      expect(current).toBeGreaterThanOrEqual(previous)
      expect(current - previous).toBeLessThan(0.1)
      previous = current
    }
  })

  it('has no cliff in the article rate either', () => {
    let previous = computeSectionLushness({ citations: 10, sentences: 40 }, 0.005)
    for (let rate = 0.01; rate <= 0.6; rate += 0.005) {
      const current = computeSectionLushness({ citations: 10, sentences: 40 }, rate)
      expect(Math.abs(current - previous)).toBeLessThan(0.02)
      previous = current
    }
  })
})

describe('band coverage', () => {
  /**
   * The measured failure this phase exists to fix: on the old system a
   * healthy article rendered only TWO of five bands, and they could be
   * non-adjacent. A world that shows one colour says nothing about which
   * part of an article is better sourced.
   */
  it('spreads a realistic spread of sections across at least four bands', () => {
    const articleRate = 0.25
    // Sections of ordinary lengths citing between 0.2x and 1.8x the
    // article's own rate — the shape of a normal article.
    const sections = [
      { citations: 0, sentences: 20 }, // cites nothing
      { citations: 1, sentences: 22 }, // far below
      { citations: 5, sentences: 30 }, // below
      { citations: 9, sentences: 34 }, // about the article's rate
      { citations: 8, sentences: 20 }, // above
      { citations: 12, sentences: 26 }, // far above
    ]

    const bands = sections.map((section) => lushnessBand(computeSectionLushness(section, articleRate)))

    expect(new Set(bands).size).toBeGreaterThanOrEqual(4)
  })

  it('keeps the ordering: a better-cited section never gets a drier band', () => {
    const articleRate = 0.25
    const bands = [0, 1, 3, 6, 9, 12, 20, 40].map((citations) =>
      lushnessBand(computeSectionLushness({ citations, sentences: 30 }, articleRate)),
    )

    for (let i = 1; i < bands.length; i++) {
      expect(bands[i]).toBeGreaterThanOrEqual(bands[i - 1])
    }
  })

  it('does not slide the whole map when the article cites more overall', () => {
    // Finding 3: the old system's bands tracked the ABSOLUTE rate, so an
    // article's internal comparison was lost. Past saturation, doubling
    // every count must leave the relative picture alone.
    const spread = [
      { citations: 4, sentences: 30 },
      { citations: 10, sentences: 30 },
      { citations: 20, sentences: 30 },
    ]
    // The base rate has to be AT or above saturation, or scaling up also
    // lifts the ceiling and the bands legitimately move.
    const bandsAt = (multiplier) => {
      const scaled = spread.map((s) => ({ citations: s.citations * multiplier, sentences: s.sentences }))
      return scaled.map((s) => lushnessBand(computeSectionLushness(s, WELL_CITED * multiplier)))
    }

    expect(bandsAt(2)).toEqual(bandsAt(1))
    expect(bandsAt(4)).toEqual(bandsAt(1))
  })
})

describe('annotatePeakLushness', () => {
  it('annotates each peak from its subtree totals', () => {
    const peaks = [
      { citationCount: 20, subtreeSentenceCount: 40 },
      { citationCount: 2, subtreeSentenceCount: 40 },
      { citationCount: 0, subtreeSentenceCount: 40 },
    ]

    annotatePeakLushness(peaks, WELL_CITED)

    expect(peaks[0].lushness).toBeGreaterThan(peaks[1].lushness)
    expect(peaks[2].lushness).toBe(0)
  })

  it('tolerates a peak missing its counts', () => {
    const peaks = [{}]

    annotatePeakLushness(peaks, WELL_CITED)

    expect(peaks[0].lushness).toBe(0)
  })
})
