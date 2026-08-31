import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import SearchBar from '../../../src/ui/components/SearchBar.vue'

vi.mock('../../../src/adapters/wikipediaSearchAdapter.js', () => ({
  searchWikipediaTitles: vi.fn(),
}))

import { searchWikipediaTitles } from '../../../src/adapters/wikipediaSearchAdapter.js'

beforeEach(() => {
  vi.useFakeTimers()
  searchWikipediaTitles.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('SearchBar', () => {
  it('renders results and emits select when a result is chosen', async () => {
    searchWikipediaTitles.mockResolvedValue([
      { title: 'Einstein', description: 'German physicist', url: 'https://en.wikipedia.org/wiki/Einstein' },
    ])

    const wrapper = mount(SearchBar)

    await wrapper.find('input').setValue('Ein')
    await vi.advanceTimersByTimeAsync(250)
    await flushPromises()

    const resultButtons = wrapper.findAll('.search-bar__results button')
    expect(resultButtons).toHaveLength(1)
    expect(resultButtons[0].text()).toContain('Einstein')

    await resultButtons[0].trigger('click')

    expect(wrapper.emitted('select')).toBeTruthy()
    expect(wrapper.emitted('select')[0][0].title).toBe('Einstein')
  })

  it('shows an error message when the search fails', async () => {
    searchWikipediaTitles.mockRejectedValue(new Error('boom'))

    const wrapper = mount(SearchBar)

    await wrapper.find('input').setValue('Ein')
    await vi.advanceTimersByTimeAsync(250)
    await flushPromises()

    expect(wrapper.find('.search-bar__status--error').text()).toContain('boom')
  })
})
