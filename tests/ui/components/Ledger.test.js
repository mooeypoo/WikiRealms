import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Ledger from '../../../src/ui/components/Ledger.vue'
import { resetKeymap } from '../../../src/ui/design/useKeymap.js'
import { resetOverlays } from '../../../src/ui/design/useOverlays.js'

enableAutoUnmount(afterEach)

const ARTICLE = {
  title: 'Cassini Division',
  url: 'https://en.wikipedia.org/wiki/Cassini_Division',
  latestRevisionId: 1183920477,
  summary: 'A gap between Saturn\'s A and B rings.',
  links: ['Saturn', 'Titan'],
  sections: {
    lead: { ownSize: 100, sentenceCount: 5, citationCount: 2, links: [] },
    totalSize: 900,
    citationCount: 24,
    sentenceCount: 65,
    sections: [
      {
        title: 'Discovery',
        anchor: 'Discovery',
        ownSize: 400,
        subtreeSize: 900,
        citationCount: 6,
        subtreeCitationCount: 6,
        sentenceCount: 20,
        subtreeSentenceCount: 20,
        children: [
          { title: 'Early', anchor: 'Early', ownSize: 500, subtreeSize: 500, children: [] },
          { title: 'Late', anchor: 'Late', ownSize: 200, subtreeSize: 200, children: [] },
        ],
      },
      {
        title: 'Structure',
        anchor: 'Structure',
        ownSize: 6600,
        subtreeSize: 6600,
        citationCount: 9,
        subtreeCitationCount: 9,
        sentenceCount: 40,
        subtreeSentenceCount: 40,
        children: [],
      },
    ],
  },
}

/**
 * The generated world, which is what the list is built from — see
 * sectionRows.js for why that is not the same tree as the article's.
 *
 * Deliberately in the engine's own order (largest subtree first, which
 * is how peak folding leaves it) rather than the article's, so the
 * ordering the Ledger has to restore is actually exercised.
 */
const WORLD = {
  portals: [
    { portalId: 'p1', sectionAnchor: 'Structure' },
    { portalId: 'p2', sectionAnchor: 'Early' },
    { portalId: 'p3', sectionAnchor: null },
  ],
  terrain: {
    peaks: [
      {
        title: 'Structure',
        anchor: 'Structure',
        depth: 1,
        sectionIndex: 0,
        lushness: 0,
        ownSize: 6600,
        subtreeSize: 6600,
        ownCitationCount: 9,
        citationCount: 9,
        sentenceCount: 40,
        subtreeSentenceCount: 40,
      },
      {
        title: 'Discovery',
        anchor: 'Discovery',
        depth: 1,
        sectionIndex: 1,
        lushness: 0.72,
        ownSize: 400,
        subtreeSize: 900,
        ownCitationCount: 6,
        citationCount: 6,
        sentenceCount: 20,
        subtreeSentenceCount: 20,
      },
      {
        title: 'Early',
        anchor: 'Early',
        depth: 2,
        sectionIndex: 1,
        lushness: 0.95,
        ownSize: 500,
        subtreeSize: 500,
        ownCitationCount: 5,
        citationCount: 5,
        sentenceCount: 12,
        subtreeSentenceCount: 12,
      },
      {
        title: 'Late',
        anchor: 'Late',
        depth: 2,
        sectionIndex: 1,
        lushness: 0.1,
        ownSize: 200,
        subtreeSize: 200,
        ownCitationCount: 1,
        citationCount: 1,
        sentenceCount: 8,
        subtreeSentenceCount: 8,
      },
    ],
  },
}

function mountLedger(props = {}) {
  return mount(Ledger, {
    props: { article: ARTICLE, world: WORLD, state: 'open', ...props },
    attachTo: document.body,
  })
}

const surface = () => document.querySelector('.sheet')
const rows = () => [...document.querySelectorAll('.ledger__row')]
const titles = () => rows().map((row) => row.querySelector('.ledger__row-title').textContent.trim())
const rowFor = (title) => rows().find((row) => row.querySelector('.ledger__row-title').textContent.trim() === title)
const clickRow = (title) => rowFor(title).querySelector('.ledger__cells').dispatchEvent(new MouseEvent('click', { bubbles: true }))

beforeEach(() => {
  // jsdom does no layout and so has no scrollIntoView at all.
  Element.prototype.scrollIntoView = vi.fn()
  document.body.innerHTML = ''
  window.innerWidth = 1280
  window.innerHeight = 900
  window.dispatchEvent(new Event('resize'))
})

afterEach(() => {
  resetOverlays()
  resetKeymap()
  document.body.innerHTML = ''
})

describe('Ledger', () => {
  it('is non-modal, so the world stays usable behind it', () => {
    // It is not a summon: it coexists with everything and never dims the
    // stage or traps focus.
    mountLedger()

    expect(document.querySelector('.scrim')).toBeNull()
    expect(surface().getAttribute('aria-modal')).toBeNull()
  })

  describe('states', () => {
    it('minimises to a bar rather than disappearing', () => {
      // §4.2: a persistent surface that closes outright takes its own way
      // back with it. The bar is both the state and the way out.
      mountLedger({ state: 'collapsed' })

      const restore = document.querySelector('.ledger__restore')
      expect(restore).not.toBeNull()
      expect(restore.textContent).toContain('Cassini Division')
      expect(document.querySelector('.ledger__stats')).toBeNull()
    })

    it('reopens from that bar', async () => {
      const wrapper = mountLedger({ state: 'collapsed' })

      document.querySelector('.ledger__restore').dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await wrapper.vm.$nextTick()

      expect(wrapper.emitted('update:state')).toEqual([['peek']])
    })

    it('shows identity and readouts at peek, and holds back the rest', () => {
      // The point of peek: know where you are while still seeing the world.
      mountLedger({ state: 'peek' })

      expect(document.querySelector('.ledger__title').textContent).toBe('Cassini Division')
      expect(document.querySelectorAll('.ledger__stats dd')).toHaveLength(4)
      expect(rows()).toHaveLength(0)
      expect(document.querySelector('.ledger__summary')).toBeNull()
    })

    it('offers no actions at peek, having no room to put them', () => {
      // They used to render below the fold: visible enough to look like
      // controls, clipped enough to be unclickable, which is the worst of
      // both. The panel is 16dvh and the header is most of it.
      mountLedger({ state: 'peek' })

      expect(document.querySelector('.ledger__footer')).toBeNull()
      expect(document.querySelector('.sheet__footer')).toBeNull()
    })

    it('offers them from open onwards, where they fit', () => {
      mountLedger({ state: 'open' })

      const footer = document.querySelector('.ledger__footer')
      expect(footer).not.toBeNull()
      expect(footer.textContent).toContain('View on Wikipedia')
      expect(footer.textContent).toContain('Share')
    })

    it('shows the summary and sections from open onwards', () => {
      mountLedger({ state: 'open' })

      expect(document.querySelector('.ledger__summary')).not.toBeNull()
      expect(rows().length).toBeGreaterThan(0)
    })

    it('steps one state at a time rather than jumping to an extreme', async () => {
      const wrapper = mountLedger({ state: 'open' })

      document.querySelector('[aria-label="Show less of this panel"]').dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await wrapper.vm.$nextTick()
      expect(wrapper.emitted('update:state')?.at(-1)).toEqual(['peek'])

      document.querySelector('[aria-label="Show more of this panel"]').dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await wrapper.vm.$nextTick()
      expect(wrapper.emitted('update:state')?.at(-1)).toEqual(['full'])
    })

    it('stops at the ends', async () => {
      const wrapper = mountLedger({ state: 'collapsed' })

      // Collapsed renders only the bar, so "show less" is not even offered.
      expect(document.querySelector('[aria-label="Show less of this panel"]')).toBeNull()

      const atFull = mountLedger({ state: 'full' })
      expect(document.querySelector('[aria-label="Show more of this panel"]')).toBeNull()

      wrapper.unmount()
      atFull.unmount()
    })

    it('does not emit when asked for the state it is already in', async () => {
      const wrapper = mountLedger({ state: 'full' })

      document.querySelector('[aria-label="Show less of this panel"]').dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await wrapper.vm.$nextTick()

      expect(wrapper.emitted('update:state')).toEqual([['open']])
    })
  })

  describe('readouts', () => {
    it('reads out the four things worth knowing at a glance', () => {
      mountLedger()
      const values = [...document.querySelectorAll('.ledger__stats dd')].map((dd) => dd.textContent.trim())

      // sections through the whole tree, citations, portals, words
      expect(values).toEqual(['4', '24', '3', '164'])
    })

    it('counts words rather than links', () => {
      // "Links" read 500 for nearly every article — the API's page limit
      // for an anonymous request, which nothing follows past. A number
      // describing our query rather than the article does not belong in an
      // instrument panel, and beside Portals it invited a comparison
      // between two things that are not comparable.
      mountLedger()
      const labels = [...document.querySelectorAll('.ledger__stats dt')].map((dt) => dt.textContent.trim())

      expect(labels).toEqual(['Sections', 'Citations', 'Portals', 'Words'])
      expect(labels).not.toContain('Links')
    })

    it('says so plainly when there is no summary', () => {
      mountLedger({ article: { ...ARTICLE, summary: '' } })

      expect(document.querySelector('.ledger__empty').textContent).toContain('No summary')
    })

    it('flags a world built from an older revision', () => {
      mountLedger({ stale: true })

      expect(document.querySelector('.ledger__stale').textContent).toContain('Updated on Wikipedia')
    })

    it('collapses the summary again when the realm changes', async () => {
      const wrapper = mountLedger()

      document.querySelector('.ledger__more').dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await wrapper.vm.$nextTick()
      expect(document.querySelector('.ledger__summary p').classList.contains('is-clamped')).toBe(false)

      await wrapper.setProps({ article: { ...ARTICLE, title: 'Titan' } })

      expect(document.querySelector('.ledger__summary p').classList.contains('is-clamped')).toBe(true)
    })
  })

  describe('the section list', () => {
    it('lists ranges and their summits, in the order the article puts them', () => {
      // The world's peaks arrive largest-subtree-first, because that is
      // the order peak folding leaves them in. Structure is the bigger
      // range and Discovery comes first in the article.
      mountLedger()

      expect(titles()).toEqual(['Discovery', 'Early', 'Late', 'Structure'])
    })

    it('marks a summit as one, so its title can be indented under its range', () => {
      // Only the title indents. Stepping the whole row in and out would
      // take the ground column with it, and a column that does not run
      // straight down the page cannot be scanned.
      mountLedger()

      expect(rowFor('Early').classList.contains('is-summit')).toBe(true)
      expect(rowFor('Discovery').classList.contains('is-summit')).toBe(false)
    })

    it('says how much of the world the list covers', () => {
      mountLedger()

      expect(document.querySelector('.ledger__sections-head').textContent).toContain('2 ranges · 2 summits')
    })

    it('heads the columns once instead of labelling every figure', () => {
      // Forty rows each spelling out "1,240 words" is forty repetitions
      // of a noun that only has to be said once, and it left no room for
      // the figures that actually vary.
      const labels = () => [...document.querySelectorAll('.ledger__columns span')].map((s) => s.textContent)
      mountLedger()

      expect(labels()).toEqual(['Range', 'Words', 'Refs', 'Ground'])
    })

    it('gives a range the figures for everything inside it', () => {
      mountLedger()
      const figures = [...rowFor('Discovery').querySelectorAll('.ledger__row-figure')].map((el) => el.textContent)

      // 900 chars of prose across the range, six references.
      expect(figures).toEqual(['164', '6'])
    })

    it('paints the meter in the colour the renderer would paint the ground', () => {
      mountLedger()

      const fill = rowFor('Discovery').querySelector('.ledger__meter-fill')
      expect(fill.getAttribute('style')).toContain('rgb(')
      expect(fill.getAttribute('style')).toContain('width: 72%')
    })

    it('marks this article\'s own average on every meter', () => {
      // Without the tick the bar is a quantity with no scale, and six
      // band names cannot say whether a section is a little above its
      // article's average or enormously above it.
      mountLedger()

      expect(rowFor('Discovery').querySelector('.ledger__meter-tick')).not.toBeNull()
    })

    it('names the band beside the meter', () => {
      mountLedger()

      expect(rowFor('Discovery').querySelector('.ledger__band').textContent.trim()).toBe('Wooded')
      expect(rowFor('Early').querySelector('.ledger__band').textContent.trim()).toBe('Lush')
      expect(rowFor('Late').querySelector('.ledger__band').textContent.trim()).toBe('Sparse')
      expect(rowFor('Structure').querySelector('.ledger__band').textContent.trim()).toBe('Barren')
    })
  })

  describe('opening a range', () => {
    const bigArticle = () => ({
      ...ARTICLE,
      sections: {
        ...ARTICLE.sections,
        sections: Array.from({ length: 14 }, (_, i) => ({
          title: `Section ${i}`,
          anchor: `S${i}`,
          ownSize: 100,
          subtreeSize: 300,
          children: [
            { title: `Sub ${i}a`, anchor: `S${i}a`, ownSize: 100, subtreeSize: 100, children: [] },
            { title: `Sub ${i}b`, anchor: `S${i}b`, ownSize: 100, subtreeSize: 100, children: [] },
          ],
        })),
      },
    })

    const bigWorld = () => ({
      portals: [],
      terrain: {
        peaks: Array.from({ length: 14 }, (_, i) => i).flatMap((i) => [
          { title: `Section ${i}`, anchor: `S${i}`, depth: 1, sectionIndex: i * 3, lushness: 0.5, ownSize: 100, subtreeSize: 300 },
          { title: `Sub ${i}a`, anchor: `S${i}a`, depth: 2, sectionIndex: i * 3, lushness: 0.5, ownSize: 100, subtreeSize: 100 },
          { title: `Sub ${i}b`, anchor: `S${i}b`, depth: 2, sectionIndex: i * 3, lushness: 0.5, ownSize: 100, subtreeSize: 100 },
        ]),
      },
    })

    it('shows a short article whole', () => {
      // Four rows collapsed is a list hiding most of itself for no reason.
      mountLedger()

      expect(titles()).toContain('Early')
    })

    it('starts a long one closed', () => {
      // Forty-two rows in a panel that is 42dvh at `open` is a scroll for
      // its own sake.
      mountLedger({ article: bigArticle(), world: bigWorld() })

      expect(titles()).toHaveLength(14)
      expect(titles()).not.toContain('Sub 0a')
    })

    it('opens one on request', async () => {
      const wrapper = mountLedger({ article: bigArticle(), world: bigWorld() })

      rowFor('Section 0').querySelector('.ledger__twist').dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await wrapper.vm.$nextTick()

      expect(titles()).toContain('Sub 0a')
      expect(titles()).not.toContain('Sub 1a')
    })

    it('offers no control on a range with nothing in it', () => {
      mountLedger()

      expect(rowFor('Structure').querySelector('button.ledger__twist')).toBeNull()
    })
  })

  describe('selection', () => {
    it('asks its owner to select the peak a row stands on', async () => {
      const wrapper = mountLedger()

      clickRow('Early')
      await wrapper.vm.$nextTick()

      // Early is peaks[2] — the identity the map speaks, not its anchor.
      expect(wrapper.emitted('select')?.at(-1)).toEqual([2])
    })

    it('clears the selection when the same row is clicked again', async () => {
      const wrapper = mountLedger({ selectedPeak: 2 })

      clickRow('Early')
      await wrapper.vm.$nextTick()

      expect(wrapper.emitted('select')?.at(-1)).toEqual([null])
    })

    it('spells out what the selected row means, and only that row', () => {
      // The list gives bare figures under column headings, which is what
      // makes forty rows scannable. The old panel printed this sentence
      // for every row — the same six comparison strings repeated down the
      // page, a full line each.
      mountLedger({ selectedPeak: 1 })

      const details = [...document.querySelectorAll('.ledger__detail')]
      expect(details).toHaveLength(1)
      expect(details[0].textContent).toContain('above this article’s average')
      expect(details[0].textContent).toContain('164 words')
      expect(details[0].textContent).toContain('6 refs in 20 sentences')
    })

    it('separates a range\'s own prose from its children\'s', () => {
      mountLedger({ selectedPeak: 1 })

      expect(document.querySelector('.ledger__detail').textContent).toContain('73 words of its own')
    })

    it('says nothing about a split a leaf does not have', () => {
      mountLedger({ selectedPeak: 0 })

      expect(document.querySelector('.ledger__detail').textContent).not.toContain('of its own')
    })

    it('says how many portals leave the selected range', () => {
      // The header gives the world's total and nothing said where any of
      // them were, so a range had no reason to be visited.
      mountLedger({ selectedPeak: 1 })

      expect(document.querySelector('.ledger__detail').textContent).toContain('1 portal leaves here')
    })

    it('links only the selected row to Wikipedia', () => {
      mountLedger({ selectedPeak: 1 })

      const link = document.querySelector('.ledger__detail a')
      expect(link.getAttribute('href')).toBe('https://en.wikipedia.org/wiki/Cassini_Division#Discovery')
    })

    it('marks the selected row for the eye as well as the reader', () => {
      mountLedger({ selectedPeak: 1 })

      expect(rowFor('Discovery').classList.contains('is-selected')).toBe(true)
      expect(rowFor('Structure').classList.contains('is-selected')).toBe(false)
    })
  })

  describe('a section clicked on the map', () => {
    it('scrolls the matching row into view', async () => {
      const wrapper = mountLedger()

      await wrapper.setProps({ selectedPeak: 0 })
      await flushPromises()

      expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
      expect(rowFor('Structure').classList.contains('is-selected')).toBe(true)
    })

    it('lands on the summit that was clicked, not on its parent', async () => {
      // The renderer used to resolve a subsection click to its owning
      // top-level's anchor, because that was the only granularity the
      // panel listed. Clicking a lush summit inside a dry range selected
      // the dry range.
      const wrapper = mountLedger()

      await wrapper.setProps({ selectedPeak: 2 })
      await flushPromises()

      expect(rowFor('Early').classList.contains('is-selected')).toBe(true)
      expect(rowFor('Discovery').classList.contains('is-selected')).toBe(false)
    })

    it('opens the range a hidden summit is inside', async () => {
      const wrapper = mountLedger({
        article: {
          ...ARTICLE,
          sections: {
            ...ARTICLE.sections,
            sections: Array.from({ length: 14 }, (_, i) => ({
              title: `Section ${i}`,
              anchor: `S${i}`,
              ownSize: 100,
              subtreeSize: 200,
              children: [{ title: `Sub ${i}`, anchor: `S${i}a`, ownSize: 100, subtreeSize: 100, children: [] }],
            })),
          },
        },
        world: {
          portals: [],
          terrain: {
            peaks: Array.from({ length: 14 }, (_, i) => i).flatMap((i) => [
              { title: `Section ${i}`, anchor: `S${i}`, depth: 1, sectionIndex: i * 2, lushness: 0.5, ownSize: 100, subtreeSize: 200 },
              { title: `Sub ${i}`, anchor: `S${i}a`, depth: 2, sectionIndex: i * 2, lushness: 0.5, ownSize: 100, subtreeSize: 100 },
            ]),
          },
        },
      })
      expect(titles()).not.toContain('Sub 3')

      await wrapper.setProps({ selectedPeak: 7 })
      await flushPromises()

      expect(titles()).toContain('Sub 3')
      expect(rowFor('Sub 3').classList.contains('is-selected')).toBe(true)
    })

    it('opens far enough to show it first', async () => {
      // Clicking a peak is a request to see that section; arriving at a
      // panel too small to show it would answer the wrong question.
      const wrapper = mountLedger({ state: 'peek' })

      await wrapper.setProps({ selectedPeak: 0 })

      expect(wrapper.emitted('update:state')?.at(-1)).toEqual(['open'])
    })

    it('does not scroll itself for a viewer who asked for less motion', async () => {
      globalThis.matchMedia = vi.fn(() => ({ matches: true }))
      const wrapper = mountLedger()

      await wrapper.setProps({ selectedPeak: 0 })
      await flushPromises()

      expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith(
        expect.objectContaining({ behavior: 'auto' }),
      )
      delete globalThis.matchMedia
    })

    it('drops the selection when the realm changes', async () => {
      const wrapper = mountLedger({ selectedPeak: 1 })

      await wrapper.setProps({ article: { ...ARTICLE, title: 'Titan' } })

      expect(wrapper.emitted('select')?.at(-1)).toEqual([null])
    })
  })

  describe('a range with no ground of its own', () => {
    const FOLDED_WORLD = {
      portals: [],
      terrain: {
        peaks: [
          ...WORLD.terrain.peaks,
          {
            title: 'Miscellaneous',
            anchor: null,
            depth: 1,
            sectionIndex: 4,
            lushness: 0.3,
            ownSize: 120,
            subtreeSize: 120,
            citationCount: 2,
            ownCitationCount: 2,
            sentenceCount: 6,
            subtreeSentenceCount: 6,
          },
        ],
      },
    }

    const FOLDED_ARTICLE = {
      ...ARTICLE,
      sections: {
        ...ARTICLE.sections,
        sections: [
          ...ARTICLE.sections.sections,
          { title: 'Trivia', anchor: 'Trivia', ownSize: 60, subtreeSize: 60, children: [] },
          { title: 'Naming', anchor: 'Naming', ownSize: 60, subtreeSize: 60, children: [] },
        ],
      },
    }

    it('lists the range the map actually carries', () => {
      // It used to be missing entirely: the reader could see and click a
      // mountain called "Miscellaneous" that appeared nowhere in the list
      // of what they were looking at.
      mountLedger({ article: FOLDED_ARTICLE, world: FOLDED_WORLD })

      expect(titles()).toContain('Miscellaneous')
      expect(titles().at(-3)).toBe('Miscellaneous')
    })

    it('says what was folded into it', () => {
      mountLedger({ article: FOLDED_ARTICLE, world: FOLDED_WORLD })

      expect(titles().slice(-2)).toEqual(['Trivia', 'Naming'])
    })

    it('offers no ground for a section that has none', () => {
      // Their prose raised the aggregate's height and their citations
      // coloured it, but no patch of the map is theirs — so the row is
      // stated rather than offered.
      mountLedger({ article: FOLDED_ARTICLE, world: FOLDED_WORLD })

      const trivia = rowFor('Trivia')
      expect(trivia.classList.contains('is-groundless')).toBe(true)
      expect(trivia.querySelector('button.ledger__cells')).toBeNull()
      expect(trivia.querySelector('.ledger__meter')).toBeNull()
    })

    it('can be selected, since it is a real place', () => {
      mountLedger({ article: FOLDED_ARTICLE, world: FOLDED_WORLD, selectedPeak: 4 })

      expect(document.querySelector('.ledger__detail').textContent).toContain('too small for a range of its own')
    })
  })

  it('asks its owner to share rather than knowing how', async () => {
    const wrapper = mountLedger()

    ;[...document.querySelectorAll('button')]
      .find((button) => button.textContent.includes('Share'))
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('share')).toHaveLength(1)
  })
})
