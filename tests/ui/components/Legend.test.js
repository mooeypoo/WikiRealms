import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import Legend from '../../../src/ui/components/Legend.vue'
import { BIOME_THRESHOLDS, CITATION_LUSHNESS } from '../../../src/engine/generation/config.js'
import { BIOME } from '../../../src/engine/generation/terrain.js'
import { biomeColor } from '../../../src/ui/rendering/biomeColor.js'

enableAutoUnmount(afterEach)

afterEach(() => {
  document.body.innerHTML = ''
})

function mountLegend(props = {}) {
  return mount(Legend, { props: { show: true, ...props }, attachTo: document.body })
}

describe('Legend', () => {
  it('dims the world rather than covering it', () => {
    // The question is about the thing on screen; answering it in a dialog
    // that hides the thing answers it badly.
    mountLegend()

    expect(document.querySelector('.legend')).not.toBeNull()
    expect(document.querySelector('.legend__key')).not.toBeNull()
  })

  it('shows nothing when closed', () => {
    mountLegend({ show: false })

    expect(document.querySelector('.legend')).toBeNull()
  })

  it('takes its colours from the renderer, not from a copy of them', () => {
    // A legend that has drifted from the generator is worse than none.
    mountLegend()
    const swatches = [...document.querySelectorAll('.legend__ground .legend__swatch')]

    expect(swatches).toHaveLength(5)
    expect(swatches[0].getAttribute('style')).toContain(biomeColor(BIOME.DESERT, 0.6))
  })

  it('takes its thresholds from the engine too', () => {
    mountLegend()
    const text = document.querySelector('.legend__ground').textContent

    expect(text).toContain(`${Math.round(CITATION_LUSHNESS.desertThreshold * 100)}%`)
    expect(text).toContain(`${Math.round(CITATION_LUSHNESS.woodlandThreshold * 100)}%`)
  })

  it('says what causes the height, not just what sits on it', () => {
    // "Snow is altitude" names the cause of the snow without saying what
    // causes the altitude — a fact about a fictional mountain rather than
    // something about the reader's article.
    mountLegend()
    const text = document.querySelector('.legend__features').textContent

    expect(text).toContain('how much was written')
    expect(text).toContain(`${Math.round(BIOME_THRESHOLDS.mountainMinHeight * 100)}%`)
    expect(text).toContain(`${Math.round(BIOME_THRESHOLDS.snowMinHeight * 100)}%`)
  })

  it('points at features that are actually on screen', () => {
    mountLegend({
      anchors: {
        range: { x: 400, y: 300, label: 'Structure is a section' },
        portal: { x: 700, y: 500 },
      },
    })

    const pins = [...document.querySelectorAll('.legend__pin')]
    expect(pins).toHaveLength(2)
    expect(pins[0].textContent).toContain('Structure is a section')
    expect(document.querySelectorAll('.legend__leaders line')).toHaveLength(2)
  })

  it('explains an unpointable feature in the key instead', () => {
    // Nothing is anchored, so everything falls back — and the colour
    // semantics could never be pointed at anyway, being everywhere at once.
    mountLegend()

    expect(document.querySelectorAll('.legend__pin')).toHaveLength(0)
    expect(document.querySelector('.legend__features').children.length).toBeGreaterThan(0)
  })

  it('moves a feature out of the key once it can be pointed at', () => {
    const keyed = () => document.querySelector('.legend__features')?.textContent ?? ''

    mountLegend()
    expect(keyed()).toContain('portal')

    document.body.innerHTML = ''
    mountLegend({ anchors: { portal: { x: 100, y: 100 } } })
    expect(keyed()).not.toContain('A portal is an outbound link')
  })

  it('asks to be closed from the key and from the world', async () => {
    const wrapper = mountLegend()

    document.querySelector('.legend__head button').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('close')).toHaveLength(1)

    document.querySelector('.legend').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('close')).toHaveLength(2)
  })
})
