import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import Helm from '../../../src/ui/components/Helm.vue'

function mountHelm(props = {}) {
  return mount(Helm, { props: { worldShape: 'sphere', ...props } })
}

describe('Helm', () => {
  it('offers exactly two shapes, because there is one view axis', () => {
    // D1: Planet and Flat are two renderings of the same world. The 2D
    // canvas is not a third option here — it is a rendering fallback, and
    // having it presented as a peer is what made "Flat" mean two things.
    const wrapper = mountHelm()
    const shapes = wrapper.findAll('[role="radio"]')

    expect(shapes).toHaveLength(2)
    expect(shapes.map((shape) => shape.text())).toEqual(['Planet', 'Flat'])
  })

  it('marks the active shape for assistive technology, not just visually', () => {
    const wrapper = mountHelm({ worldShape: 'flat' })
    const checked = wrapper.findAll('[role="radio"]').filter((shape) => shape.attributes('aria-checked') === 'true')

    expect(checked).toHaveLength(1)
    expect(checked[0].text()).toBe('Flat')
  })

  it('asks its owner to change shape rather than holding the state', async () => {
    const wrapper = mountHelm()

    await wrapper.findAll('[role="radio"]')[1].trigger('click')

    expect(wrapper.emitted('update:worldShape')).toEqual([['flat']])
  })

  it('asks for a recentre', async () => {
    const wrapper = mountHelm()

    await wrapper.find('[aria-label="Recentre the view"]').trigger('click')

    expect(wrapper.emitted('recenter')).toHaveLength(1)
  })

  it('goes inert rather than disappearing while a world is loading', async () => {
    // Chrome that vanishes and returns is worse than chrome that waits: the
    // helm holds its place so nothing shifts under the pointer.
    const wrapper = mountHelm({ disabled: true })

    await wrapper.findAll('[role="radio"]')[1].trigger('click')
    await wrapper.find('[aria-label="Recentre the view"]').trigger('click')
    await wrapper.find('[aria-label="What am I looking at?"]').trigger('click')

    expect(wrapper.emitted('update:worldShape')).toBeUndefined()
    expect(wrapper.emitted('recenter')).toBeUndefined()
    expect(wrapper.emitted('legend')).toBeUndefined()
  })

  it('offers the legend, so it is not a keyboard secret', async () => {
    // Every other summoned surface has a control; this one had only `L`.
    // It sits here rather than in the scrim because it explains the WORLD,
    // which is what the rest of this cluster is about.
    const wrapper = mountHelm()

    await wrapper.find('[aria-label="What am I looking at?"]').trigger('click')

    expect(wrapper.emitted('legend')).toHaveLength(1)
  })

  it('hides recentring where there is no camera to recentre', () => {
    // The 2D fallback draws a fixed chart. A button that does nothing is
    // worse than no button, and the old UI was full of them.
    const wrapper = mountHelm({ canRecenter: false })

    expect(wrapper.find('[aria-label="Recentre the view"]').exists()).toBe(false)
    expect(wrapper.findAll('[role="radio"]')).toHaveLength(2)
    // The legend still applies: the flat canvas needs explaining too.
    expect(wrapper.find('[aria-label="What am I looking at?"]').exists()).toBe(true)
  })

  it('labels its controls with drawn icons and real text', () => {
    const wrapper = mountHelm()

    expect(wrapper.findAll('svg')).toHaveLength(4)
    expect(wrapper.text()).not.toMatch(/\p{Extended_Pictographic}/u)
  })
})
