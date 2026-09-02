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
  const toggleButton = wrapper.findAll('.app__nav-controls button').find((button) => button.text() === '2D view')
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
    expect(wrapper.find('.app__nav-controls button[disabled]').exists()).toBe(true) // both disabled initially

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

    const [backButton] = wrapper.findAll('.app__nav-controls button')
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
    expect(snapshot.navigation.current).toBe('Albert Einstein')
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
    const [backButton] = wrapper.findAll('.app__nav-controls button')
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

    const [backButton] = wrapper.findAll('.app__nav-controls button')
    await backButton.trigger('click') // back to Albert Einstein, refetches with a newer revision
    await flushPromises()

    expect(wrapper.find('.app__badge--stale').exists()).toBe(true)
  })
})
