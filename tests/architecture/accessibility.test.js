import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/adapters/wikipediaSearchAdapter.js', () => ({
  searchWikipediaTitles: vi.fn(() => Promise.resolve([])),
}))
vi.mock('../../src/adapters/wikipediaArticleAdapter.js', () => ({ fetchWikipediaArticle: vi.fn() }))
vi.mock('../../src/adapters/snapshotStorage.js', () => ({
  saveSnapshotToStorage: vi.fn(),
  loadSnapshotFromStorage: vi.fn(() => null),
  clearSnapshotFromStorage: vi.fn(),
}))

import { fetchWikipediaArticle } from '../../src/adapters/wikipediaArticleAdapter.js'
import { resetKeymap } from '../../src/ui/design/useKeymap.js'
import { resetOverlays } from '../../src/ui/design/useOverlays.js'
import App from '../../src/App.vue'

enableAutoUnmount(afterEach)

const ARTICLE = {
  articleId: 'en:1',
  title: 'Saturn',
  url: 'https://en.wikipedia.org/wiki/Saturn',
  summary: 'The sixth planet from the Sun.',
  latestRevisionId: 1,
  categories: [],
  links: ['Titan'],
  images: [],
  sections: {
    lead: { ownSize: 10, links: ['Titan'] },
    totalSize: 500,
    citationCount: 3,
    sections: [{ title: 'Rings', anchor: 'Rings', ownSize: 500, subtreeSize: 500, children: [] }],
  },
}

beforeEach(() => {
  document.body.innerHTML = ''
  localStorage.clear()
  history.replaceState(null, '', '/')
  fetchWikipediaArticle.mockResolvedValue(ARTICLE)
})

afterEach(() => {
  resetOverlays()
  resetKeymap()
  history.replaceState(null, '', '/')
})

async function inAWorld() {
  history.replaceState(null, '', '?realm=Saturn')
  const wrapper = mount(App, { attachTo: document.body })
  await flushPromises()
  return wrapper
}

const accessibleName = (element) =>
  element.getAttribute('aria-label') || element.textContent.trim() || element.getAttribute('title') || ''

/**
 * The sweep, run against the whole app rather than component by component.
 *
 * Two of these exist because of things found by USING the app rather than
 * by testing it: a Ledger that closed to nothing, and a legend reachable
 * only by a keyboard shortcut. Both worked perfectly and could not be
 * found, which is the one question a component test never asks.
 */
describe('accessibility', () => {
  it('gives every control a name', async () => {
    await inAWorld()

    const unnamed = [...document.querySelectorAll('button, a[href]')].filter(
      (element) => accessibleName(element) === '',
    )

    expect(unnamed.map((element) => element.className)).toEqual([])
  })

  it('answers "what is this page" exactly once', async () => {
    const wrapper = await inAWorld()
    expect(document.querySelectorAll('h1')).toHaveLength(1)

    // The launch screen summoned over a world is a dialog inside the page,
    // not a second page.
    await wrapper.find('[aria-label="Opening screen"]').trigger('click')
    expect(document.querySelectorAll('h1')).toHaveLength(1)
  })

  it('has an h1 even before a realm is chosen', async () => {
    mount(App, { attachTo: document.body })
    await flushPromises()

    expect(document.querySelectorAll('h1')).toHaveLength(1)
  })

  it('says out loud that a world has arrived', async () => {
    // A spinner says nothing to a screen reader, and the interesting event
    // is the arrival rather than the wait.
    await inAWorld()

    const live = document.querySelector('[role="status"][aria-live="polite"]')
    expect(live).not.toBeNull()
    expect(live.textContent).toContain('Arrived in Saturn')
  })

  it('interrupts for a failure rather than waiting to be noticed', async () => {
    fetchWikipediaArticle.mockRejectedValue(new Error('Wikipedia is unreachable'))
    await inAWorld()

    const alert = document.querySelector('[role="alert"]')
    expect(alert).not.toBeNull()
    expect(alert.textContent).toContain('Wikipedia is unreachable')
  })

  it('gives every summonable surface a visible way in', async () => {
    // The rule from §4.2, tested. The legend shipped reachable only by `L`,
    // which is how it went unfound — and it was the second control to do
    // that, after the Ledger's collapse-to-nothing.
    const wrapper = await inAWorld()

    for (const label of [
      'Search realms',
      'Journey',
      'About WikiRealms',
      'Settings',
      'What am I looking at?',
      'Opening screen',
    ]) {
      expect(wrapper.find(`[aria-label="${label}"]`).exists(), `${label} has no visible control`).toBe(true)
    }
  })

  it('never marks a control with a glyph that means something else', async () => {
    // "?" opens About. An icon that looks like it and does not is a trap,
    // which is exactly what the legend's first icon was.
    await inAWorld()

    const legend = document.querySelector('[aria-label="What am I looking at?"]')
    expect(legend.textContent.trim()).toBe('')
    expect(legend.innerHTML).not.toContain('?')
  })

  it('keeps chrome free of emoji, whatever the content does', async () => {
    // Emoji cannot take currentColor, share no optical grid, and render
    // differently per platform. Content may use them; controls may not.
    const wrapper = await inAWorld()

    for (const element of [...document.querySelectorAll('button, [role="radio"], [role="tab"]')]) {
      expect(element.textContent, element.className).not.toMatch(/\p{Extended_Pictographic}/u)
    }
    expect(wrapper.find('.scrim').text()).not.toMatch(/\p{Extended_Pictographic}/u)
  })
})
