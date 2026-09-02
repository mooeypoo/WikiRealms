import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import SectionTooltip from '../../../src/ui/components/SectionTooltip.vue'

function makeModel(overrides = {}) {
  return {
    title: 'Scientific career',
    subsectionCount: 3,
    wordsLabel: '1,240 words',
    densityBucket: 'moderate',
    ...overrides,
  }
}

describe('SectionTooltip', () => {
  it('renders nothing when not visible', () => {
    const wrapper = mount(SectionTooltip, { props: { model: makeModel(), visible: false, screenX: 0, screenY: 0 } })
    expect(wrapper.find('.section-tooltip').exists()).toBe(false)
  })

  it('renders nothing when the model is null', () => {
    const wrapper = mount(SectionTooltip, { props: { model: null, visible: true, screenX: 0, screenY: 0 } })
    expect(wrapper.find('.section-tooltip').exists()).toBe(false)
  })

  it('shows the section title and every meta chip when visible', () => {
    const wrapper = mount(SectionTooltip, {
      props: { model: makeModel(), visible: true, screenX: 100, screenY: 200 },
    })

    expect(wrapper.find('.section-tooltip__title').text()).toBe('Scientific career')
    const chipTexts = wrapper.findAll('.section-tooltip__chip').map((c) => c.text())
    expect(chipTexts.some((t) => t.includes('3 subsections'))).toBe(true)
    expect(chipTexts.some((t) => t.includes('1,240 words'))).toBe(true)
    expect(chipTexts.some((t) => t.includes('moderate'))).toBe(true)
  })

  it('pluralizes the subsection chip', () => {
    const one = mount(SectionTooltip, {
      props: { model: makeModel({ subsectionCount: 1 }), visible: true, screenX: 0, screenY: 0 },
    })
    expect(one.text()).toContain('1 subsection')
    expect(one.text()).not.toContain('1 subsections')
  })

  it('hides the subsection chip entirely when count is zero', () => {
    const wrapper = mount(SectionTooltip, {
      props: { model: makeModel({ subsectionCount: 0 }), visible: true, screenX: 0, screenY: 0 },
    })
    const chipTexts = wrapper.findAll('.section-tooltip__chip').map((c) => c.text())
    expect(chipTexts.some((t) => t.includes('subsection'))).toBe(false)
  })

  it('translates by the given screenX/screenY', () => {
    const wrapper = mount(SectionTooltip, {
      props: { model: makeModel(), visible: true, screenX: 123, screenY: 456 },
    })
    const style = wrapper.find('.section-tooltip').attributes('style') ?? ''
    expect(style).toContain('translate(123px, 456px)')
  })

  it('applies the density bucket class to the color dot', () => {
    const wrapper = mount(SectionTooltip, {
      props: { model: makeModel({ densityBucket: 'lush' }), visible: true, screenX: 0, screenY: 0 },
    })
    expect(wrapper.find('.section-tooltip__dot--lush').exists()).toBe(true)
  })
})
