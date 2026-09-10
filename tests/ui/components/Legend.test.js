import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import Legend from '../../../src/ui/components/Legend.vue'
import { ALTITUDE, PORTAL_LIMITS } from '../../../src/engine/generation/config.js'
import { BIOME } from '../../../src/engine/generation/terrain.js'
import { biomeColor } from '../../../src/ui/rendering/biomeColor.js'
import { resetKeymap } from '../../../src/ui/design/useKeymap.js'
import { resetOverlays, useOverlays } from '../../../src/ui/design/useOverlays.js'

enableAutoUnmount(afterEach)

afterEach(() => {
  resetOverlays()
  resetKeymap()
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

    expect(swatches).toHaveLength(6)
    expect(swatches[0].getAttribute('style')).toContain(biomeColor(BIOME.DUNES, 0.6))
    expect(swatches.at(-1).getAttribute('style')).toContain(biomeColor(BIOME.JUNGLE, 0.6))
  })

  it('names the bands as an ordered scale and explains each one', () => {
    // The bands are relative by construction. The legend used to state
    // them as absolute percentages the engine never computed, and then as
    // clauses ("cited far better than the rest") that read as prose
    // rather than as a key.
    mountLegend()
    const text = document.querySelector('.legend__ground').textContent

    expect(text).toContain('Barren')
    expect(text).toContain('Lush')
    expect(text).toContain('average')
    // Still no percentages: the scalar behind the bands is not one.
    expect(text).not.toMatch(/\d+%/)
  })

  it('says that a poorly sourced article stays dry throughout', () => {
    // Without this the relative bands overclaim: a stub's best section
    // would read as if it were well sourced.
    mountLegend()

    expect(document.querySelector('.legend__note').textContent).toContain('stays dry')
  })

  it('never renders a NaN where an engine number should be', () => {
    // This is not hypothetical. When rock and snow stopped being
    // thresholds, this entry kept interpolating the deleted constants and
    // rendered "Push past NaN% of the world's height" — and the test
    // above passed, because it asserted the text contained the same NaN
    // it was building.
    mountLegend()

    expect(document.querySelector('.legend__key').textContent).not.toContain('NaN')
    expect(document.querySelector('.legend__key').textContent).not.toContain('undefined')
  })

  it('says what causes the height, not just what sits on it', () => {
    // "Snow is altitude" names the cause of the snow without saying what
    // causes the altitude — a fact about a fictional mountain rather than
    // something about the reader's article.
    mountLegend()
    const text = document.querySelector('.legend__features').textContent

    expect(text).toContain('how much was written')
    expect(text).toContain(`${Math.round(ALTITUDE.rockStart * 100)}%`)
    expect(text).toContain(`${Math.round(ALTITUDE.snowStart * 100)}%`)
    // Says that altitude tints rather than replaces, which is the whole
    // difference from the thresholds it used to describe.
    expect(text).toContain('mossy')
  })

  it('says portals are a selection, not every link', () => {
    // A long article has hundreds of links and a world carrying hundreds of
    // markers is a world you cannot see. Saying "a portal is a link"
    // without "some of them" overclaims.
    mountLegend()

    expect(document.querySelector('.legend__features').textContent).toContain(
      `Up to ${PORTAL_LIMITS.maxPortals}`,
    )
  })

  it('explains foliage as citation-driven growth', () => {
    mountLegend()
    const text = document.querySelector('.legend__features').textContent
    expect(text).toContain('Trees and grass')
    expect(text).toContain('treeline')
  })

  it('explains blobs as categories and pageviews', () => {
    mountLegend()
    const text = document.querySelector('.legend__features').textContent
    expect(text).toContain('Animals are the article')
    expect(text).toContain('pageviews')
    expect(text).toContain('categories')
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

  it('takes its turn in the overlay stack, so Escape reaches it', () => {
    // It is a summon; every other one is dismissed the same way.
    mountLegend()

    expect(useOverlays().isOpen('legend')).toBe(true)
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
