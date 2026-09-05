import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import TopScrim from '../../../src/ui/components/TopScrim.vue'

enableAutoUnmount(afterEach)

function mountScrim(props = {}) {
  return mount(TopScrim, { props: { realm: 'Cassini Division', trailLength: 3, ...props } })
}

describe('TopScrim', () => {
  it('names where you are', () => {
    expect(mountScrim().find('h1').text()).toBe('Cassini Division')
  })

  it('shows only identity and tools before a realm is chosen', () => {
    const wrapper = mountScrim({ realm: null, trailLength: 0 })

    expect(wrapper.find('h1').exists()).toBe(false)
    expect(wrapper.find('[aria-label="Search realms"]').exists()).toBe(true)
    expect(wrapper.find('[aria-label="Settings"]').exists()).toBe(true)
  })

  it('offers the trail only once there is more than one stop on it', () => {
    expect(mountScrim({ trailLength: 1 }).find('.scrim__trail').exists()).toBe(false)
    expect(mountScrim({ trailLength: 2 }).find('.scrim__trail').exists()).toBe(true)
  })

  it('disables travel it cannot do', () => {
    const wrapper = mountScrim({ canGoBack: false, canGoForward: true })

    expect(wrapper.find('[aria-label="Back"]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[aria-label="Forward"]').attributes('disabled')).toBeUndefined()
  })

  it('emits rather than acting, for every control it has', async () => {
    const wrapper = mountScrim({ canGoBack: true, canGoForward: true })

    for (const [label, event] of [
      ['Opening screen', 'home'],
      ['Back', 'back'],
      ['Forward', 'forward'],
      ['Search realms', 'search'],
      ['Journey', 'journey'],
      ['About WikiRealms', 'guide'],
      ['Settings', 'settings'],
    ]) {
      await wrapper.find(`[aria-label="${label}"]`).trigger('click')
      expect(wrapper.emitted(event), `${label} should emit ${event}`).toHaveLength(1)
    }

    await wrapper.find('.scrim__trail').trigger('click')
    expect(wrapper.emitted('trail')).toHaveLength(1)
  })

  it('carries no view control — that belongs beside the world', () => {
    // The old taskbar had a 2D/3D button here, which is what made "Flat"
    // mean two different things. Changing the world is the helm's job.
    const wrapper = mountScrim()

    expect(wrapper.text()).not.toMatch(/planet|flat|2d|3d/i)
  })

  it('uses drawn icons throughout, and labels every one of them', () => {
    const wrapper = mountScrim()

    expect(wrapper.text()).not.toMatch(/\p{Extended_Pictographic}/u)
    for (const button of wrapper.findAll('button')) {
      expect(button.attributes('aria-label') || button.text()).toBeTruthy()
    }
  })
})
