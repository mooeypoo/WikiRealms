import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import App from '../src/App.vue'

vi.mock('../src/adapters/wikipediaSearchAdapter.js', () => ({
  searchWikipediaTitles: vi.fn(),
}))
vi.mock('../src/adapters/wikipediaArticleAdapter.js', () => ({
  fetchWikipediaArticle: vi.fn(),
}))
vi.mock('../src/adapters/snapshotStorage.js', () => ({
  saveSnapshotToStorage: vi.fn(),
  loadSnapshotFromStorage: vi.fn().mockReturnValue(null),
  clearSnapshotFromStorage: vi.fn(),
}))

import { currentTitle } from '../src/core/traversal/visitGraph.js'
import { resetKeymap } from '../src/ui/design/useKeymap.js'
import { resetOverlays } from '../src/ui/design/useOverlays.js'
import { searchWikipediaTitles } from '../src/adapters/wikipediaSearchAdapter.js'
import { fetchWikipediaArticle } from '../src/adapters/wikipediaArticleAdapter.js'
import { saveSnapshotToStorage, loadSnapshotFromStorage } from '../src/adapters/snapshotStorage.js'

beforeEach(() => {
  vi.useFakeTimers()
  searchWikipediaTitles.mockReset()
  fetchWikipediaArticle.mockReset()
  saveSnapshotToStorage.mockReset()
  loadSnapshotFromStorage.mockReset().mockReturnValue(null)
})

afterEach(() => {
  vi.useRealTimers()
})

async function switchTo2D(wrapper) {
  const toggleButton = wrapper.find('button[aria-label="Switch to 2D view"]')
  await toggleButton.trigger('click')
}

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
    expect(wrapper.find('.app__selected-article h2').text()).toBe('Albert Einstein')
    expect(wrapper.text()).toContain('German-born theoretical physicist.')
    expect(wrapper.text()).toContain('1234')

    await switchTo2D(wrapper)
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

    expect(wrapper.find('.app__selected-article h2').text()).toBe('Albert Einstein')
    expect(wrapper.find('button[aria-label="Go back"]').attributes('disabled')).toBeDefined()

    await switchTo2D(wrapper)
    await wrapper.find('.world-view__portal').trigger('click')
    await flushPromises()

    // Confirm the portal navigation via modal
    const confirmButton = wrapper.find('.app__portal-modal-confirm')
    expect(confirmButton.exists()).toBe(true)
    await confirmButton.trigger('click')
    await flushPromises()

    expect(fetchWikipediaArticle).toHaveBeenCalledWith('Physics')
    expect(wrapper.find('.app__selected-article h2').text()).toBe('Physics')

    const backButton = wrapper.find('button[aria-label="Go back"]')
    expect(backButton.attributes('disabled')).toBeUndefined()

    await backButton.trigger('click')
    await flushPromises()

    expect(wrapper.find('.app__selected-article h2').text()).toBe('Albert Einstein')
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
    expect(wrapper.find('.app__selected-article h2').text()).toBe('Albert Einstein')
    const backButton = wrapper.find('button[aria-label="Go back"]')
    expect(backButton.attributes('disabled')).toBeUndefined() // backstack restored non-empty
  })

  it('shows an empty-state prompt before any article has been selected', () => {
    const wrapper = mount(App)

    expect(wrapper.find('.app__empty-state').exists()).toBe(true)
    expect(wrapper.find('.app__selected-article').exists()).toBe(false)
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

    expect(wrapper.find('.app__badge--stale').exists()).toBe(false) // first visit, nothing to compare against

    await switchTo2D(wrapper)
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

    expect(wrapper.find('.app__badge--stale').exists()).toBe(true)
  })
})

describe('App section focus', () => {
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
    return mounted
  }

  async function clickSectionMarker(wrapper, target) {
    wrapper.findComponent({ name: 'WorldView3D' }).vm.$emit('section-click', target)
    await flushPromises()
    await flushPromises()
  }

  it('renders a card per top-level section, with subsection/word/citation chips', async () => {
    const wrapper = await mountWithArticle()

    const cards = wrapper.findAll('.app__section-card')
    expect(cards).toHaveLength(2)
    expect(cards[0].attributes('id')).toBe('app-section-Early_life')
    expect(cards[0].find('h4').text()).toBe('Early life')
    expect(cards[0].text()).toContain('1 subsection')
    expect(cards[0].text()).toContain('4 cites')
    expect(cards[1].attributes('id')).toBe('app-section-Career')
    // Subsections aren't listed as cards of their own.
    expect(wrapper.find('#app-section-Childhood').exists()).toBe(false)
  })

  it('links each card to its section on Wikipedia', async () => {
    const wrapper = await mountWithArticle()

    expect(wrapper.find('#app-section-Career a').attributes('href')).toBe(
      'https://en.wikipedia.org/wiki/Albert_Einstein#Career',
    )
  })

  it('flashes the clicked section card and scrolls it into view', async () => {
    const wrapper = await mountWithArticle()

    await clickSectionMarker(wrapper, { anchor: 'Career', sectionAnchor: 'Career', depth: 1 })

    expect(wrapper.find('#app-section-Career').classes()).toContain('app__section-card--flash')
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
  })

  it('focuses the owning top-level card when a subsection marker is clicked', async () => {
    const wrapper = await mountWithArticle()

    await clickSectionMarker(wrapper, { anchor: 'Childhood', sectionAnchor: 'Early_life', depth: 2 })

    expect(wrapper.find('#app-section-Early_life').classes()).toContain('app__section-card--flash')
  })

  it('expands a collapsed panel before focusing', async () => {
    const wrapper = await mountWithArticle()
    await wrapper.find('.app__article-toggle').trigger('click')
    expect(wrapper.find('.app__selected-article').classes()).toContain('app__selected-article--collapsed')

    await clickSectionMarker(wrapper, { anchor: 'Career', sectionAnchor: 'Career', depth: 1 })

    expect(wrapper.find('.app__selected-article').classes()).not.toContain('app__selected-article--collapsed')
    expect(wrapper.find('#app-section-Career').classes()).toContain('app__section-card--flash')
  })

  it('re-flashes the same card when it is clicked again', async () => {
    const wrapper = await mountWithArticle()

    await clickSectionMarker(wrapper, { anchor: 'Career', sectionAnchor: 'Career', depth: 1 })
    // Halfway through the first flash the card is clicked again — the
    // highlight restarts rather than expiring on the original timer.
    await vi.advanceTimersByTimeAsync(800)
    await clickSectionMarker(wrapper, { anchor: 'Career', sectionAnchor: 'Career', depth: 1 })
    await vi.advanceTimersByTimeAsync(800)

    expect(wrapper.find('#app-section-Career').classes()).toContain('app__section-card--flash')

    await vi.advanceTimersByTimeAsync(800)
    expect(wrapper.find('#app-section-Career').classes()).not.toContain('app__section-card--flash')
  })

  it('moves the highlight when a different section is clicked mid-flash', async () => {
    const wrapper = await mountWithArticle()

    await clickSectionMarker(wrapper, { anchor: 'Career', sectionAnchor: 'Career', depth: 1 })
    await clickSectionMarker(wrapper, { anchor: 'Early_life', sectionAnchor: 'Early_life', depth: 1 })

    expect(wrapper.find('#app-section-Career').classes()).not.toContain('app__section-card--flash')
    expect(wrapper.find('#app-section-Early_life').classes()).toContain('app__section-card--flash')
  })

  it('ignores a click on a peak with no section anchor (the folded range)', async () => {
    const wrapper = await mountWithArticle()

    await clickSectionMarker(wrapper, { anchor: null, sectionAnchor: null, depth: 1 })

    expect(wrapper.findAll('.app__section-card--flash')).toHaveLength(0)
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
