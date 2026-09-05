import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import SearchBar from '../../../src/ui/components/SearchBar.vue'

enableAutoUnmount(afterEach)

const RESULTS = [
  { title: 'Einstein', description: 'German physicist' },
  { title: 'Einsteinium', description: 'Chemical element' },
]

function mountSearch(props = {}) {
  return mount(SearchBar, { props: { query: 'Ein', results: RESULTS, ...props } })
}

describe('SearchBar', () => {
  it('takes its state from its owner rather than fetching', () => {
    // It used to call useArticleSearch itself, which meant it could not be
    // rendered anywhere — a story, a second caller — without the network.
    const wrapper = mountSearch()

    expect(wrapper.findAll('[role="option"]')).toHaveLength(2)
    expect(wrapper.find('input').element.value).toBe('Ein')
  })

  it('reports typing rather than holding it', async () => {
    const wrapper = mountSearch({ query: '' })

    await wrapper.find('input').setValue('Sat')

    expect(wrapper.emitted('update:query')).toEqual([['Sat']])
  })

  it('emits the chosen result', async () => {
    const wrapper = mountSearch()

    await wrapper.findAll('[role="option"]')[1].trigger('click')

    expect(wrapper.emitted('select')[0][0].title).toBe('Einsteinium')
  })

  describe('the keyboard', () => {
    it('marks the first result so Enter has something to take', () => {
      const wrapper = mountSearch()

      expect(wrapper.find('[role="option"]').attributes('aria-selected')).toBe('true')
    })

    it('moves through results with the arrows and wraps around', async () => {
      const wrapper = mountSearch()
      const input = wrapper.find('input')

      await input.trigger('keydown', { key: 'ArrowDown' })
      expect(wrapper.findAll('[role="option"]')[1].attributes('aria-selected')).toBe('true')

      await input.trigger('keydown', { key: 'ArrowDown' })
      expect(wrapper.findAll('[role="option"]')[0].attributes('aria-selected')).toBe('true')

      await input.trigger('keydown', { key: 'ArrowUp' })
      expect(wrapper.findAll('[role="option"]')[1].attributes('aria-selected')).toBe('true')
    })

    it('takes the marked result on Enter', async () => {
      const wrapper = mountSearch()

      await wrapper.find('input').trigger('keydown', { key: 'ArrowDown' })
      await wrapper.find('input').trigger('keydown', { key: 'Enter' })

      expect(wrapper.emitted('select')[0][0].title).toBe('Einsteinium')
    })

    it('leaves Enter alone when there is nothing to take', async () => {
      const wrapper = mountSearch({ results: [] })

      await wrapper.find('input').trigger('keydown', { key: 'Enter' })

      expect(wrapper.emitted('select')).toBeUndefined()
    })

    it('points assistive technology at the marked result', async () => {
      const wrapper = mountSearch()

      expect(wrapper.find('input').attributes('aria-activedescendant')).toBe('search-result-0')

      await wrapper.find('input').trigger('keydown', { key: 'ArrowDown' })

      expect(wrapper.find('input').attributes('aria-activedescendant')).toBe('search-result-1')
    })
  })

  it('shows a failure rather than an empty list', () => {
    const wrapper = mountSearch({ results: [], status: 'error', errorMessage: 'boom' })

    expect(wrapper.find('.search-bar__status--error').text()).toContain('boom')
  })

  it('distinguishes "nothing found" from "not searched yet"', () => {
    const searched = mountSearch({ results: [], status: 'success', query: 'zzz' })
    expect(searched.text()).toContain('Nothing found')

    const idle = mountSearch({ results: [], status: 'idle', query: '' })
    expect(idle.text()).not.toContain('Nothing found')
  })
})
