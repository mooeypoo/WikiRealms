import { h } from 'vue'
import Launch from '../../../src/ui/components/Launch.vue'
import SearchBar from '../../../src/ui/components/SearchBar.vue'

/**
 * The first thing anyone sees, and the only place search is the hero.
 *
 * Worth checking at `xs`, where the realm grid collapses to one column and
 * the panel has to scroll, and at `short`, where there is barely any height
 * for a pitch at all.
 */
export default {
  title: 'Instruments/Launch',
  component: Launch,
  parameters: { layout: 'fullscreen' },
}

const asStory = (build) => () => ({ setup: () => build })

export const FirstVisit = { render: asStory(() => h(Launch)) }

/** The field on its own, at both sizes and in each state. */
export const SearchStates = {
  render: asStory(() =>
    h('div', { style: { display: 'grid', gap: 'var(--spacing-xl)', padding: 'var(--spacing-xl)' } }, [
      h(SearchBar, { size: 'lg', query: '', placeholder: 'Name a realm…' }),
      h(SearchBar, { query: 'satur', status: 'loading' }),
      h(SearchBar, {
        query: 'saturn',
        status: 'success',
        results: [
          { title: 'Saturn', description: 'Sixth planet from the Sun' },
          { title: 'Rings of Saturn', description: 'Planetary ring system' },
          { title: 'Saturn V', description: 'American super heavy-lift launch vehicle' },
        ],
      }),
      h(SearchBar, { query: 'qqqq', status: 'success', results: [] }),
      h(SearchBar, { query: 'saturn', status: 'error', errorMessage: 'Could not reach Wikipedia' }),
    ]),
  ),
}
