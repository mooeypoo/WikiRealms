import { h } from 'vue'
import TrailMenu from '../../../src/ui/components/TrailMenu.vue'
import { createVisitGraph, goBack, jump, visit } from '../../../src/core/traversal/visitGraph.js'

/**
 * The map is the thing to judge: whether the ranks read as distance from
 * where the journey started, whether a loop closing looks like a return
 * rather than a mistake, and whether a junction is findable at a glance.
 */
export default {
  title: 'Instruments/TrailMenu',
  component: TrailMenu,
  parameters: { layout: 'fullscreen' },
}

const asStory = (build) => () => ({ setup: () => build })

function straight() {
  return visit(visit(jump(createVisitGraph(), 'Saturn'), 'Titan'), 'Atmosphere')
}

function branched() {
  let journey = visit(jump(createVisitGraph(), 'Saturn'), 'Titan')
  journey = visit(goBack(journey), 'Rings of Saturn')
  return visit(journey, 'Cassini Division')
}

/** The real journey that disproved the tree, loop and all. */
function looped() {
  let journey = jump(createVisitGraph(), 'Albert Einstein')
  journey = visit(journey, 'General relativity')
  journey = visit(journey, 'Spacetime diagram')
  journey = visit(journey, 'Spacetime')
  journey = visit(journey, 'Template talk: Spacetime')
  journey = visit(journey, 'Physics')
  return visit(journey, 'Spacetime')
}

/** Two journeys, a loop, and a realm three routes lead to. */
function tangled() {
  let journey = looped()
  journey = visit(journey, 'Quantum field theory')
  journey = visit(journey, 'Spacetime')
  journey = visit(jump(journey, 'Jazz'), 'Bebop')
  return journey
}

export const Straight = { render: asStory(() => h(TrailMenu, { show: true, graph: straight() })) }
export const Branched = { render: asStory(() => h(TrailMenu, { show: true, graph: branched() })) }
export const Looped = { render: asStory(() => h(TrailMenu, { show: true, graph: looped() })) }
export const Tangled = { render: asStory(() => h(TrailMenu, { show: true, graph: tangled() })) }
export const Empty = { render: asStory(() => h(TrailMenu, { show: true, graph: createVisitGraph() })) }
