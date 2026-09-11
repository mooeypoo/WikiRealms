import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import ShareMenu from '../../../src/ui/components/ShareMenu.vue'
import { resetOverlays } from '../../../src/ui/design/useOverlays.js'

function mountShare(props = {}) {
  return mount(ShareMenu, {
    props: {
      show: true,
      realmTitle: 'Saturn',
      canShareTrail: true,
      trailLength: 3,
      ...props,
    },
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
  document.body.innerHTML = ''
})

describe('ShareMenu', () => {
  it('names both share intents in one place', () => {
    const wrapper = mountShare()
    const text = document.querySelector('.share__list').textContent

    expect(text).toContain('Share this realm')
    expect(text).toContain('Share my trail')
    expect(text).toContain('postcard')
    wrapper.unmount()
  })

  it('asks its owner to share a realm or a trail', async () => {
    const wrapper = mountShare()
    const buttons = [...document.querySelectorAll('.share__list button')]

    buttons[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    buttons[1].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('share-realm')).toHaveLength(1)
    expect(wrapper.emitted('share-trail')).toHaveLength(1)
    wrapper.unmount()
  })

  it('disables trail share when there is nothing underfoot', () => {
    const wrapper = mountShare({ canShareTrail: false, trailLength: 0 })
    const trail = [...document.querySelectorAll('.share__list button')].at(1)

    expect(trail.disabled).toBe(true)
    wrapper.unmount()
  })
})
