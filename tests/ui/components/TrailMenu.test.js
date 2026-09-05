import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import TrailMenu from '../../../src/ui/components/TrailMenu.vue'
import { createVisitGraph, goBack, jump, realmId, visit } from '../../../src/core/traversal/visitGraph.js'
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

/** The journey that disproved the tree. */
function looped() {
  let journey = jump(createVisitGraph(), 'Spacetime diagram')
  journey = visit(journey, 'Spacetime')
  journey = visit(journey, 'Template talk: Spacetime')
  journey = visit(journey, 'Physics')
  return visit(journey, 'Spacetime')
}

function mountTrail(graph = looped()) {
  return mount(TrailMenu, { props: { show: true, graph, canShare: true }, attachTo: document.body })
}

const names = () => [...document.querySelectorAll('.trail__name')].map((name) => name.textContent.trim())
const boxes = () => [...document.querySelectorAll('.trail__node')]

describe('TrailMenu', () => {
  it('draws one node per realm, however many times it was reached', () => {
    // The whole reason the model changed: two arrivals at Spacetime generate
    // the byte-identical world, so they are one place.
    mountTrail()

    expect(boxes()).toHaveLength(4)
    expect(names().filter((title) => title === 'Spacetime')).toHaveLength(1)
  })

  it('draws an edge for every portal actually taken', () => {
    mountTrail()

    expect(document.querySelectorAll('.trail__links path')).toHaveLength(4)
  })

  it('says HOW MANY routes lead to a realm, rather than just that some do', () => {
    // A border can only say "several". Two ways in and five ways in are
    // different facts, and nobody can read 1.5px against 2px anyway.
    mountTrail()
    const badges = [...document.querySelectorAll('.trail__badge text')]

    expect(badges).toHaveLength(1)
    expect(badges[0].textContent.trim()).toBe('2')
    expect(document.body.textContent).toContain('2 ways in')
  })

  it('distinguishes where you are by fill, not by stroke width', () => {
    mountTrail()

    expect(document.querySelectorAll('.trail__node.is-current')).toHaveLength(1)
  })

  it('says what its marks mean', () => {
    // The panel encoded two things visually and explained neither, which is
    // the failing the world's legend exists to fix.
    mountTrail()
    const key = document.querySelector('.trail__key')

    expect(key.textContent).toContain('where you are')
    expect(key.textContent).toContain('more than one way in')
  })

  it('draws a loop closing differently from a step forward', () => {
    // A straight line between distant rows reads as a mistake; a bowed,
    // dashed one reads as a return.
    mountTrail()

    expect(document.querySelectorAll('.trail__links path.is-return')).toHaveLength(1)
  })

  it('says where the viewer is standing, in the map and in the list', () => {
    mountTrail()

    expect(document.querySelectorAll('.trail__node.is-current')).toHaveLength(1)
    const current = [...document.querySelectorAll('.trail__stop')].filter(
      (stop) => stop.getAttribute('aria-current') === 'true',
    )
    expect(current).toHaveLength(1)
    expect(current[0].textContent).toContain('Spacetime')
  })

  it('is navigable without a pointer', () => {
    // The list is not a fallback for the drawing — it is how a keyboard and
    // a screen reader read the same map.
    mountTrail()

    expect(document.querySelectorAll('.trail__stop')).toHaveLength(4)
    for (const stop of document.querySelectorAll('.trail__stop')) {
      expect(stop.tagName).toBe('BUTTON')
      expect(stop.textContent.trim()).not.toBe('')
    }
  })

  it('keeps the full title reachable wherever the drawing truncates one', () => {
    mountTrail()
    const truncated = [...document.querySelectorAll('.trail__node text')].filter((text) =>
      text.textContent.includes('…'),
    )

    expect(truncated.length).toBeGreaterThan(0)
    for (const label of truncated) {
      const full = label.querySelector('title').textContent
      expect(full).not.toContain('…')
      // And the same title in full, in the list a reader can actually use.
      expect(names()).toContain(full)
    }
  })

  it('travels from the drawing as well as from the list', async () => {
    const wrapper = mountTrail()

    boxes()[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('select')[0][0]).toBe(realmId('Spacetime diagram'))
  })

  it('keeps the drawing out of the accessibility tree', () => {
    // The list below is the same map in a form a screen reader can walk.
    // Exposing both would announce every realm twice, and give the keyboard
    // two tab stops for one place.
    mountTrail()

    expect(document.querySelector('.trail__map svg').getAttribute('aria-hidden')).toBe('true')
    for (const node of boxes()) {
      expect(node.getAttribute('tabindex')).toBeNull()
    }
  })

  it('asks its owner to travel rather than travelling', async () => {
    const wrapper = mountTrail()

    document.querySelectorAll('.trail__stop')[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('select')[0][0]).toBe(realmId('Spacetime diagram'))
  })

  it('counts what it is showing', () => {
    mountTrail()

    expect(document.querySelector('.trail__count').textContent).toContain('4 realms')
    expect(document.querySelector('.trail__count').textContent).toContain('4 portals')
  })

  it('shows a jumped-to realm with no road leading to it, and says why', () => {
    // A search is a teleport; drawing an edge would put a road on the map
    // where none exists. But an unmarked unconnected box reads as a drawing
    // that failed rather than as a journey beginning.
    const journey = jump(visit(jump(createVisitGraph(), 'Saturn'), 'Titan'), 'Jazz')
    mountTrail(journey)

    expect(boxes()).toHaveLength(3)
    expect(document.querySelectorAll('.trail__links path')).toHaveLength(1)
    // Saturn and Jazz were both arrived at rather than walked to.
    expect(document.querySelectorAll('.trail__cap')).toHaveLength(2)
    expect(document.body.textContent).toContain('searched')
  })

  it('says so plainly when there is nowhere yet', () => {
    mountTrail(createVisitGraph())

    expect(document.querySelector('.trail__empty').textContent).toContain('Nowhere yet')
    expect(boxes()).toHaveLength(0)
  })

  it('still shows a realm whose branch was abandoned', () => {
    // History moved on; the map remembers.
    let journey = visit(jump(createVisitGraph(), 'Saturn'), 'Titan')
    journey = visit(goBack(journey), 'Rings of Saturn')
    mountTrail(journey)

    expect(names()).toContain('Titan')
  })
})

describe('the journey actions', () => {
  it('live on the panel that shows the journey', () => {
    // They were a separate "Journey" surface with its own button in the top
    // bar, which put two things called the journey one click apart and
    // spent a primary control on end-of-session actions.
    mountTrail()
    const actions = document.querySelector('.trail__actions')

    expect(actions).not.toBeNull()
    for (const label of ['Somewhere new', 'Share', 'Save', 'Load']) {
      expect(actions.textContent).toContain(label)
    }
  })

  it('asks its owner to perform each of them', async () => {
    const wrapper = mountTrail()
    const click = (text) =>
      [...document.querySelectorAll('.trail__actions button')]
        .find((button) => button.textContent.includes(text))
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))

    click('Somewhere new')
    click('Share')
    click('Save')
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('home')).toHaveLength(1)
    expect(wrapper.emitted('share')).toHaveLength(1)
    expect(wrapper.emitted('export')).toHaveLength(1)
  })

  it('cannot share a realm that is not there, but can still load one', () => {
    // Loading a journey is precisely what someone does from an empty one,
    // so the actions stay; only the one with nothing to act on goes quiet.
    mount(TrailMenu, { props: { show: true, graph: createVisitGraph(), canShare: false }, attachTo: document.body })

    const share = [...document.querySelectorAll('.trail__actions button')].find((button) =>
      button.textContent.includes('Share'),
    )
    expect(share.disabled).toBe(true)
    expect(document.querySelector('.trail__actions').textContent).toContain('Load')
  })
})
