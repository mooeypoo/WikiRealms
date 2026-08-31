import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import App from '../src/App.vue'

vi.mock('../src/adapters/wikipediaSearchAdapter.js', () => ({
  searchWikipediaTitles: vi.fn(),
}))
vi.mock('../src/adapters/wikipediaArticleAdapter.js', () => ({
  fetchWikipediaArticle: vi.fn(),
}))

import { searchWikipediaTitles } from '../src/adapters/wikipediaSearchAdapter.js'
import { fetchWikipediaArticle } from '../src/adapters/wikipediaArticleAdapter.js'

beforeEach(() => {
  vi.useFakeTimers()
  searchWikipediaTitles.mockReset()
  fetchWikipediaArticle.mockReset()
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
    expect(wrapper.text()).toContain('Revision: 1234')
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

    expect(wrapper.find('.app__status--error').text()).toBe('boom')
  })
})
