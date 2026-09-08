import { describe, expect, it } from 'vitest'
import { articleAverageLushness, buildSectionRows, countRows } from '../../../src/ui/rendering/sectionRows.js'

/**
 * The parsed tree: what the article says. Five top-level sections in the
 * order they appear, one of them with two subsections.
 */
function parsedTree(overrides = {}) {
  const leaf = (title, size, refs, sentences) => ({
    title,
    anchor: title,
    ownSize: size,
    subtreeSize: size,
    citationCount: refs,
    subtreeCitationCount: refs,
    sentenceCount: sentences,
    subtreeSentenceCount: sentences,
    children: [],
  })

  return {
    lead: { ownSize: 200, sentenceCount: 10, citationCount: 4, links: [] },
    totalSize: 5000,
    citationCount: 40,
    sentenceCount: 200,
    sections: [
      {
        ...leaf('Discovery', 400, 6, 20),
        subtreeSize: 1100,
        subtreeCitationCount: 26,
        subtreeSentenceCount: 60,
        children: [leaf('Early', 500, 18, 25), leaf('Late', 200, 2, 15)],
      },
      leaf('Structure', 2000, 9, 40),
      leaf('Composition', 900, 3, 30),
      leaf('Trivia', 60, 1, 3),
      leaf('Naming', 40, 1, 2),
    ],
    ...overrides,
  }
}

/**
 * The generated peaks: what the map shows. Deliberately NOT in article
 * order — applyPeakLimits sorts each level by subtree size, which is the
 * order the engine wants and the wrong one for a reader.
 */
const PEAKS = [
  { title: 'Structure', anchor: 'Structure', depth: 1, sectionIndex: 0, lushness: 0.2, ownSize: 2000, subtreeSize: 2000, citationCount: 9, ownCitationCount: 9, subtreeSentenceCount: 40, sentenceCount: 40 },
  { title: 'Discovery', anchor: 'Discovery', depth: 1, sectionIndex: 1, lushness: 0.72, ownSize: 400, subtreeSize: 1100, citationCount: 26, ownCitationCount: 6, subtreeSentenceCount: 60, sentenceCount: 20 },
  { title: 'Early', anchor: 'Early', depth: 2, sectionIndex: 1, lushness: 0.95, ownSize: 500, subtreeSize: 500, citationCount: 18, ownCitationCount: 18, subtreeSentenceCount: 25, sentenceCount: 25 },
  { title: 'Late', anchor: 'Late', depth: 2, sectionIndex: 1, lushness: 0.1, ownSize: 200, subtreeSize: 200, citationCount: 2, ownCitationCount: 2, subtreeSentenceCount: 15, sentenceCount: 15 },
  { title: 'Composition', anchor: 'Composition', depth: 1, sectionIndex: 4, lushness: 0.5, ownSize: 900, subtreeSize: 900, citationCount: 3, ownCitationCount: 3, subtreeSentenceCount: 30, sentenceCount: 30 },
]

/** The two smallest sections did not earn summits and were folded into one. */
const AGGREGATE = {
  title: 'Miscellaneous',
  anchor: null,
  depth: 1,
  sectionIndex: 5,
  lushness: 0.3,
  ownSize: 100,
  subtreeSize: 100,
  citationCount: 2,
  ownCitationCount: 2,
  subtreeSentenceCount: 5,
  sentenceCount: 5,
}

const titlesOf = (rows) => rows.map((row) => row.title)
const find = (rows, title) => rows.find((row) => row.title === title)

describe('buildSectionRows', () => {
  it('lists the ranges the world actually has, in the order the article puts them', () => {
    // The peaks arrive sorted by size, because that is what peak folding
    // needs. A ledger sorted by size reads as a ranking of an article
    // rather than as a reading of one.
    const { rows } = buildSectionRows({ sections: parsedTree() }, { terrain: { peaks: PEAKS } })

    expect(titlesOf(rows)).toEqual(['Discovery', 'Structure', 'Composition'])
  })

  it('gives every subsection a row of its own', () => {
    // They have their own summits and their own bands. Before this they
    // were one clause on their parent's row — "2 subsections, Sparse to
    // Lush" — which reports that variation exists and gives no way to
    // find out which child is which.
    const { rows } = buildSectionRows({ sections: parsedTree() }, { terrain: { peaks: PEAKS } })

    expect(titlesOf(find(rows, 'Discovery').children)).toEqual(['Early', 'Late'])
    expect(find(rows, 'Structure').children).toEqual([])
  })

  it('names every row by peak index, including the one with no heading', () => {
    // Anchors are Wikipedia's and the aggregate has none, so an
    // anchor-keyed list cannot name the mountain it is standing on —
    // which is why clicking that range used to do nothing at all.
    const { rows } = buildSectionRows(
      { sections: parsedTree() },
      { terrain: { peaks: [...PEAKS, AGGREGATE] } },
    )

    expect(find(rows, 'Discovery').peakIndex).toBe(1)
    expect(find(rows, 'Discovery').children[0].peakIndex).toBe(2)

    const aggregate = find(rows, 'Miscellaneous')
    expect(aggregate.anchor).toBeNull()
    expect(aggregate.peakIndex).toBe(5)
    expect(aggregate.isAggregate).toBe(true)
  })

  it('gives the folded sections rows under the range they were folded into', () => {
    // Otherwise the map carries a mountain called "Miscellaneous" that
    // never says what is in it, and the list carries rows for sections
    // that are not anywhere.
    const { rows } = buildSectionRows(
      { sections: parsedTree() },
      { terrain: { peaks: [...PEAKS, AGGREGATE] } },
    )

    expect(titlesOf(find(rows, 'Miscellaneous').children)).toEqual(['Trivia', 'Naming'])
  })

  it('marks a folded section as having no ground of its own', () => {
    const { rows } = buildSectionRows(
      { sections: parsedTree() },
      { terrain: { peaks: [...PEAKS, AGGREGATE] } },
    )
    const [trivia] = find(rows, 'Miscellaneous').children

    expect(trivia.hasGround).toBe(false)
    expect(trivia.peakIndex).toBeNull()
    expect(trivia.lushness).toBeNull()
  })

  it('leaves the aggregate at the end, where a remainder belongs', () => {
    const { rows } = buildSectionRows(
      { sections: parsedTree() },
      { terrain: { peaks: [...PEAKS, AGGREGATE] } },
    )

    expect(titlesOf(rows).at(-1)).toBe('Miscellaneous')
  })

  it('lists nothing for an article whose world has no peaks', () => {
    const { rows, count } = buildSectionRows({ sections: parsedTree() }, null)

    expect(rows).toEqual([])
    expect(count).toBe(0)
  })

  describe('figures', () => {
    it('separates what a range holds from what it wrote itself', () => {
      // The old row took Math.max(subtreeSize, ownSize) for words and
      // subtree totals for citations, so a parent's word count silently
      // included its children while sitting beside "2 subsections".
      const { rows } = buildSectionRows({ sections: parsedTree() }, { terrain: { peaks: PEAKS } })
      const discovery = find(rows, 'Discovery')

      expect(discovery.subtreeSize).toBe(1100)
      expect(discovery.ownSize).toBe(400)
      expect(discovery.refs).toBe(26)
      expect(discovery.ownRefs).toBe(6)
      expect(discovery.hasNestedProse).toBe(true)
    })

    it('says a leaf has nothing nested, so its row need not spell out a split', () => {
      const { rows } = buildSectionRows({ sections: parsedTree() }, { terrain: { peaks: PEAKS } })

      expect(find(rows, 'Structure').hasNestedProse).toBe(false)
    })
  })

  describe('portals', () => {
    const world = (portals) => ({ terrain: { peaks: PEAKS }, portals })

    it('counts them against the section whose text the link was in', () => {
      const { rows } = buildSectionRows(
        { sections: parsedTree() },
        world([
          { sectionAnchor: 'Early' },
          { sectionAnchor: 'Early' },
          { sectionAnchor: 'Structure' },
        ]),
      )

      expect(find(rows, 'Discovery').children[0].portals).toBe(2)
      expect(find(rows, 'Structure').portals).toBe(1)
    })

    it('rolls a summit\'s portals up into its range', () => {
      const { rows } = buildSectionRows(
        { sections: parsedTree() },
        world([{ sectionAnchor: 'Early' }, { sectionAnchor: 'Late' }, { sectionAnchor: 'Discovery' }]),
      )

      expect(find(rows, 'Discovery').portals).toBe(3)
    })

    it('attributes a link from too deep to list to the deepest row above it', () => {
      // Portals come from the uncapped tree, so a link inside an h4
      // carries that h4's anchor while the deepest row is a subsection.
      // Dropping it would make a range's count less than the sum of what
      // is inside it.
      const tree = parsedTree()
      tree.sections[0].children[0].children = [
        { title: 'Footnote', anchor: 'Footnote', ownSize: 50, subtreeSize: 50, children: [] },
      ]

      const { rows } = buildSectionRows({ sections: tree }, world([{ sectionAnchor: 'Footnote' }]))

      expect(find(rows, 'Discovery').children[0].portals).toBe(1)
      expect(find(rows, 'Discovery').portals).toBe(1)
    })

    it('counts a link inside a folded section toward that section\'s row', () => {
      // A folded section has no ground but does have a row, under the
      // aggregate it went into — so its portals have somewhere to land.
      const tree = parsedTree()
      tree.sections[3].children = [
        { title: 'Nickname', anchor: 'Nickname', ownSize: 20, subtreeSize: 20, children: [] },
      ]

      const { rows } = buildSectionRows(
        { sections: tree },
        {
          terrain: { peaks: [...PEAKS, AGGREGATE] },
          portals: [{ sectionAnchor: 'Trivia' }, { sectionAnchor: 'Nickname' }],
        },
      )

      const aggregate = find(rows, 'Miscellaneous')
      expect(find(aggregate.children, 'Trivia').portals).toBe(2)
      expect(aggregate.portals).toBe(2)
    })

    it('ignores the lead\'s portals, which belong to no section', () => {
      const { rows } = buildSectionRows(
        { sections: parsedTree() },
        world([{ sectionAnchor: null }, { sectionAnchor: 'Structure' }]),
      )

      expect(rows.reduce((sum, row) => sum + row.portals, 0)).toBe(1)
    })
  })
})

describe('articleAverageLushness', () => {
  it('is not the midpoint of the scale', () => {
    // relativeRateToUnit maps a ratio of 1 to 0.5, and the absolute
    // ceiling then scales the whole scale down for an article that cites
    // little. A tick at a fixed 0.5 would report every section of a
    // thinly-sourced article as below its own average, which is
    // arithmetically impossible.
    const thin = articleAverageLushness({ citationCount: 2, sentenceCount: 200 })
    const rich = articleAverageLushness({ citationCount: 180, sentenceCount: 200 })

    expect(thin).toBeLessThan(0.5)
    expect(rich).toBeCloseTo(0.5, 2)
    expect(thin).toBeLessThan(rich)
  })

  it('has no average to mark when the article cites nothing', () => {
    expect(articleAverageLushness({ citationCount: 0, sentenceCount: 200 })).toBeNull()
    expect(articleAverageLushness(undefined)).toBeNull()
  })
})

describe('countRows', () => {
  it('counts every level, which is what decides how much opens by default', () => {
    const { rows, count } = buildSectionRows(
      { sections: parsedTree() },
      { terrain: { peaks: [...PEAKS, AGGREGATE] } },
    )

    // 4 ranges + 2 summits under Discovery + 2 folded under Miscellaneous
    expect(count).toBe(8)
    expect(countRows(rows)).toBe(count)
  })
})
