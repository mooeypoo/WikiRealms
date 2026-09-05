import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import TrailMenu from '../../../src/ui/components/TrailMenu.vue'
import { createVisitGraph, goBack, jump, visit } from '../../../src/core/traversal/visitGraph.js'
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

/** Saturn → Titan, back, → Rings of Saturn → Cassini Division. */
function forked() {
  let graph = visit(jump(createVisitGraph(), 'Saturn'), 'Titan')
  graph = visit(goBack(graph), 'Rings of Saturn')
  return visit(graph, 'Cassini Division')
}

function mountTrail(graph = forked()) {
  return mount(TrailMenu, { props: { show: true, graph }, attachTo: document.body })
}

const stops = () => [...document.querySelectorAll('.trail__stop')]
const labels = () => stops().map((stop) => stop.querySelector('.trail__name').textContent)

describe('TrailMenu', () => {
  it('shows every stop, not just the way you came', () => {
    // The flat list was a lie by omission the moment a journey forked: the
    // branch you left was simply absent.
    mountTrail()

    expect(labels()).toEqual(['Saturn', 'Titan', 'Rings of Saturn', 'Cassini Division'])
  })

  it('draws a lane per ancestor still carrying a branch', () => {
    mountTrail()
    const gutters = stops().map((stop) => stop.querySelectorAll('.trail__lane').length)

    // root: dot only; depth 1: elbow + dot; depth 2: one lane + elbow + dot.
    expect(gutters).toEqual([1, 2, 2, 3])
  })

  it('keeps the line going past a stop with a sibling below it', () => {
    mountTrail()
    const titan = stops()[1]

    expect(titan.querySelector('.trail__elbow--tee')).not.toBeNull()
    expect(stops()[2].querySelector('.trail__elbow--tee')).toBeNull()
  })

  it('fills the dot at a fork, which is what the panel is for', () => {
    mountTrail()

    expect(stops()[0].querySelector('.trail__dot--fork')).not.toBeNull()
    expect(stops()[1].querySelector('.trail__dot--fork')).toBeNull()
    expect(stops()[0].textContent).toContain('2 ways')
  })

  it('says where the viewer is standing, to assistive tech as well', () => {
    mountTrail()
    const current = stops().filter((stop) => stop.getAttribute('aria-current') === 'true')

    expect(current).toHaveLength(1)
    expect(current[0].textContent).toContain('Cassini Division')
  })

  it('separates journeys rather than running them together', () => {
    // A search starts a new one; presenting it as a continuation would
    // claim the viewer walked somewhere they jumped.
    let graph = visit(jump(createVisitGraph(), 'Saturn'), 'Titan')
    graph = visit(jump(graph, 'Jazz'), 'Bebop')
    mountTrail(graph)

    expect(document.querySelectorAll('.trail__break')).toHaveLength(1)
    expect(document.querySelector('.trail__count').textContent).toContain('2 journeys')
  })

  it('asks its owner to travel rather than travelling', async () => {
    const wrapper = mountTrail()

    stops()[1].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wrapper.vm.$nextTick()

    const [[nodeId]] = wrapper.emitted('select')
    expect(typeof nodeId).toBe('string')
  })

  it('lists both arrivals when a realm was reached twice', () => {
    let graph = visit(visit(jump(createVisitGraph(), 'Saturn'), 'Titan'), 'Atmosphere')
    graph = visit(visit(goBack(goBack(graph)), 'Rings of Saturn'), 'Atmosphere')
    mountTrail(graph)

    expect(labels().filter((title) => title === 'Atmosphere')).toHaveLength(2)
  })

  it('says so plainly when there is nowhere yet', () => {
    mountTrail(createVisitGraph())

    expect(document.querySelector('.trail__empty').textContent).toContain('Nowhere yet')
    expect(stops()).toHaveLength(0)
  })
})
