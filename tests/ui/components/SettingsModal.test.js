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
  panelOpacity: 0.9,
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

  it('marks the active world shape on the segmented control', () => {
    const wrapper = mountSettings({ worldShape: 'flat' })
    const checked = [...document.querySelectorAll('[role="radio"]')].filter(
      (button) => button.getAttribute('aria-checked') === 'true',
    )

    expect(checked).toHaveLength(1)
    expect(checked[0].textContent).toContain('Flat')
    wrapper.unmount()
  })

  it('asks the owner to change a preference rather than mutating it', async () => {
    const wrapper = mountSettings()
    const flat = [...document.querySelectorAll('[role="radio"]')].find((button) =>
      button.textContent.includes('Flat'),
    )

    flat.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('update:preferences')?.at(-1)).toEqual([{ worldShape: 'flat' }])
    wrapper.unmount()
  })

  it('toggles a map layer', async () => {
    const wrapper = mountSettings()
    const checkbox = document.querySelectorAll('input[type="checkbox"]')[1]

    checkbox.checked = false
    checkbox.dispatchEvent(new Event('change', { bubbles: true }))
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('update:preferences')?.at(-1)).toEqual([{ showPortals: false }])
    wrapper.unmount()
  })

  it('uses drawn icons rather than emoji for its controls', () => {
    // The emoji that remain live in the info content, which is rewritten
    // later; nothing that acts as an affordance should still be one.
    const wrapper = mountSettings()
    const controls = document.querySelector('.settings__segmented')

    expect(controls.querySelectorAll('svg')).toHaveLength(2)
    expect(controls.textContent).not.toMatch(/\p{Extended_Pictographic}/u)
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
