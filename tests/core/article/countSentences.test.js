import { describe, expect, it } from 'vitest'
import {
  blockSeparatedText,
  countProseSentences,
  countSentenceUnits,
  countStructuralItems,
} from '../../../src/core/article/countSentences.js'

/** Parses a fragment and returns its body, the shape the counter is given. */
function body(fragment) {
  return new DOMParser().parseFromString(`<body>${fragment}</body>`, 'text/html').body
}

describe('blockSeparatedText', () => {
  it('marks a block boundary that textContent would swallow', () => {
    const el = body('<p>One.</p><p>Two.</p>')

    // The bug this exists to fix: textContent gives "One.Two.", with no
    // whitespace for a sentence pattern to anchor on.
    expect(el.textContent).toBe('One.Two.')
    expect(blockSeparatedText(el)).toContain('One.\n')
  })

  it('leaves the caller’s element untouched', () => {
    const el = body('<p>One.</p>')
    blockSeparatedText(el)

    expect(el.textContent).toBe('One.')
  })

  it('removes the citation marker sitting between a full stop and the next word', () => {
    const el = body(
      '<p>Sourced claim.<sup class="mw-ref" typeof="mw:Extension/ref">' +
        '<a><span class="mw-reflink-text">[1]</span></a></sup> Next claim.</p>',
    )

    expect(el.textContent).toContain('claim.[1]')
    expect(blockSeparatedText(el)).not.toContain('[1]')
  })
})

describe('countProseSentences', () => {
  it('counts both sentences across a block boundary', () => {
    // Measured before the fix: one, not two.
    expect(countProseSentences(blockSeparatedText(body('<p>Hello world.</p><p>Next thing.</p>')))).toBe(2)
  })

  it('counts the same text in one paragraph identically', () => {
    // The count must not depend on how the prose is split into blocks.
    const split = countProseSentences(blockSeparatedText(body('<p>Hello world.</p><p>Next thing.</p>')))
    const joined = countProseSentences(blockSeparatedText(body('<p>Hello world. Next thing.</p>')))

    expect(split).toBe(joined)
  })

  it('ends a sentence at a block boundary even before a lowercase word', () => {
    expect(countProseSentences(blockSeparatedText(body('<li>rained today.</li><li>cleared up</li>')))).toBe(1)
  })

  it('ends a sentence before a non-ASCII capital', () => {
    expect(countProseSentences('He left. Ólafur stayed.')).toBe(2)
  })

  it('counts a cited sentence, whose marker used to hide its full stop', () => {
    // The worst case of the block-boundary bug: a marker lands directly
    // after the period by citation convention, so the sentences that went
    // uncounted were exactly the cited ones.
    const el = body(
      '<p>Uncited claim. Cited claim.<sup class="reference"><a>[1]</a></sup></p>' +
        '<p>Also cited.<sup class="reference"><a>[2]</a></sup></p>',
    )

    expect(countProseSentences(blockSeparatedText(el))).toBe(3)
  })

  it('counts question and exclamation marks', () => {
    expect(countProseSentences('Did it? It did! Yes.')).toBe(3)
  })

  it('is zero for empty and whitespace-only text', () => {
    expect(countProseSentences('')).toBe(0)
    expect(countProseSentences('   \n  ')).toBe(0)
    expect(countProseSentences(null)).toBe(0)
  })

  it('does not carry regex state between calls', () => {
    // SENTENCE_END is a global regex; reusing it directly would advance
    // lastIndex and make the second call disagree with the first.
    const text = 'One. Two. Three.'

    expect(countProseSentences(text)).toBe(3)
    expect(countProseSentences(text)).toBe(3)
  })
})

describe('countStructuralItems', () => {
  it('counts unpunctuated list items, which carry a claim each', () => {
    expect(countStructuralItems(body('<ul><li>First item</li><li>Second item</li></ul>'))).toBe(2)
  })

  it('does not count an item the prose counter already counted', () => {
    expect(countStructuralItems(body('<ul><li>A full sentence.</li><li>Bare item</li></ul>'))).toBe(1)
  })

  it('counts a table row once, not once per cell', () => {
    const table = body(
      '<table><tbody><tr><td>1998</td><td>Film</td><td>Director</td></tr></tbody></table>',
    )

    expect(countStructuralItems(table)).toBe(1)
  })

  it('ignores a header row, which labels the table rather than asserting', () => {
    const table = body(
      '<table><thead><tr><th>Year</th><th>Title</th></tr></thead>' +
        '<tbody><tr><td>1998</td><td>Film</td></tr></tbody></table>',
    )

    expect(countStructuralItems(table)).toBe(1)
  })

  it('counts the members of a nested list, not the item grouping them', () => {
    const nested = body('<ul><li>Group<ul><li>alpha</li><li>beta</li></ul></li></ul>')

    expect(countStructuralItems(nested)).toBe(2)
  })

  it('does not double-count a punctuated item carrying a citation marker', () => {
    // "A full sentence.[1]" reads as unpunctuated unless the marker is
    // stripped first, and would then be counted here as well as by the
    // prose counter.
    const el = body('<ul><li>A full sentence.<sup class="reference"><a>[1]</a></sup></li></ul>')

    expect(countStructuralItems(el)).toBe(0)
  })

  it('ignores an empty item', () => {
    expect(countStructuralItems(body('<ul><li>Real item</li><li></li></ul>'))).toBe(1)
  })

  it('is zero for prose with no structure', () => {
    expect(countStructuralItems(body('<p>Just a paragraph.</p>'))).toBe(0)
  })
})

describe('countSentenceUnits', () => {
  it('adds prose sentences and unpunctuated items', () => {
    const el = body('<p>An intro sentence.</p><ul><li>First item</li><li>Second item</li></ul>')

    expect(countSentenceUnits(el, el.textContent.trim().length)).toBe(3)
  })

  it('gives a list-only section a real denominator', () => {
    // Measured before the fix: zero, which made every filmography and
    // discography read as uncited whatever its references.
    const el = body('<ul><li>Alpha film</li><li>Beta film</li><li>Gamma film</li></ul>')

    expect(countSentenceUnits(el, el.textContent.trim().length)).toBe(3)
  })

  it('estimates from length when nothing is detected, rather than flooring at 1', () => {
    // A floor of 1 would hand this section a denominator of one, and any
    // citation in it would read as maximally dense.
    const prose = 'word '.repeat(600) // 3000 characters, no terminator
    const el = body(`<div>${prose}</div>`)
    const length = el.textContent.trim().length

    expect(countSentenceUnits(el, length)).toBe(Math.round(length / 110))
    expect(countSentenceUnits(el, length)).toBeGreaterThan(20)
  })

  it('never estimates below 1 for text shorter than one sentence', () => {
    const el = body('<div>short</div>')

    expect(countSentenceUnits(el, el.textContent.trim().length)).toBe(1)
  })

  it('is zero for a section with no prose at all', () => {
    expect(countSentenceUnits(body(''), 0)).toBe(0)
  })
})
