import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
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

/**
 * Two controls sharing one corner, on the only screen where they do.
 */
describe('the phone bottom-right', () => {
  function phone() {
    window.innerWidth = 390
    window.innerHeight = 844
    window.dispatchEvent(new Event('resize'))
  }

  function desktop() {
    window.innerWidth = 1280
    window.innerHeight = 900
    window.dispatchEvent(new Event('resize'))
  }

  it('lifts the helm clear of a minimised sheet rather than hiding behind it', async () => {
    phone()
    localStorage.setItem('wikirealms:preferences', JSON.stringify({ ledgerState: 'peek' }))
    const wrapper = await inAWorld()

    const helm = wrapper.find('.helm')
    expect(helm.exists()).toBe(true)
    expect(helm.attributes('style')).toContain('--helm-lift')
    expect(helm.attributes('style')).not.toContain('--helm-lift: 0px')
  })

  it('stands the helm down once the sheet is most of the screen', async () => {
    phone()
    localStorage.setItem('wikirealms:preferences', JSON.stringify({ ledgerState: 'full' }))
    const wrapper = await inAWorld()

    expect(wrapper.find('.helm').exists()).toBe(false)
  })

  it('never lifts on a desktop, where they are on opposite sides', async () => {
    desktop()
    localStorage.setItem('wikirealms:preferences', JSON.stringify({ ledgerState: 'full' }))
    const wrapper = await inAWorld()

    expect(wrapper.find('.helm').exists()).toBe(true)
    expect(wrapper.find('.helm').attributes('style')).toContain('--helm-lift: 0px')
  })
})

describe('the phone top bar', () => {
  it('collapses its utilities into one control, reachable as a menu', async () => {
    // Four 48px targets plus a realm name plus the trail chevron do not
    // fit across a phone, and shrinking them below 48 is the wrong give.
    const wrapper = await inAWorld()

    expect(wrapper.find('[aria-label="Tools"]').exists()).toBe(true)

    await wrapper.find('[aria-label="Tools"]').trigger('click')
    const menu = document.querySelector('.tools__list')

    expect(menu).not.toBeNull()
    for (const label of ['Search realms', 'Journey', 'About WikiRealms', 'Settings']) {
      expect(menu.textContent).toContain(label)
    }
  })

  it('keeps identity and the trail on the bar itself', async () => {
    const wrapper = await inAWorld()

    expect(wrapper.find('[aria-label="Opening screen"]').exists()).toBe(true)
    expect(wrapper.find('h1').text()).toBe('Saturn')
  })

  it('closes itself on the way to what was chosen', async () => {
    // A menu is a way to the tools, not a place to be.
    const wrapper = await inAWorld()
    await wrapper.find('[aria-label="Tools"]').trigger('click')

    const settings = [...document.querySelectorAll('.tools__list button')].find((button) =>
      button.textContent.includes('Settings'),
    )
    settings.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(document.querySelector('.tools__list')).toBeNull()
    expect(document.querySelector('.settings__title')).not.toBeNull()
  })
})

describe('no emoji anywhere in the interface', () => {
  const PICTOGRAPHIC = /\p{Extended_Pictographic}/u

  it('carries none in any rendered chrome', async () => {
    // They cannot take currentColor, share no optical grid, and render
    // differently on every platform. This was the loudest reason the first
    // pass read as unfinished, and it took the whole overhaul to finish
    // removing them.
    const wrapper = await inAWorld()

    expect(wrapper.text()).not.toMatch(PICTOGRAPHIC)
    expect(document.body.textContent).not.toMatch(PICTOGRAPHIC)
  })

  it('carries none in the guide, whichever tab is open', async () => {
    const wrapper = await inAWorld()
    await wrapper.find('[aria-label="About WikiRealms"]').trigger('click')

    for (const tab of document.querySelectorAll('[role="tab"]')) {
      tab.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flushPromises()
      expect(document.querySelector('.sheet').textContent).not.toMatch(PICTOGRAPHIC)
    }
  })

  it('draws the in-world portal marker rather than typing it', () => {
    // The last one: an emoji painted to a canvas texture, in the place a
    // viewer looks most, unable to take the accent colour every other
    // control uses.
    const source = readFileSync(resolve(process.cwd(), 'src/ui/components/WorldView3D.vue'), 'utf8')

    expect(source).not.toMatch(PICTOGRAPHIC)
    expect(source).toContain('ringRatio')
  })
})
