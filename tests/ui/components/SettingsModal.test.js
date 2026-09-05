import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import SettingsModal from '../../../src/ui/components/SettingsModal.vue'
import { resetKeymap } from '../../../src/ui/design/useKeymap.js'
import { resetOverlays, useOverlays } from '../../../src/ui/design/useOverlays.js'

const PREFERENCES = {
  worldShape: 'sphere',
  showSections: true,
  showPortals: true,
  showFoliage: true,
  chrome: 'translucent',
  rendering: 'auto',
  travelAnimation: true,
}

function mountSettings(preferences = {}) {
  return mount(SettingsModal, {
    props: { show: true, preferences: { ...PREFERENCES, ...preferences } },
    attachTo: document.body,
  })
}

beforeEach(() => {
  document.body.innerHTML = ''
  window.innerWidth = 1280
  window.innerHeight = 900
  window.dispatchEvent(new Event('resize'))
})

afterEach(() => {
  resetOverlays()
  resetKeymap()
  document.body.innerHTML = ''
})

describe('SettingsModal', () => {
  it('presents itself through the shared surface primitive', () => {
    const wrapper = mountSettings()

    expect(document.querySelector('.sheet')).not.toBeNull()
    expect(useOverlays().isOpen('settings')).toBe(true)
    wrapper.unmount()
  })

  it('no longer offers world shape — that is the helm\'s, and having both was the confusion', () => {
    const wrapper = mountSettings()

    expect(document.body.textContent).not.toContain('World shape')
    wrapper.unmount()
  })

  it('marks the active rendering quality', () => {
    const wrapper = mountSettings({ rendering: 'low' })
    const group = document.querySelector('[aria-label="Rendering quality"]')
    const checked = [...group.querySelectorAll('[role="radio"]')].filter(
      (button) => button.getAttribute('aria-checked') === 'true',
    )

    expect(checked).toHaveLength(1)
    expect(checked[0].textContent).toContain('Low')
    wrapper.unmount()
  })

  it('asks the owner to change a preference rather than mutating it', async () => {
    const wrapper = mountSettings()
    const high = [...document.querySelectorAll('[aria-label="Rendering quality"] [role="radio"]')].find(
      (button) => button.textContent.includes('High'),
    )

    high.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('update:preferences')?.at(-1)).toEqual([{ rendering: 'high' }])
    wrapper.unmount()
  })

  it('offers panel presence as three named choices, not an opacity slider', async () => {
    // The slider applied opacity to the element, so it dimmed text with the
    // panel, and it went down to 0.5 — a viewer could walk their own
    // interface below legibility.
    const wrapper = mountSettings()

    expect(document.querySelector('input[type="range"]')).toBeNull()
    const presence = [...document.querySelectorAll('[role="radio"]')].filter((button) =>
      ['Solid', 'Translucent', 'Minimal'].includes(button.textContent.trim()),
    )
    expect(presence).toHaveLength(3)
    wrapper.unmount()
  })

  it('lets the travel animation be turned off outright', async () => {
    // Not everyone wants a camera dive every time they take a portal, and
    // some people cannot comfortably watch one.
    const wrapper = mountSettings()
    const checkbox = document.querySelectorAll('input[type="checkbox"]')[0]

    checkbox.checked = false
    checkbox.dispatchEvent(new Event('change', { bubbles: true }))
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('update:preferences')?.at(-1)).toEqual([{ travelAnimation: false }])
    wrapper.unmount()
  })

  it('toggles a map layer', async () => {
    const wrapper = mountSettings()
    const checkbox = document.querySelectorAll('input[type="checkbox"]')[2]

    checkbox.checked = false
    checkbox.dispatchEvent(new Event('change', { bubbles: true }))
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('update:preferences')?.at(-1)).toEqual([{ showPortals: false }])
    wrapper.unmount()
  })

  it('uses no emoji as affordances', () => {
    // The emoji that remain live in the info content, which is rewritten
    // later; nothing that acts as a control should still be one.
    const wrapper = mountSettings()

    expect(document.querySelector('.sheet').textContent).not.toMatch(/\p{Extended_Pictographic}/u)
    wrapper.unmount()
  })

  it('closes on Escape', () => {
    const wrapper = mountSettings()

    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    Object.defineProperty(event, 'target', { value: document.body })
    window.dispatchEvent(event)

    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })
})
