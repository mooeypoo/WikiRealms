import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import TrailPostcard from '../../../src/ui/components/TrailPostcard.vue'
import { createVisitGraph, jump, visit } from '../../../src/core/traversal/visitGraph.js'
import { resetKeymap } from '../../../src/ui/design/useKeymap.js'
import { resetOverlays } from '../../../src/ui/design/useOverlays.js'

enableAutoUnmount(afterEach)

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

function journey() {
  return visit(visit(jump(createVisitGraph(), 'Saturn'), 'Titan'), 'Rings of Saturn')
}

describe('TrailPostcard', () => {
  it('renders the expedition art from the trail', () => {
    mount(TrailPostcard, {
      props: { show: true, graph: journey() },
      attachTo: document.body,
    })

    const svg = document.querySelector('.postcard__art')
    expect(svg).not.toBeNull()
    expect(svg.getAttribute('aria-label')).toContain('Rings of Saturn')
    expect(document.body.textContent).toContain('Your trail')
    expect(document.body.textContent).toContain('Saturn')
    expect(document.body.textContent).toContain('Titan')
    expect(document.body.textContent).toContain('Rings of Saturn')
    expect(document.body.textContent).toMatch(/3 realms/)
  })

  it('offers image and letter actions', () => {
    mount(TrailPostcard, {
      props: { show: true, graph: journey() },
      attachTo: document.body,
    })

    const actions = document.querySelector('.postcard__actions')
    for (const label of ['Copy image', 'Download', 'Copy letter', 'Share']) {
      expect(actions.textContent).toContain(label)
    }
  })

  it('says so when there is nothing to draw', () => {
    mount(TrailPostcard, {
      props: { show: true, graph: createVisitGraph() },
      attachTo: document.body,
    })

    expect(document.querySelector('.postcard__empty').textContent).toMatch(/Nowhere/)
    expect(document.querySelector('.postcard__art')).toBeNull()
  })
})
