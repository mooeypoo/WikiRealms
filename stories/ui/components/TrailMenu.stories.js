import { h } from 'vue'
import TrailMenu from '../../../src/ui/components/TrailMenu.vue'
import { createVisitGraph, goBack, jump, visit } from '../../../src/core/traversal/visitGraph.js'

/**
 * The gutter is the thing to judge here: whether the lanes read as one
 * history that forked, or as decoration beside a list. A commit graph is
 * the reference — if this needs explaining, it has failed.
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

function forked() {
  let graph = visit(jump(createVisitGraph(), 'Saturn'), 'Titan')
  graph = visit(goBack(graph), 'Rings of Saturn')
  return visit(graph, 'Cassini Division')
}

/** Several forks at several depths — the case the lanes exist for. */
function tangled() {
  let graph = visit(visit(jump(createVisitGraph(), 'Saturn'), 'Titan'), 'Atmosphere')
  graph = visit(goBack(graph), 'Cryovolcano')
  graph = visit(goBack(goBack(graph)), 'Rings of Saturn')
  graph = visit(graph, 'Cassini Division')
  graph = visit(goBack(graph), 'Roche Division')
  graph = visit(jump(graph, 'Jazz'), 'Bebop')
  return graph
}

export const Straight = { render: asStory(() => h(TrailMenu, { show: true, graph: straight() })) }
export const Forked = { render: asStory(() => h(TrailMenu, { show: true, graph: forked() })) }
export const Tangled = { render: asStory(() => h(TrailMenu, { show: true, graph: tangled() })) }
export const Empty = { render: asStory(() => h(TrailMenu, { show: true, graph: createVisitGraph() })) }
