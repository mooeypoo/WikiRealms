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
    lead: { ownSize: 100, links: [] },
    totalSize: 900,
    citationCount: 24,
    sections: [
      { title: 'Discovery', anchor: 'Discovery', ownSize: 400, subtreeSize: 900, subtreeCitationCount: 6, children: [{ title: 'Early', anchor: 'Early', ownSize: 500, subtreeSize: 500, children: [] }] },
      { title: 'Structure', anchor: 'Structure', ownSize: 6600, subtreeSize: 6600, subtreeCitationCount: 9, children: [] },
    ],
  },
}

const WORLD = { portals: [{ portalId: 'p1' }, { portalId: 'p2' }, { portalId: 'p3' }] }

function mountLedger(props = {}) {
  return mount(Ledger, {
    props: { article: ARTICLE, world: WORLD, state: 'open', ...props },
    attachTo: document.body,
  })
}

const surface = () => document.querySelector('.sheet')
const cards = () => [...document.querySelectorAll('.ledger__section')]

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
      expect(cards()).toHaveLength(0)
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
      expect(cards()).toHaveLength(2)
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

  describe('content', () => {
    it('reads out the four things worth knowing at a glance', () => {
      mountLedger()
      const values = [...document.querySelectorAll('.ledger__stats dd')].map((dd) => dd.textContent.trim())

      // sections through the whole tree, citations, portals, words
      expect(values).toEqual(['3', '24', '3', '164'])
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

    it('lists top-level sections only, with a reading-length chip', () => {
      mountLedger()

      expect(cards().map((card) => card.querySelector('h4').textContent)).toEqual(['Discovery', 'Structure'])
      // 6600 characters ≈ 1.2k words, rounded to a signal rather than a figure.
      expect(cards()[1].textContent).toContain('1.2k w')
    })

    it('links each section to its own place on Wikipedia', () => {
      mountLedger()

      expect(cards()[0].querySelector('a').getAttribute('href')).toBe(
        'https://en.wikipedia.org/wiki/Cassini_Division#Discovery',
      )
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

  describe('a section clicked on the map', () => {
    it('flashes the matching card', async () => {
      const wrapper = mountLedger()

      await wrapper.setProps({ focusedSection: 'Structure' })
      await flushPromises()

      expect(cards()[1].classList.contains('ledger__section--flash')).toBe(true)
      expect(cards()[0].classList.contains('ledger__section--flash')).toBe(false)
    })

    it('opens far enough to show it first', async () => {
      // Clicking a peak is a request to see that section; arriving at a
      // panel too small to show it would answer the wrong question.
      const wrapper = mountLedger({ state: 'peek' })

      await wrapper.setProps({ focusedSection: 'Structure' })

      expect(wrapper.emitted('update:state')?.at(-1)).toEqual(['open'])
    })

    it('ignores an anchor it has no card for', async () => {
      const wrapper = mountLedger()

      await wrapper.setProps({ focusedSection: 'Nonexistent' })
      await flushPromises()

      expect(document.querySelectorAll('.ledger__section--flash')).toHaveLength(0)
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
