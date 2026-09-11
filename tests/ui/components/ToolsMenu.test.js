import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import ToolsMenu from '../../../src/ui/components/ToolsMenu.vue'
import { resetOverlays } from '../../../src/ui/design/useOverlays.js'

function mountTools(props = {}) {
  return mount(ToolsMenu, {
    props: { show: true, canShare: true, ...props },
    attachTo: document.body,
  })
}

beforeEach(() => {
  document.body.innerHTML = ''
  window.innerWidth = 390
  window.innerHeight = 844
  window.dispatchEvent(new Event('resize'))
})

afterEach(() => {
  resetOverlays()
  document.body.innerHTML = ''
})

describe('ToolsMenu', () => {
  it('lists Share beside the other phone utilities', () => {
    const wrapper = mountTools()
    const text = document.querySelector('.tools__list').textContent

    expect(text).toContain('Share')
    expect(text).toContain('Search realms')
    expect(text).toContain('About WikiRealms')
    expect(text).toContain('Settings')
    wrapper.unmount()
  })

  it('asks its owner to open the share menu', async () => {
    const wrapper = mountTools()
    const share = [...document.querySelectorAll('.tools__list button')].find((button) =>
      button.textContent.includes('Share'),
    )

    share.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('share')).toHaveLength(1)
    wrapper.unmount()
  })

  it('disables Share when there is no realm underfoot', () => {
    const wrapper = mountTools({ canShare: false })
    const share = [...document.querySelectorAll('.tools__list button')].find((button) =>
      button.textContent.includes('Share'),
    )

    expect(share.disabled).toBe(true)
    expect(share.textContent).toContain('Open a realm first')
    wrapper.unmount()
  })
})
