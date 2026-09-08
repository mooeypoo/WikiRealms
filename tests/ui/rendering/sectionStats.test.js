import { describe, expect, it } from 'vitest'
import {
  estimateWordCount,
  formatSources,
  formatSubsections,
  formatWords,
} from '../../../src/ui/rendering/sectionStats.js'

/**
 * The figures the section tooltip and the Ledger row both report.
 *
 * They live in one module because they used to live in two, phrased
 * differently: "1,240 words" against "1.2K W", "46 refs in 38 sentences"
 * against "46 C", each dividing character counts by 5.5 in its own copy
 * of the arithmetic. A reader hovering a mountain and then clicking it
 * was reading two dialects of the same sentence.
 */

describe('estimateWordCount', () => {
  it('converts characters to words at a ~5.5 chars/word rate', () => {
    expect(estimateWordCount(0)).toBe(0)
    expect(estimateWordCount(55)).toBe(10)
    expect(estimateWordCount(1100)).toBe(200)
  })

  it('clamps negative and non-numeric input to zero', () => {
    expect(estimateWordCount(-100)).toBe(0)
    expect(estimateWordCount(null)).toBe(0)
    expect(estimateWordCount(undefined)).toBe(0)
  })
})

describe('formatWords', () => {
  it('adds thousands separators and pluralizes correctly', () => {
    expect(formatWords(0)).toBe('0 words')
    expect(formatWords(1)).toBe('1 word')
    expect(formatWords(1200)).toBe('1,200 words')
  })
})

describe('formatSources', () => {
  it('states both counts, so a reader can go and check them', () => {
    expect(formatSources(46, 38)).toBe('46 refs in 38 sentences')
  })

  it('says "no refs" rather than "0 refs"', () => {
    expect(formatSources(0, 7)).toBe('no refs in 7 sentences')
  })

  it('singularizes both halves', () => {
    expect(formatSources(1, 1)).toBe('1 ref in 1 sentence')
  })

  it('drops the denominator when there are no sentences to divide by', () => {
    expect(formatSources(3, 0)).toBe('3 refs')
  })

  it('clamps negative and non-numeric input', () => {
    expect(formatSources(-5, -5)).toBe('no refs')
    expect(formatSources('x', 'y')).toBe('no refs')
  })
})

describe('formatSubsections', () => {
  it('pluralizes, and returns nothing for a section with none', () => {
    expect(formatSubsections(3)).toBe('3 subsections')
    expect(formatSubsections(1)).toBe('1 subsection')
    expect(formatSubsections(0)).toBe('')
  })
})
