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
import { currentTitle, createVisitGraph, jump } from '../src/core/traversal/visitGraph.js'
import { resetKeymap } from '../src/ui/design/useKeymap.js'
import { resetOverlays } from '../src/ui/design/useOverlays.js'
import { searchWikipediaTitles } from '../src/adapters/wikipediaSearchAdapter.js'
import { fetchWikipediaArticle } from '../src/adapters/wikipediaArticleAdapter.js'
import { saveSnapshotToStorage, loadSnapshotFromStorage } from '../src/adapters/snapshotStorage.js'
import { readLanguage, readRealm } from '../src/adapters/urlState.js'
import { useUIState } from '../src/ui/composables/useUIState.js'

/**
 * The Ledger is teleported to <body>, so it is not inside the wrapper's own
 * tree. These read it the way a viewer would find it — by its accessible
 * name and its content — rather than by a class that a rewrite can rename.
 */
/**
 * Travel is a transition now, not an instant swap: the preview card asks,
 * and the world is replaced behind a wash. These wait it out.
 */
function travelButton() {
  return [...document.querySelectorAll('.preview__go')][0]
}

async function settleTravel() {
  await flushPromises()
  await vi.advanceTimersByTimeAsync(1200)
  await flushPromises()
}

function press(key, target = document.body) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  Object.defineProperty(event, 'target', { value: target })
  window.dispatchEvent(event)
}

function searchField() {
  return document.querySelector('.search-bar input')
}

/**
 * Search is summoned now rather than permanently on screen: it opens itself
 * when there is no realm yet, and is reached from the scrim once there is.
 * Typing therefore starts by opening it, the way a viewer would.
 */
async function typeSearch(text) {
  if (!searchField()) {
    document
      .querySelector('[aria-label="Search realms"]')
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
  }

  const field = searchField()
  field.value = text
  field.dispatchEvent(new Event('input', { bubbles: true }))
  await flushPromises()
}

function firstResult() {
  return document.querySelector('.search-bar__results button')
}

function ledgerTitle() {
  const el = document.querySelector('.ledger__title')
  if (!el) return null
  const lang = el.querySelector('.ledger__lang')
  if (!lang) return el.textContent.trim()
  return el.textContent.replace(lang.textContent, '').replace(/\s+/g, ' ').trim()
}

function sectionRow(title) {
  return [...document.querySelectorAll('.ledger__row')].find(
    (row) => row.querySelector('.ledger__row-title')?.textContent.trim() === title,
  )
}

function sectionRowTitles() {
  return [...document.querySelectorAll('.ledger__row-title')].map((el) => el.textContent.trim())
}

async function collapseLedger(wrapper) {
  // Step down from open → peek → collapsed.
  for (let step = 0; step < 3; step += 1) {
    const less = document.querySelector('[aria-label^="Show less"]')
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
  // Preferences are a module singleton — clearing storage alone leaves a
  // leftover language from a prior test still in memory.
  useUIState().updatePreferences({ language: 'en', showAllWikipedias: false })
  // The URL is session state now, so it leaks between tests: without this a
  // test inherits the previous one's realm and opens straight into it.
  history.replaceState(null, '', '/')
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

    const wrapper = mount(App, { attachTo: document.body })

    await typeSearch('Ein')
    await vi.advanceTimersByTimeAsync(250)
    await flushPromises()

    firstResult().dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
    await flushPromises()

    expect(fetchWikipediaArticle).toHaveBeenCalledWith('Albert Einstein', { language: 'en' })
    expect(ledgerTitle()).toBe('Albert Einstein')
    expect(document.body.textContent).toContain('German-born theoretical physicist.')
    expect(document.body.textContent).toContain('1234')

    expect(wrapper.find('.world-view__canvas').exists()).toBe(true)
    expect(wrapper.findAll('.world-view__portal')).toHaveLength(2)
  })

  it('shows an error message when the article fails to load', async () => {
    searchWikipediaTitles.mockResolvedValue([{ title: 'Albert Einstein', description: '', url: '' }])
    fetchWikipediaArticle.mockRejectedValue(new Error('boom'))

    const wrapper = mount(App, { attachTo: document.body })

    await typeSearch('Ein')
    await vi.advanceTimersByTimeAsync(250)
    await flushPromises()

    firstResult().dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
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

    const wrapper = mount(App, { attachTo: document.body })

    await typeSearch('Ein')
    await vi.advanceTimersByTimeAsync(250)
    await flushPromises()
    firstResult().dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
    await flushPromises()

    expect(ledgerTitle()).toBe('Albert Einstein')
    expect(wrapper.find('button[aria-label="Back"]').attributes('disabled')).toBeDefined()

    await wrapper.find('.world-view__portal').trigger('click')
    await flushPromises()

    // The preview card names the destination and IS the confirmation.
    expect(document.querySelector('.preview__title').textContent).toBe('Physics')
    travelButton().dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await settleTravel()

    expect(fetchWikipediaArticle).toHaveBeenCalledWith('Physics', { language: 'en' })
    expect(ledgerTitle()).toBe('Physics')

    const backButton = wrapper.find('button[aria-label="Back"]')
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

    const wrapper = mount(App, { attachTo: document.body })

    await typeSearch('Ein')
    await vi.advanceTimersByTimeAsync(250)
    await flushPromises()
    firstResult().dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
    await flushPromises()

    expect(saveSnapshotToStorage).toHaveBeenCalled()
    const [snapshot] = saveSnapshotToStorage.mock.calls.at(-1)
    expect(currentTitle(snapshot.navigation.graph)).toBe('Albert Einstein')
    expect(snapshot.articleCache['en:Albert Einstein'].title).toBe('Albert Einstein')
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

    const wrapper = mount(App, { attachTo: document.body })
    await flushPromises()

    expect(fetchWikipediaArticle).toHaveBeenCalledWith('Albert Einstein', { language: 'en' })
    expect(ledgerTitle()).toBe('Albert Einstein')
    const backButton = wrapper.find('button[aria-label="Back"]')
    expect(backButton.attributes('disabled')).toBeUndefined() // backstack restored non-empty
  })

  it('opens on the launch screen, which says what this is', () => {
    // The empty state used to be one italic sentence pointing at a search
    // box that, below 1024px, was neither above nor visible.
    mount(App, { attachTo: document.body })

    expect(document.querySelector('.launch')).not.toBeNull()
    expect(document.body.textContent).toContain('Every Wikipedia article is a world')
    expect(document.querySelector('.launch .search-bar input')).not.toBeNull()
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

    const wrapper = mount(App, { attachTo: document.body })

    await typeSearch('Ein')
    await vi.advanceTimersByTimeAsync(250)
    await flushPromises()
    firstResult().dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
    await flushPromises()

    expect(document.body.textContent).not.toContain('Updated on Wikipedia') // first visit, nothing to compare against

    await wrapper.find('.world-view__portal').trigger('click') // navigate to Physics
      travelButton().dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await settleTravel()

    await flushPromises()

    const backButton = wrapper.find('button[aria-label="Back"]')
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

  // jsdom implements neither scrollIntoView/scrollTo nor layout; the
  // focus path calls scrollTo on the sheet body, so stub both and assert.
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn()
    Element.prototype.scrollTo = vi.fn()
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
    await typeSearch('Ein')
    await vi.advanceTimersByTimeAsync(250)
    await flushPromises()
    firstResult().dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
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
    // Ledger selection scroll waits one animation frame for layout; under
    // this suite's fake timers that frame only fires when time advances.
    await vi.advanceTimersByTimeAsync(16)
    await flushPromises()
  }

  // The real engine builds the world, and applyPeakLimits sorts each
  // level by subtree size: "Early life" (500 with its child) outranks
  // "Career" (400), and flattenPeaks emits each parent followed by its
  // subtree. So the peaks are [Early life, Childhood, Career].
  const PEAK = { earlyLife: 0, childhood: 1, career: 2 }

  it('lists summits as well as ranges, in the order the article puts them', async () => {
    await mountWithArticle()

    expect(sectionRowTitles()).toEqual(['Early life', 'Childhood', 'Career'])
  })

  it('selects the summit that was clicked, not the range around it', async () => {
    // The renderer used to resolve a subsection click to its owning
    // top-level's anchor, because that was the only granularity the panel
    // listed — so clicking a summit answered a question nobody asked.
    const wrapper = await mountWithArticle()

    await clickSectionMarker(wrapper, { peakIndex: PEAK.childhood, anchor: 'Childhood', depth: 2 })

    expect(sectionRow('Childhood').classList.contains('is-selected')).toBe(true)
    expect(sectionRow('Early life').classList.contains('is-selected')).toBe(false)
    expect(Element.prototype.scrollTo).toHaveBeenCalled()
  })

  it('expands a collapsed panel before focusing', async () => {
    const wrapper = await mountWithArticle()
    await collapseLedger(wrapper)
    expect(document.querySelector('.ledger__restore')).not.toBeNull()

    await clickSectionMarker(wrapper, { peakIndex: PEAK.career, anchor: 'Career', depth: 1 })

    expect(document.querySelector('.ledger__restore')).toBeNull()
    expect(sectionRow('Career').classList.contains('is-selected')).toBe(true)
  })

  it('takes the reader back when the same summit is clicked again', async () => {
    const wrapper = await mountWithArticle()

    await clickSectionMarker(wrapper, { peakIndex: PEAK.career, anchor: 'Career', depth: 1 })
    Element.prototype.scrollTo.mockClear()
    Element.prototype.scrollIntoView.mockClear()
    // Someone who has scrolled away and clicked the same mountain again
    // wants to be taken back to it, not told they are already there.
    await clickSectionMarker(wrapper, { peakIndex: PEAK.career, anchor: 'Career', depth: 1 })

    expect(Element.prototype.scrollTo).toHaveBeenCalled()
    expect(sectionRow('Career').classList.contains('is-selected')).toBe(true)
  })

  it('moves the selection when a different section is clicked', async () => {
    const wrapper = await mountWithArticle()

    await clickSectionMarker(wrapper, { peakIndex: PEAK.career, anchor: 'Career', depth: 1 })
    await clickSectionMarker(wrapper, { peakIndex: PEAK.earlyLife, anchor: 'Early_life', depth: 1 })

    expect(sectionRow('Career').classList.contains('is-selected')).toBe(false)
    expect(sectionRow('Early life').classList.contains('is-selected')).toBe(true)
  })

  it('lights the summit on the map when a row is chosen in the Ledger', async () => {
    // The other half of the link, and the whole of it on a touch device:
    // hover is what raises a wall, reveals siblings and labels a summit,
    // and a finger has none.
    const wrapper = await mountWithArticle()

    sectionRow('Career').querySelector('.ledger__cells').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(wrapper.findComponent({ name: 'WorldView3D' }).props('selectedPeak')).toBe(PEAK.career)
  })

  it('ignores a click that resolves to no peak at all', async () => {
    const wrapper = await mountWithArticle()

    await clickSectionMarker(wrapper, { peakIndex: null, anchor: null, depth: 1 })

    expect(document.querySelectorAll('.ledger__row.is-selected')).toHaveLength(0)
    expect(Element.prototype.scrollTo).not.toHaveBeenCalled()
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled()
  })
})

describe('App keyboard', () => {
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

    press('s', searchField())
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

    mount(App, { attachTo: document.body })
    await flushPromises()

    expect(fetchWikipediaArticle).toHaveBeenCalledWith('Saturn', { language: 'en' })
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

    mount(App, { attachTo: document.body })
    await flushPromises()

    expect(fetchWikipediaArticle).toHaveBeenLastCalledWith('Saturn', { language: 'en' })
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

    const wrapper = mount(App, { attachTo: document.body })
    await typeSearch('Ein')
    await vi.advanceTimersByTimeAsync(250)
    await flushPromises()
    firstResult().dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
    await flushPromises()

    expect(window.location.search).toContain('realm=Albert')
    expect(history.state).toMatchObject({ title: 'Albert Einstein' })
  })

  it('does not reinterpret an English URL realm with a leftover Hebrew preference', async () => {
    // The bug: prefs.language=he + ?realm=EnglishTitle (no lang) reopened the
    // English title on he.wikipedia and wrote lang=he back into the URL.
    useUIState().updatePreferences({ language: 'he' })
    history.replaceState(null, '', '?realm=The+Martians+%28scientists%29')
    loadSnapshotFromStorage.mockReturnValue({
      schemaVersion: '4.0',
      createdAt: '2026-09-12T00:00:00Z',
      appVersion: '0.1.0',
      engineVersion: 'v1',
      worlds: {},
      navigation: {
        graph: jump(createVisitGraph(), 'The Martians (scientists)', { language: 'en' }),
      },
      articleCache: {},
      generationCache: {},
      uiState: {},
    })
    fetchWikipediaArticle.mockResolvedValue({
      articleId: 'en:1',
      title: 'The Martians (scientists)',
      language: 'en',
      summary: 'Scientists.',
      latestRevisionId: 1,
      categories: [],
      links: [],
      images: [],
      sections: { lead: { ownSize: 10, links: [] }, totalSize: 10, sections: [] },
    })

    mount(App, { attachTo: document.body })
    await flushPromises()

    expect(fetchWikipediaArticle).toHaveBeenCalledWith('The Martians (scientists)', { language: 'en' })
    expect(readLanguage(window.location.search)).toBeNull()
    expect(readRealm(window.location.search)).toBe('The Martians (scientists)')
  })

  it('keeps a restored Hebrew realm even when the search preference is English', async () => {
    useUIState().updatePreferences({ language: 'en' })
    loadSnapshotFromStorage.mockReturnValue({
      schemaVersion: '4.0',
      createdAt: '2026-09-12T00:00:00Z',
      appVersion: '0.1.0',
      engineVersion: 'v1',
      worlds: {},
      navigation: {
        graph: jump(createVisitGraph(), 'שבתאי', { language: 'he' }),
      },
      articleCache: {},
      generationCache: {},
      uiState: {},
    })
    fetchWikipediaArticle.mockResolvedValue({
      articleId: 'he:1',
      title: 'שבתאי',
      language: 'he',
      summary: 'כוכב.',
      latestRevisionId: 1,
      categories: [],
      links: [],
      images: [],
      sections: { lead: { ownSize: 10, links: [] }, totalSize: 10, sections: [] },
    })

    mount(App, { attachTo: document.body })
    await flushPromises()

    expect(fetchWikipediaArticle).toHaveBeenCalledWith('שבתאי', { language: 'he' })
    expect(readLanguage(window.location.search)).toBe('he')
    expect(readRealm(window.location.search)).toBe('שבתאי')
  })

  it('loads the language that rides with a shared link', async () => {
    history.replaceState(null, '', '?realm=%D7%A9%D7%91%D7%AA%D7%90%D7%99&lang=he')
    fetchWikipediaArticle.mockResolvedValue({
      articleId: 'he:1',
      title: 'שבתאי',
      language: 'he',
      summary: 'כוכב.',
      latestRevisionId: 1,
      categories: [],
      links: [],
      images: [],
      sections: { lead: { ownSize: 10, links: [] }, totalSize: 10, sections: [] },
    })

    mount(App, { attachTo: document.body })
    await flushPromises()

    expect(fetchWikipediaArticle).toHaveBeenCalledWith('שבתאי', { language: 'he' })
    expect(useUIState().preferences.language).toBe('he')
  })

  it('does not persist a search-language change until an article is chosen', async () => {
    mount(App, { attachTo: document.body })
    await flushPromises()

    const select = document.querySelector('.search-bar__lang-select')
    select.value = 'he'
    select.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()

    expect(useUIState().preferences.language).toBe('en')
    expect(JSON.parse(localStorage.getItem('wikirealms:preferences')).language).toBe('en')
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
    await typeSearch('Sat')
    await vi.advanceTimersByTimeAsync(250)
    await flushPromises()
    firstResult().dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
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

  it('opens on the flat map', async () => {
    // Pinned so moving the default is a deliberate edit rather than a
    // silent one. The map shows the whole article at once; the planet can
    // only ever show the half of it facing you.
    const wrapper = await mountWithWorld()

    expect(wrapper.find('.helm [role="radio"][aria-checked="true"]').text()).toBe('Flat')
    wrapper.unmount()
  })

  it('changes world shape from the helm and remembers it', async () => {
    const wrapper = await mountWithWorld()

    await wrapper.findAll('.helm [role="radio"]')[0].trigger('click')

    expect(wrapper.find('.helm [role="radio"][aria-checked="true"]').text()).toBe('Planet')
    expect(JSON.parse(localStorage.getItem('wikirealms:preferences')).worldShape).toBe('sphere')
    wrapper.unmount()
  })

  it('toggles the shape from the keyboard on one key, not two', async () => {
    // Keys 1 and 3 used to switch RENDERER, while shape hid in settings.
    const wrapper = await mountWithWorld()

    const press = async () => {
      const event = new KeyboardEvent('keydown', { key: 'v', bubbles: true, cancelable: true })
      Object.defineProperty(event, 'target', { value: document.body })
      window.dispatchEvent(event)
      await flushPromises()
    }
    const active = () => wrapper.find('.helm [role="radio"][aria-checked="true"]').text()

    await press()
    expect(active()).toBe('Planet')
    // Both ways on the one key, so it is a toggle rather than a switch
    // that only moves off the default.
    await press()
    expect(active()).toBe('Flat')
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
    await typeSearch('Sat')
    await vi.advanceTimersByTimeAsync(250)
    await flushPromises()
    firstResult().dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
    await flushPromises()

    expect(wrapper.find('.helm').exists()).toBe(true)
    expect(wrapper.find('[aria-label="Recentre the view"]').exists()).toBe(false)
    wrapper.unmount()
  })
})

describe('App shell', () => {
  afterEach(() => {
    localStorage.clear()
    history.replaceState(null, '', '/')
    resetOverlays()
    resetKeymap()
  })

  it('has one shell, not two', async () => {
    // The taskbar and the floating nav panel both carried Info, Settings and
    // Share; below 1024px you got both copies.
    const wrapper = mount(App, { attachTo: document.body })
    await flushPromises()

    expect(wrapper.findAll('.scrim')).toHaveLength(1)
    expect(document.querySelectorAll('[aria-label="Settings"]')).toHaveLength(1)
    expect(wrapper.find('.taskbar').exists()).toBe(false)
  })

  it('opens search on arrival, since there is nowhere to be yet', async () => {
    mount(App, { attachTo: document.body })
    await flushPromises()

    expect(document.querySelector('.search-bar input')).not.toBeNull()
  })

  it('walks the trail back to an earlier realm without rewriting it', async () => {
    const articles = {
      Saturn: { articleId: 'en:1', title: 'Saturn', summary: 'Sixth planet.', latestRevisionId: 1, categories: [], links: ['Titan'], images: [], sections: { lead: { ownSize: 10, links: ['Titan'] }, totalSize: 10, sections: [] } },
      Titan: { articleId: 'en:2', title: 'Titan', summary: 'A moon.', latestRevisionId: 2, categories: [], links: [], images: [], sections: { lead: { ownSize: 10, links: [] }, totalSize: 10, sections: [] } },
    }
    searchWikipediaTitles.mockResolvedValue([{ title: 'Saturn', description: '', url: '' }])
    fetchWikipediaArticle.mockImplementation(async (title) => articles[title])

    const wrapper = mount(App, { attachTo: document.body })
    await typeSearch('Sat')
    await vi.advanceTimersByTimeAsync(250)
    await flushPromises()
    firstResult().dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    await wrapper.find('.world-view__portal').trigger('click')
    await flushPromises()
    travelButton().dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await settleTravel()

    expect(ledgerTitle()).toBe('Titan')

    // Open the trail and step back to the first realm.
    wrapper.find('.scrim__trail').element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
    const stops = [...document.querySelectorAll('.trail__name')].map((name) => name.textContent)
    expect(stops).toEqual(['Saturn', 'Titan'])

    const saturn = [...document.querySelectorAll('.trail__stop')].find((stop) =>
      stop.textContent.includes('Saturn'),
    )
    saturn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(ledgerTitle()).toBe('Saturn')
    // Returning to a realm is a move like any other: it goes into history,
    // so back reaches where you just were.
    expect(wrapper.find('[aria-label="Back"]').attributes('disabled')).toBeUndefined()
  })
})

describe('App search inversion', () => {
  afterEach(() => {
    localStorage.clear()
    history.replaceState(null, '', '/')
    resetOverlays()
    resetKeymap()
  })

  async function arrive() {
    searchWikipediaTitles.mockResolvedValue([{ title: 'Saturn', description: '', url: '' }])
    fetchWikipediaArticle.mockResolvedValue({
      articleId: 'en:1', title: 'Saturn', summary: 'Sixth planet.', latestRevisionId: 1,
      categories: [], links: [], images: [],
      sections: { lead: { ownSize: 10, links: [] }, totalSize: 10, sections: [] },
    })
    const wrapper = mount(App, { attachTo: document.body })
    await typeSearch('Sat')
    await vi.advanceTimersByTimeAsync(250)
    await flushPromises()
    firstResult().dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
    return wrapper
  }

  it('puts search away once there is a realm', async () => {
    // It held 30rem of the top bar on desktop before, for the thing least
    // needed after arriving: from here on the way onward is portals.
    await arrive()

    expect(document.querySelector('.launch')).toBeNull()
    expect(document.querySelector('.search-bar input')).toBeNull()
  })

  it('brings it back on the palette shortcut, but not before', async () => {
    const wrapper = mount(App, { attachTo: document.body })
    await flushPromises()

    // On the launch screen the field is already there and focused, so the
    // shortcut has nothing to do.
    const before = document.querySelectorAll('.search-bar').length
    press('/')
    await flushPromises()
    expect(document.querySelectorAll('.search-bar')).toHaveLength(before)

    wrapper.unmount()

    await arrive()
    press('/')
    await flushPromises()

    expect(document.querySelector('.search-bar input')).not.toBeNull()
  })

  it('says plainly that searching leaves the world you are in', async () => {
    await arrive()
    press('/')
    await flushPromises()

    expect(document.body.textContent).toContain('starts a new journey')
  })
})

describe('App returning to the opening screen', () => {
  afterEach(() => {
    localStorage.clear()
    history.replaceState(null, '', '/')
    resetOverlays()
    resetKeymap()
  })

  async function arrive() {
    searchWikipediaTitles.mockResolvedValue([{ title: 'Saturn', description: '', url: '' }])
    fetchWikipediaArticle.mockResolvedValue({
      articleId: 'en:1', title: 'Saturn', summary: 'Sixth planet.', latestRevisionId: 1,
      categories: [], links: [], images: [],
      sections: { lead: { ownSize: 10, links: [] }, totalSize: 10, sections: [] },
    })
    const wrapper = mount(App, { attachTo: document.body })
    await typeSearch('Sat')
    await vi.advanceTimersByTimeAsync(250)
    await flushPromises()
    firstResult().dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
    return wrapper
  }

  it('comes back from the mark, and leaves again', async () => {
    const wrapper = await arrive()
    expect(document.querySelector('.launch')).toBeNull()

    await wrapper.find('[aria-label="Opening screen"]').trigger('click')
    expect(document.querySelector('.launch')).not.toBeNull()

    press('Escape')
    await flushPromises()

    expect(document.querySelector('.launch')).toBeNull()
    expect(ledgerTitle()).toBe('Saturn')
  })

  it('is reachable from the trail, where the journey actions live', async () => {
    const wrapper = await arrive()

    wrapper.find('.scrim__trail').element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
    ;[...document.querySelectorAll('.trail__actions button')]
      .find((action) => action.textContent.includes('Somewhere new'))
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(document.querySelector('.launch')).not.toBeNull()
  })

  it('dismisses itself when a realm is chosen from it', async () => {
    const wrapper = await arrive()
    await wrapper.find('[aria-label="Opening screen"]').trigger('click')

    document.querySelector('.launch__realms button').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(document.querySelector('.launch')).toBeNull()
  })
})

describe('App travel', () => {
  const articles = {
    Saturn: { articleId: 'en:1', title: 'Saturn', summary: 'Sixth planet.', latestRevisionId: 1, categories: [], links: ['Titan'], images: [], sections: { lead: { ownSize: 10, links: ['Titan'] }, totalSize: 10, sections: [] } },
    Titan: { articleId: 'en:2', title: 'Titan', summary: 'A moon.', latestRevisionId: 2, categories: [], links: [], images: [], sections: { lead: { ownSize: 10, links: [] }, totalSize: 10, sections: [] } },
  }

  afterEach(() => {
    localStorage.clear()
    history.replaceState(null, '', '/')
    resetOverlays()
    resetKeymap()
  })

  async function arrive() {
    searchWikipediaTitles.mockResolvedValue([{ title: 'Saturn', description: '', url: '' }])
    fetchWikipediaArticle.mockImplementation(async (title) => articles[title])

    const wrapper = mount(App, { attachTo: document.body })
    await typeSearch('Sat')
    await vi.advanceTimersByTimeAsync(250)
    await flushPromises()
    firstResult().dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
    return wrapper
  }

  it('asks at the marker, naming where the portal goes', async () => {
    // The old confirm was a centred dialog with no destination context,
    // dropped away from whatever the viewer had just tapped.
    const wrapper = await arrive()

    await wrapper.find('.world-view__portal').trigger('click')
    await flushPromises()

    expect(document.querySelector('.preview__title').textContent).toBe('Titan')
    expect(document.querySelector('.preview__leader')).not.toBeNull()
  })

  it('lets the viewer stay', async () => {
    const wrapper = await arrive()
    await wrapper.find('.world-view__portal').trigger('click')
    await flushPromises()

    document.querySelector('.preview__stay').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(document.querySelector('.preview')).toBeNull()
    expect(ledgerTitle()).toBe('Saturn')
  })

  it('replaces the world behind a wash rather than during the motion', async () => {
    const wrapper = await arrive()
    await wrapper.find('.world-view__portal').trigger('click')
    await flushPromises()

    travelButton().dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    // Diving: nothing fetched yet, because a ~120ms synchronous generate
    // would stutter the camera.
    expect(document.querySelector('.app__wash')).not.toBeNull()
    expect(fetchWikipediaArticle).not.toHaveBeenCalledWith('Titan')

    await settleTravel()

    expect(ledgerTitle()).toBe('Titan')
    expect(document.querySelector('.app__wash')).toBeNull()
  })

  it('can be cut short with Escape', async () => {
    const wrapper = await arrive()
    await wrapper.find('.world-view__portal').trigger('click')
    await flushPromises()
    travelButton().dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    press('Escape')
    await flushPromises()

    expect(document.querySelector('.app__wash')).toBeNull()
  })

  it('arrives without any transition when the setting is off', async () => {
    localStorage.setItem('wikirealms:preferences', JSON.stringify({ travelAnimation: false }))
    const wrapper = await arrive()

    await wrapper.find('.world-view__portal').trigger('click')
    await flushPromises()
    travelButton().dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
    await vi.advanceTimersByTimeAsync(0)
    await flushPromises()

    expect(ledgerTitle()).toBe('Titan')
  })
})

describe('App legend', () => {
  afterEach(() => {
    localStorage.clear()
    history.replaceState(null, '', '/')
    resetOverlays()
    resetKeymap()
  })

  it('is offered only once there is a world to explain', async () => {
    const wrapper = mount(App, { attachTo: document.body })
    await flushPromises()

    press('l')
    await flushPromises()
    expect(document.querySelector('.legend')).toBeNull()

    wrapper.unmount()

    searchWikipediaTitles.mockResolvedValue([{ title: 'Saturn', description: '', url: '' }])
    fetchWikipediaArticle.mockResolvedValue({
      articleId: 'en:1', title: 'Saturn', summary: 'Sixth planet.', latestRevisionId: 1,
      categories: [], links: [], images: [],
      sections: { lead: { ownSize: 10, links: [] }, totalSize: 10, sections: [] },
    })
    mount(App, { attachTo: document.body })
    await typeSearch('Sat')
    await vi.advanceTimersByTimeAsync(250)
    await flushPromises()
    firstResult().dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    press('l')
    await flushPromises()

    expect(document.querySelector('.legend')).not.toBeNull()
    expect(document.body.textContent).toContain('how well each section cites')

    press('l')
    await flushPromises()
    expect(document.querySelector('.legend')).toBeNull()
  })
})

describe('App legend affordance', () => {
  afterEach(() => {
    localStorage.clear()
    history.replaceState(null, '', '/')
    resetOverlays()
    resetKeymap()
  })

  it('opens from the helm, not only from the keyboard', async () => {
    searchWikipediaTitles.mockResolvedValue([{ title: 'Saturn', description: '', url: '' }])
    fetchWikipediaArticle.mockResolvedValue({
      articleId: 'en:1', title: 'Saturn', summary: 'Sixth planet.', latestRevisionId: 1,
      categories: [], links: [], images: [],
      sections: { lead: { ownSize: 10, links: [] }, totalSize: 10, sections: [] },
    })

    const wrapper = mount(App, { attachTo: document.body })
    await typeSearch('Sat')
    await vi.advanceTimersByTimeAsync(250)
    await flushPromises()
    firstResult().dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    await wrapper.find('[aria-label="What am I looking at?"]').trigger('click')

    expect(document.querySelector('.legend')).not.toBeNull()
  })
})

describe('App trail', () => {
  afterEach(() => {
    localStorage.clear()
    history.replaceState(null, '', '/')
    resetOverlays()
    resetKeymap()
  })

  it('shows the branch you left, and walks back into it', async () => {
    // The end-to-end version of the thing the flat list could not show.
    const articles = {
      Saturn: { articleId: 'en:1', title: 'Saturn', summary: '.', latestRevisionId: 1, categories: [], links: ['Titan'], images: [], sections: { lead: { ownSize: 10, links: ['Titan'] }, totalSize: 10, sections: [] } },
      Titan: { articleId: 'en:2', title: 'Titan', summary: '.', latestRevisionId: 2, categories: [], links: [], images: [], sections: { lead: { ownSize: 10, links: [] }, totalSize: 10, sections: [] } },
    }
    searchWikipediaTitles.mockResolvedValue([{ title: 'Saturn', description: '', url: '' }])
    fetchWikipediaArticle.mockImplementation(async (title) => articles[title])

    const wrapper = mount(App, { attachTo: document.body })
    await typeSearch('Sat')
    await vi.advanceTimersByTimeAsync(250)
    await flushPromises()
    firstResult().dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    await wrapper.find('.world-view__portal').trigger('click')
    await flushPromises()
    travelButton().dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await settleTravel()
    expect(ledgerTitle()).toBe('Titan')

    await wrapper.find('[aria-label="Back"]').trigger('click')
    await flushPromises()

    wrapper.find('.scrim__trail').element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    // Both stops are listed, the abandoned branch included.
    const names = [...document.querySelectorAll('.trail__name')].map((n) => n.textContent)
    expect(names).toEqual(['Saturn', 'Titan'])

    // And it is reachable again.
    const titan = [...document.querySelectorAll('.trail__stop')].find((s) => s.textContent.includes('Titan'))
    titan.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(ledgerTitle()).toBe('Titan')
  })
})
