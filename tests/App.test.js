import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import App from '../src/App.vue'

vi.mock('../src/adapters/wikipediaSearchAdapter.js', () => ({
  searchWikipediaTitles: vi.fn(),
}))
vi.mock('../src/adapters/wikipediaArticleAdapter.js', () => ({
  fetchWikipediaArticle: vi.fn(),
}))
// jsdom has no WebGL, so `auto` rendering resolves to the 2D canvas here —
// which is what most of these tests want. The section-focus suite forces the
// 3D view back on, since that is the only view that emits section clicks.
vi.mock('../src/ui/rendering/webglSupport.js', () => ({
  supportsWebGL: vi.fn(() => false),
  detectWebGLSupport: vi.fn(() => false),
  resetWebGLSupport: vi.fn(),
}))

vi.mock('../src/adapters/snapshotStorage.js', () => ({
  saveSnapshotToStorage: vi.fn(),
  loadSnapshotFromStorage: vi.fn().mockReturnValue(null),
  clearSnapshotFromStorage: vi.fn(),
}))

import { supportsWebGL } from '../src/ui/rendering/webglSupport.js'
import { currentTitle } from '../src/core/traversal/visitGraph.js'
import { resetKeymap } from '../src/ui/design/useKeymap.js'
import { resetOverlays } from '../src/ui/design/useOverlays.js'
import { searchWikipediaTitles } from '../src/adapters/wikipediaSearchAdapter.js'
import { fetchWikipediaArticle } from '../src/adapters/wikipediaArticleAdapter.js'
import { saveSnapshotToStorage, loadSnapshotFromStorage } from '../src/adapters/snapshotStorage.js'

/**
 * The Ledger is teleported to <body>, so it is not inside the wrapper's own
 * tree. These read it the way a viewer would find it — by its accessible
 * name and its content — rather than by a class that a rewrite can rename.
 */
function ledgerTitle() {
  return document.querySelector('.ledger__title')?.textContent ?? null
}

function sectionCard(anchor) {
  return document.querySelector(`[data-anchor="${anchor}"]`)
}

async function collapseLedger(wrapper) {
  // Step down from open → peek → collapsed.
  for (let step = 0; step < 3; step += 1) {
    const less = document.querySelector('[aria-label="Show less of this panel"]')
    if (!less) break
    less.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
  }
  return wrapper
}

// The Ledger and every Sheet teleport to <body>, so a wrapper left mounted
// keeps its surfaces in the document and the next test finds them instead of
// its own. Unmounting after each test removes that whole class of pollution.
enableAutoUnmount(afterEach)

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  document.body.innerHTML = ''
  searchWikipediaTitles.mockReset()
  fetchWikipediaArticle.mockReset()
  saveSnapshotToStorage.mockReset()
  loadSnapshotFromStorage.mockReset().mockReturnValue(null)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('App', () => {
  it('loads and displays the selected article after choosing a search result', async () => {
    searchWikipediaTitles.mockResolvedValue([
      { title: 'Albert Einstein', description: 'German physicist', url: '' },
    ])
    fetchWikipediaArticle.mockResolvedValue({
      articleId: 'en:736',
      title: 'Albert Einstein',
      summary: 'German-born theoretical physicist.',
      latestRevisionId: 1234,
      categories: ['Physicists'],
      links: ['Physics', 'Nobel Prize in Physics'],
      images: [],
      sections: { lead: { ownSize: 100, links: ['Physics', 'Nobel Prize in Physics'] }, totalSize: 100, sections: [] },
    })

    const wrapper = mount(App)

    await wrapper.find('input').setValue('Ein')
    await vi.advanceTimersByTimeAsync(250)
    await flushPromises()

    await wrapper.find('.search-bar__results button').trigger('click')
    await flushPromises()

    expect(fetchWikipediaArticle).toHaveBeenCalledWith('Albert Einstein')
    expect(ledgerTitle()).toBe('Albert Einstein')
    expect(document.body.textContent).toContain('German-born theoretical physicist.')
    expect(document.body.textContent).toContain('1234')

    expect(wrapper.find('.world-view__canvas').exists()).toBe(true)
    expect(wrapper.findAll('.world-view__portal')).toHaveLength(2)
  })

  it('shows an error message when the article fails to load', async () => {
    searchWikipediaTitles.mockResolvedValue([{ title: 'Albert Einstein', description: '', url: '' }])
    fetchWikipediaArticle.mockRejectedValue(new Error('boom'))

    const wrapper = mount(App)

    await wrapper.find('input').setValue('Ein')
    await vi.advanceTimersByTimeAsync(250)
    await flushPromises()

    await wrapper.find('.search-bar__results button').trigger('click')
    await flushPromises()

    expect(wrapper.find('.app__alert--error').text()).toContain('boom')
  })

  it('navigates to a portal target and back again, preserving traversal history', async () => {
    const articles = {
      'Albert Einstein': {
        articleId: 'en:736',
        title: 'Albert Einstein',
        summary: 'German-born theoretical physicist.',
        latestRevisionId: 1234,
        categories: ['Physicists'],
        links: ['Physics'],
        images: [],
        sections: { lead: { ownSize: 100, links: ['Physics'] }, totalSize: 100, sections: [] },
      },
      Physics: {
        articleId: 'en:22939',
        title: 'Physics',
        summary: 'The natural science of matter.',
        latestRevisionId: 5678,
        categories: ['Physical sciences'],
        links: [],
        images: [],
        sections: { lead: { ownSize: 100, links: [] }, totalSize: 100, sections: [] },
      },
    }
    searchWikipediaTitles.mockResolvedValue([{ title: 'Albert Einstein', description: '', url: '' }])
    fetchWikipediaArticle.mockImplementation(async (title) => articles[title])

    const wrapper = mount(App)

    await wrapper.find('input').setValue('Ein')
    await vi.advanceTimersByTimeAsync(250)
    await flushPromises()
    await wrapper.find('.search-bar__results button').trigger('click')
    await flushPromises()

    expect(ledgerTitle()).toBe('Albert Einstein')
    expect(wrapper.find('button[aria-label="Go back"]').attributes('disabled')).toBeDefined()

    await wrapper.find('.world-view__portal').trigger('click')
    await flushPromises()

    // Confirm the portal navigation via modal
    const confirmButton = wrapper.find('.app__portal-modal-confirm')
    expect(confirmButton.exists()).toBe(true)
    await confirmButton.trigger('click')
    await flushPromises()

    expect(fetchWikipediaArticle).toHaveBeenCalledWith('Physics')
    expect(ledgerTitle()).toBe('Physics')

    const backButton = wrapper.find('button[aria-label="Go back"]')
    expect(backButton.attributes('disabled')).toBeUndefined()

    await backButton.trigger('click')
    await flushPromises()

    expect(ledgerTitle()).toBe('Albert Einstein')
  })

  it('persists a snapshot to storage whenever traversal changes', async () => {
    searchWikipediaTitles.mockResolvedValue([{ title: 'Albert Einstein', description: '', url: '' }])
    fetchWikipediaArticle.mockResolvedValue({
      articleId: 'en:736',
      title: 'Albert Einstein',
      summary: 'German-born theoretical physicist.',
      latestRevisionId: 1234,
      categories: [],
      links: [],
      images: [],
    })

    const wrapper = mount(App)

    await wrapper.find('input').setValue('Ein')
    await vi.advanceTimersByTimeAsync(250)
    await flushPromises()
    await wrapper.find('.search-bar__results button').trigger('click')
    await flushPromises()

    expect(saveSnapshotToStorage).toHaveBeenCalled()
    const [snapshot] = saveSnapshotToStorage.mock.calls.at(-1)
    expect(currentTitle(snapshot.navigation.graph)).toBe('Albert Einstein')
    expect(snapshot.articleCache['Albert Einstein'].title).toBe('Albert Einstein')
  })

  it('restores traversal and article cache from a persisted snapshot on mount', async () => {
    loadSnapshotFromStorage.mockReturnValue({
      schemaVersion: '1.0',
      createdAt: '2026-08-31T00:00:00Z',
      appVersion: '0.1.0',
      engineVersion: 'v1',
      worlds: {},
      navigation: { current: 'Albert Einstein', backstack: ['Physics'], forwardstack: [] },
      articleCache: {},
      generationCache: {},
      uiState: {},
    })
    fetchWikipediaArticle.mockResolvedValue({
      articleId: 'en:736',
      title: 'Albert Einstein',
      summary: 'German-born theoretical physicist.',
      latestRevisionId: 1234,
      categories: [],
      links: [],
      images: [],
    })

    const wrapper = mount(App)
    await flushPromises()

    expect(fetchWikipediaArticle).toHaveBeenCalledWith('Albert Einstein')
    expect(ledgerTitle()).toBe('Albert Einstein')
    const backButton = wrapper.find('button[aria-label="Go back"]')
    expect(backButton.attributes('disabled')).toBeUndefined() // backstack restored non-empty
  })

  it('shows an empty-state prompt before any article has been selected', () => {
    const wrapper = mount(App)

    expect(wrapper.find('.app__empty-state').exists()).toBe(true)
    expect(ledgerTitle()).toBeNull()
  })

  it('shows a stale-world badge when a revisited article has a newer revision than last time', async () => {
    searchWikipediaTitles.mockResolvedValue([{ title: 'Albert Einstein', description: '', url: '' }])
    fetchWikipediaArticle
      .mockResolvedValueOnce({
        articleId: 'en:736',
        title: 'Albert Einstein',
        summary: 'v1 summary',
        latestRevisionId: 1000,
        categories: [],
        links: ['Physics'],
        images: [],
        sections: { lead: { ownSize: 100, links: ['Physics'] }, totalSize: 100, sections: [] },
      })
      .mockResolvedValueOnce({
        articleId: 'en:22939',
        title: 'Physics',
        summary: 'Physics summary',
        latestRevisionId: 1,
        categories: [],
        links: [],
        images: [],
        sections: { lead: { ownSize: 100, links: [] }, totalSize: 100, sections: [] },
      })
      .mockResolvedValueOnce({
        articleId: 'en:736',
        title: 'Albert Einstein',
        summary: 'v2 summary',
        latestRevisionId: 2000, // revision changed since the first visit
        categories: [],
        links: ['Physics'],
        images: [],
        sections: { lead: { ownSize: 100, links: ['Physics'] }, totalSize: 100, sections: [] },
      })

    const wrapper = mount(App)

    await wrapper.find('input').setValue('Ein')
    await vi.advanceTimersByTimeAsync(250)
    await flushPromises()
    await wrapper.find('.search-bar__results button').trigger('click')
    await flushPromises()

    expect(document.body.textContent).not.toContain('Updated on Wikipedia') // first visit, nothing to compare against

    await wrapper.find('.world-view__portal').trigger('click') // navigate to Physics
      // Confirm the portal navigation via modal
      const confirmButton = wrapper.find('.app__portal-modal-confirm')
      expect(confirmButton.exists()).toBe(true)
      await confirmButton.trigger('click')
      await flushPromises()

    await flushPromises()

    const backButton = wrapper.find('button[aria-label="Go back"]')
    await backButton.trigger('click') // back to Albert Einstein, refetches with a newer revision
    await flushPromises()

    expect(document.body.textContent).toContain('Updated on Wikipedia')
  })
})

describe('App section focus', () => {
  // Section markers live in the 3D view, so this suite needs it mounted.
  // App loads that view on demand, and a first dynamic import does not settle
  // within a flushPromises under fake timers — so warm the module cache here
  // rather than depend on some earlier test in the file having done it, which
  // is what these tests were quietly relying on before.
  beforeEach(async () => {
    supportsWebGL.mockReturnValue(true)
    await import('../src/ui/components/WorldView3D.vue')
  })
  afterEach(() => supportsWebGL.mockReturnValue(false))

  const articleWithSections = {
    articleId: 'en:736',
    title: 'Albert Einstein',
    summary: 'German-born theoretical physicist.',
    url: 'https://en.wikipedia.org/wiki/Albert_Einstein',
    latestRevisionId: 1234,
    categories: [],
    links: [],
    images: [],
    sections: {
      lead: { ownSize: 100, links: [], citationCount: 0 },
      totalSize: 900,
      citationCount: 7,
      sections: [
        {
          title: 'Early life',
          depth: 1,
          anchor: 'Early_life',
          ownSize: 300,
          subtreeSize: 500,
          citationCount: 2,
          subtreeCitationCount: 4,
          children: [
            {
              title: 'Childhood',
              depth: 2,
              anchor: 'Childhood',
              ownSize: 200,
              subtreeSize: 200,
              citationCount: 2,
              subtreeCitationCount: 2,
              children: [],
            },
          ],
        },
        {
          title: 'Career',
          depth: 1,
          anchor: 'Career',
          ownSize: 400,
          subtreeSize: 400,
          citationCount: 3,
          subtreeCitationCount: 3,
          children: [],
        },
      ],
    },
  }

  // jsdom implements neither scrollIntoView nor layout; the focus path
  // calls the former, so stub it and assert on the target element instead.
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn()
    searchWikipediaTitles.mockResolvedValue([{ title: 'Albert Einstein', description: '', url: '' }])
    fetchWikipediaArticle.mockResolvedValue(articleWithSections)
  })

  // The focus path resolves its scroll target with document.getElementById,
  // so a leftover App from a previous test would shadow the current one.
  let mounted = null
  afterEach(() => {
    mounted?.unmount()
    mounted = null
  })

  async function mountWithArticle() {
    mounted = mount(App, { attachTo: document.body })
    await mounted.find('input').setValue('Ein')
    await vi.advanceTimersByTimeAsync(250)
    await flushPromises()
    await mounted.find('.search-bar__results button').trigger('click')
    await flushPromises()
    // The 3D view is loaded on demand; one more flush lets it render once the
    // module is cached (see the suite's beforeEach).
    await flushPromises()
    return mounted
  }

  async function clickSectionMarker(wrapper, target) {
    wrapper.findComponent({ name: 'WorldView3D' }).vm.$emit('section-click', target)
    await flushPromises()
    await flushPromises()
  }

  it('renders a card per top-level section, with subsection/word/citation chips', async () => {
    const wrapper = await mountWithArticle()

    const cards = [...document.querySelectorAll('.ledger__section')]

    expect(cards).toHaveLength(2)
    expect(cards[0].dataset.anchor).toBe('Early_life')
    expect(cards[0].querySelector('h4').textContent).toBe('Early life')
    expect(cards[0].textContent).toContain('1 sub')
    expect(cards[0].textContent).toContain('4 c')
    expect(cards[1].dataset.anchor).toBe('Career')
    // Subsections aren't listed as cards of their own.
    expect(sectionCard('Childhood')).toBeNull()
  })

  it('links each card to its section on Wikipedia', async () => {
    const wrapper = await mountWithArticle()

    expect(sectionCard('Career').querySelector('a').getAttribute('href')).toBe(
      'https://en.wikipedia.org/wiki/Albert_Einstein#Career',
    )
  })

  it('flashes the clicked section card and scrolls it into view', async () => {
    const wrapper = await mountWithArticle()

    await clickSectionMarker(wrapper, { anchor: 'Career', sectionAnchor: 'Career', depth: 1 })

    expect(sectionCard('Career').classList.contains('ledger__section--flash')).toBe(true)
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
  })

  it('focuses the owning top-level card when a subsection marker is clicked', async () => {
    const wrapper = await mountWithArticle()

    await clickSectionMarker(wrapper, { anchor: 'Childhood', sectionAnchor: 'Early_life', depth: 2 })

    expect(sectionCard('Early_life').classList.contains('ledger__section--flash')).toBe(true)
  })

  it('expands a collapsed panel before focusing', async () => {
    const wrapper = await mountWithArticle()
    await collapseLedger(wrapper)
    expect(document.querySelector('.ledger__restore')).not.toBeNull()

    await clickSectionMarker(wrapper, { anchor: 'Career', sectionAnchor: 'Career', depth: 1 })

    expect(document.querySelector('.ledger__restore')).toBeNull()
    expect(sectionCard('Career').classList.contains('ledger__section--flash')).toBe(true)
  })

  it('re-flashes the same card when it is clicked again', async () => {
    const wrapper = await mountWithArticle()

    await clickSectionMarker(wrapper, { anchor: 'Career', sectionAnchor: 'Career', depth: 1 })
    // Halfway through the first flash the card is clicked again — the
    // highlight restarts rather than expiring on the original timer.
    await vi.advanceTimersByTimeAsync(800)
    await clickSectionMarker(wrapper, { anchor: 'Career', sectionAnchor: 'Career', depth: 1 })
    await vi.advanceTimersByTimeAsync(800)

    expect(sectionCard('Career').classList.contains('ledger__section--flash')).toBe(true)

    await vi.advanceTimersByTimeAsync(800)
    expect(sectionCard('Career').classList.contains('ledger__section--flash')).toBe(false)
  })

  it('moves the highlight when a different section is clicked mid-flash', async () => {
    const wrapper = await mountWithArticle()

    await clickSectionMarker(wrapper, { anchor: 'Career', sectionAnchor: 'Career', depth: 1 })
    await clickSectionMarker(wrapper, { anchor: 'Early_life', sectionAnchor: 'Early_life', depth: 1 })

    expect(sectionCard('Career').classList.contains('ledger__section--flash')).toBe(false)
    expect(sectionCard('Early_life').classList.contains('ledger__section--flash')).toBe(true)
  })

  it('ignores a click on a peak with no section anchor (the folded range)', async () => {
    const wrapper = await mountWithArticle()

    await clickSectionMarker(wrapper, { anchor: null, sectionAnchor: null, depth: 1 })

    expect(document.querySelectorAll('.ledger__section--flash')).toHaveLength(0)
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled()
  })
})

describe('App keyboard', () => {
  function press(key, target = document.body) {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
    Object.defineProperty(event, 'target', { value: target })
    window.dispatchEvent(event)
  }

  afterEach(() => {
    resetOverlays()
    resetKeymap()
    document.body.innerHTML = ''
  })

  it('opens the guide from the registry and dismisses it from the stack', async () => {
    // End to end through the two pieces that replaced the app's own two
    // competing keydown listeners: useKeymap declares it, useOverlays
    // dismisses it, and neither surface handles Escape itself any more.
    const wrapper = mount(App, { attachTo: document.body })
    await flushPromises()

    press('?')
    await flushPromises()
    expect(document.querySelector('.guide__prose')).not.toBeNull()

    press('Escape')
    await flushPromises()
    expect(document.querySelector('.guide__prose')).toBeNull()

    wrapper.unmount()
  })

  it('opens settings, and opening it closes the guide rather than stacking', async () => {
    const wrapper = mount(App, { attachTo: document.body })
    await flushPromises()

    press('?')
    await flushPromises()
    press('s')
    await flushPromises()

    expect(document.querySelector('.settings__title')).not.toBeNull()
    expect(document.querySelector('.guide__prose')).toBeNull()

    wrapper.unmount()
  })

  it('ignores a bare-letter shortcut typed into the search field', async () => {
    const wrapper = mount(App, { attachTo: document.body })
    await flushPromises()

    press('s', wrapper.find('input').element)
    await flushPromises()

    expect(document.querySelector('.settings__title')).toBeNull()
    wrapper.unmount()
  })
})

describe('App URL state', () => {
  afterEach(() => {
    history.replaceState(null, '', '/')
    resetOverlays()
    resetKeymap()
  })

  it('opens the realm a shared link points at', async () => {
    // The whole point of this: every share link ever produced opened an
    // empty app, because nothing read the parameter they carried.
    history.replaceState(null, '', '?realm=Saturn')
    fetchWikipediaArticle.mockResolvedValue({
      articleId: 'en:1',
      title: 'Saturn',
      summary: 'Sixth planet.',
      latestRevisionId: 1,
      categories: [],
      links: [],
      images: [],
      sections: { lead: { ownSize: 10, links: [] }, totalSize: 10, sections: [] },
    })

    mount(App)
    await flushPromises()

    expect(fetchWikipediaArticle).toHaveBeenCalledWith('Saturn')
  })

  it('prefers a shared link over the session it would otherwise restore', async () => {
    history.replaceState(null, '', '?realm=Saturn')
    loadSnapshotFromStorage.mockReturnValue({
      schemaVersion: '1.0',
      createdAt: '2026-08-31T00:00:00Z',
      appVersion: '0.1.0',
      engineVersion: 'v1',
      worlds: {},
      navigation: { current: 'Jazz', backstack: [], forwardstack: [] },
      articleCache: {},
      generationCache: {},
      uiState: {},
    })
    fetchWikipediaArticle.mockResolvedValue({
      articleId: 'en:1',
      title: 'Saturn',
      summary: 'Sixth planet.',
      latestRevisionId: 1,
      categories: [],
      links: [],
      images: [],
      sections: { lead: { ownSize: 10, links: [] }, totalSize: 10, sections: [] },
    })

    mount(App)
    await flushPromises()

    expect(fetchWikipediaArticle).toHaveBeenLastCalledWith('Saturn')
  })

  it('writes each move into browser history so Back retraces the journey', async () => {
    searchWikipediaTitles.mockResolvedValue([{ title: 'Albert Einstein', description: '', url: '' }])
    fetchWikipediaArticle.mockResolvedValue({
      articleId: 'en:736',
      title: 'Albert Einstein',
      summary: 'Physicist.',
      latestRevisionId: 1234,
      categories: [],
      links: [],
      images: [],
      sections: { lead: { ownSize: 10, links: [] }, totalSize: 10, sections: [] },
    })

    const wrapper = mount(App)
    await wrapper.find('input').setValue('Ein')
    await vi.advanceTimersByTimeAsync(250)
    await flushPromises()
    await wrapper.find('.search-bar__results button').trigger('click')
    await flushPromises()

    expect(window.location.search).toContain('realm=Albert')
    expect(history.state).toMatchObject({ title: 'Albert Einstein' })
  })
})

describe('App view axis', () => {
  const article = {
    articleId: 'en:1',
    title: 'Saturn',
    summary: 'Sixth planet.',
    latestRevisionId: 1,
    categories: [],
    links: [],
    images: [],
    sections: { lead: { ownSize: 10, links: [] }, totalSize: 10, sections: [] },
  }

  async function mountWithWorld() {
    searchWikipediaTitles.mockResolvedValue([{ title: 'Saturn', description: '', url: '' }])
    fetchWikipediaArticle.mockResolvedValue(article)

    const wrapper = mount(App, { attachTo: document.body })
    await wrapper.find('input').setValue('Sat')
    await vi.advanceTimersByTimeAsync(250)
    await flushPromises()
    await wrapper.find('.search-bar__results button').trigger('click')
    await flushPromises()
    return wrapper
  }

  afterEach(() => {
    localStorage.clear()
    resetOverlays()
    resetKeymap()
  })

  it('shows the helm once there is a world, and not before', async () => {
    const wrapper = mount(App, { attachTo: document.body })
    await flushPromises()
    expect(wrapper.find('.helm').exists()).toBe(false)

    wrapper.unmount()

    const withWorld = await mountWithWorld()
    expect(withWorld.find('.helm').exists()).toBe(true)
    withWorld.unmount()
  })

  it('changes world shape from the helm and remembers it', async () => {
    const wrapper = await mountWithWorld()

    await wrapper.findAll('.helm [role="radio"]')[1].trigger('click')

    expect(wrapper.find('.helm [role="radio"][aria-checked="true"]').text()).toBe('Flat')
    expect(JSON.parse(localStorage.getItem('wikirealms:preferences')).worldShape).toBe('flat')
    wrapper.unmount()
  })

  it('toggles the shape from the keyboard on one key, not two', async () => {
    // Keys 1 and 3 used to switch RENDERER, while shape hid in settings.
    const wrapper = await mountWithWorld()

    const event = new KeyboardEvent('keydown', { key: 'v', bubbles: true, cancelable: true })
    Object.defineProperty(event, 'target', { value: document.body })
    window.dispatchEvent(event)
    await flushPromises()

    expect(wrapper.find('.helm [role="radio"][aria-checked="true"]').text()).toBe('Flat')
    wrapper.unmount()
  })

  it('falls back to the 2D canvas when the browser cannot do WebGL', async () => {
    // supportsWebGL is mocked false for this file, standing in for jsdom.
    const wrapper = await mountWithWorld()

    expect(wrapper.find('.world-view__canvas').exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'WorldView3D' }).exists()).toBe(false)
    wrapper.unmount()
  })

  it('honours an explicit low rendering setting even where WebGL works', async () => {
    localStorage.setItem('wikirealms:preferences', JSON.stringify({ rendering: 'low' }))
    supportsWebGL.mockReturnValue(true)

    const wrapper = await mountWithWorld()

    expect(wrapper.find('.world-view__canvas').exists()).toBe(true)
    supportsWebGL.mockReturnValue(false)
    wrapper.unmount()
  })
})

describe('App helm and the 2D fallback', () => {
  afterEach(() => {
    localStorage.clear()
    resetOverlays()
    resetKeymap()
  })

  it('offers no recentre control while the 2D fallback is drawing', async () => {
    searchWikipediaTitles.mockResolvedValue([{ title: 'Saturn', description: '', url: '' }])
    fetchWikipediaArticle.mockResolvedValue({
      articleId: 'en:1',
      title: 'Saturn',
      summary: 'Sixth planet.',
      latestRevisionId: 1,
      categories: [],
      links: [],
      images: [],
      sections: { lead: { ownSize: 10, links: [] }, totalSize: 10, sections: [] },
    })

    const wrapper = mount(App, { attachTo: document.body })
    await wrapper.find('input').setValue('Sat')
    await vi.advanceTimersByTimeAsync(250)
    await flushPromises()
    await wrapper.find('.search-bar__results button').trigger('click')
    await flushPromises()

    expect(wrapper.find('.helm').exists()).toBe(true)
    expect(wrapper.find('[aria-label="Recentre the view"]').exists()).toBe(false)
    wrapper.unmount()
  })
})
