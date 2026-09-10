import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import InfoHub from '../../../src/ui/components/InfoHub.vue'
import { resetKeymap } from '../../../src/ui/design/useKeymap.js'
import { resetOverlays, useOverlays } from '../../../src/ui/design/useOverlays.js'

function mountGuide(props = {}) {
  return mount(InfoHub, { props: { show: true, ...props }, attachTo: document.body })
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

describe('InfoHub', () => {
  it('presents itself through the shared surface primitive', () => {
    const wrapper = mountGuide()

    // Not its own bespoke overlay any more: dismissal, focus and stacking
    // all come from Sheet, so they match every other summoned surface.
    expect(document.querySelector('.sheet')).not.toBeNull()
    expect(useOverlays().isOpen('field-guide')).toBe(true)
    wrapper.unmount()
  })

  it('closes on Escape, which it never used to do consistently', () => {
    const wrapper = mountGuide()

    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    Object.defineProperty(event, 'target', { value: document.body })
    window.dispatchEvent(event)

    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })

  it('renders every tab and marks the current one', async () => {
    const wrapper = mountGuide({ currentTab: 'how-it-works' })
    const tabs = document.querySelectorAll('[role="tab"]')

    expect(tabs.length).toBeGreaterThan(1)
    const active = [...tabs].filter((tab) => tab.getAttribute('aria-selected') === 'true')
    expect(active).toHaveLength(1)
    expect(active[0].textContent).toContain('How it works')
    wrapper.unmount()
  })

  it('asks for a tab change rather than owning it', async () => {
    const wrapper = mountGuide()
    const tab = [...document.querySelectorAll('[role="tab"]')].at(-1)

    tab.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('update:currentTab')).toBeTruthy()
    wrapper.unmount()
  })

  it('credits Kenney Cube Pets on the About tab', () => {
    const wrapper = mountGuide({ currentTab: 'about' })
    const about = [...document.querySelectorAll('.guide__prose')].find((el) => el.textContent.includes('Credits'))
    expect(about?.textContent).toContain('Kenney')
    expect(about?.innerHTML).toContain('https://kenney.nl/assets/cube-pets')
    expect(about?.innerHTML).toContain('https://kenney.nl/assets/fantasy-town-kit')
    wrapper.unmount()
  })

  it('lists shortcuts from the registry rather than from a copy of them', async () => {
    // The hand-written list had already drifted: it advertised 1 and 3 for
    // a view toggle that no longer exists.
    const { registerBinding, resetKeymap } = await import('../../../src/ui/design/useKeymap.js')
    resetKeymap()
    registerBinding({ keys: 'z', run: () => {}, label: 'Do the thing', group: 'Testing' })

    const wrapper = mountGuide({ currentTab: 'shortcuts' })
    const list = document.querySelector('.guide__keys')

    expect(list.textContent).toContain('Do the thing')
    expect(list.textContent).toContain('Testing')
    expect(document.body.textContent).not.toContain('Switch 2D or 3D')
    wrapper.unmount()
  })

  it('renders the guide prose', () => {
    const wrapper = mountGuide({ currentTab: 'what-is-this' })

    expect(document.querySelector('.guide__prose').textContent).toContain('explorable landscape')
    wrapper.unmount()
  })
})
