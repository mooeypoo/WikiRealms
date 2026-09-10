import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
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

  it('offers the trail as soon as there is a realm', () => {
    // It used to appear only from the second stop. The journey actions live
    // on that panel now, so a control that arrives late would strand Share
    // for anyone who had visited exactly one realm.
    expect(mountScrim({ trailLength: 1 }).find('.scrim__trail').exists()).toBe(true)
    expect(mountScrim({ realm: null, trailLength: 0 }).find('.scrim__trail').exists()).toBe(false)
  })

  it('names the trail rather than leaving the icon to be guessed', () => {
    const trail = mountScrim({ trailLength: 3 }).find('.scrim__trail')
    expect(trail.find('.scrim__trail-label').text()).toBe('Your trail')
    expect(trail.find('.scrim__trail-count').text()).toBe('3')
    // WCAG 2.5.3: the visible words sit inside the accessible name.
    expect(trail.attributes('aria-label').toLowerCase()).toContain('your trail')
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
      ['About WikiRealms', 'guide'],
      ['Settings', 'settings'],
    ]) {
      await wrapper.find(`[aria-label="${label}"]`).trigger('click')
      expect(wrapper.emitted(event), `${label} should emit ${event}`).toHaveLength(1)
    }

    await wrapper.find('.scrim__trail').trigger('click')
    expect(wrapper.emitted('trail')).toHaveLength(1)
  })

  it('names its tools rather than leaving the icon to be guessed', () => {
    // There is room for a word on a desktop, and below md these four
    // collapse into a menu that has room for one anyway.
    const wrapper = mountScrim()
    const labels = wrapper.findAll('.scrim__label').map((label) => label.text())

    // Journey is absent on purpose: those actions live on the trail panel,
    // which is the journey, rather than spending a primary control on
    // end-of-session actions.
    expect(labels).toEqual(['Search', 'About', 'Settings'])
  })

  it('keeps each visible word inside its accessible name', () => {
    // WCAG 2.5.3: a viewer saying "click Search" must be able to reach the
    // control whose accessible name is "Search realms".
    for (const button of mountScrim().findAll('.scrim__tool')) {
      const visible = button.find('.scrim__label').text()
      expect(button.attributes('aria-label')).toContain(visible)
    }
  })

  it('hides the overflow control behind the buttons it replaces', () => {
    // Both are single-class selectors, so ordering decides: the hide rule
    // sat before .scrim__button and lost, and the ⋯ showed at every width
    // beside the very controls it exists to stand in for.
    const styles = readFileSync(resolve(process.cwd(), 'src/ui/components/TopScrim.vue'), 'utf8')
    const hideAt = styles.indexOf('.scrim__more {')
    const buttonAt = styles.indexOf('.scrim__button {')

    expect(hideAt).toBeGreaterThan(buttonAt)
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
