import { describe, expect, it } from 'vitest'
import {
  backTitles,
  canGoBack,
  canGoForward,
  childrenOf,
  createVisitGraph,
  currentTitle,
  forwardTitles,
  fromLinearHistory,
  goBack,
  goForward,
  goTo,
  isVisitGraph,
  jump,
  pathToCurrent,
  visit,
} from '../../../src/core/traversal/visitGraph.js'

const titles = (nodes) => nodes.map((node) => node.title)

describe('visitGraph', () => {
  it('starts empty', () => {
    const graph = createVisitGraph()

    expect(currentTitle(graph)).toBeNull()
    expect(canGoBack(graph)).toBe(false)
    expect(canGoForward(graph)).toBe(false)
  })

  it('records travel as a child of where you were', () => {
    const graph = visit(visit(jump(createVisitGraph(), 'Saturn'), 'Rings of Saturn'), 'Cassini Division')

    expect(currentTitle(graph)).toBe('Cassini Division')
    expect(backTitles(graph)).toEqual(['Saturn', 'Rings of Saturn'])
    expect(titles(pathToCurrent(graph))).toEqual(['Saturn', 'Rings of Saturn', 'Cassini Division'])
  })

  it('treats the first move as the start of a journey even without a jump', () => {
    expect(currentTitle(visit(createVisitGraph(), 'Saturn'))).toBe('Saturn')
  })

  it('starts a separate journey on a jump', () => {
    // A search is not travel: it should not claim the viewer walked there.
    const graph = jump(visit(jump(createVisitGraph(), 'Saturn'), 'Rings of Saturn'), 'Jazz')

    expect(currentTitle(graph)).toBe('Jazz')
    expect(backTitles(graph)).toEqual([])
    expect(graph.rootIds).toHaveLength(2)
  })

  it('ignores travelling to where you already are', () => {
    const graph = jump(createVisitGraph(), 'Saturn')

    expect(visit(graph, 'Saturn')).toBe(graph)
  })

  describe('the branch that used to be destroyed', () => {
    it('keeps both routes when you go back and take a different portal', () => {
      // Two flat stacks could not express this: navigating after a goBack
      // cleared the forward stack, so the first branch simply vanished and
      // no trail could ever be drawn for it.
      let graph = visit(jump(createVisitGraph(), 'Saturn'), 'Rings of Saturn')
      graph = goBack(graph)
      graph = visit(graph, 'Titan')

      const root = graph.rootIds[0]
      expect(titles(childrenOf(graph, root)).sort()).toEqual(['Rings of Saturn', 'Titan'])
      expect(currentTitle(graph)).toBe('Titan')
    })

    it('lets you walk back into the abandoned branch', () => {
      let graph = visit(jump(createVisitGraph(), 'Saturn'), 'Rings of Saturn')
      graph = visit(goBack(graph), 'Titan')

      const abandoned = childrenOf(graph, graph.rootIds[0]).find((node) => node.title === 'Rings of Saturn')
      graph = goTo(graph, abandoned.id)

      expect(currentTitle(graph)).toBe('Rings of Saturn')
      expect(backTitles(graph)).toEqual(['Saturn'])
    })
  })

  it('reuses a child rather than duplicating it when you pace back and forth', () => {
    let graph = visit(jump(createVisitGraph(), 'Saturn'), 'Titan')
    graph = visit(goBack(graph), 'Titan')
    graph = visit(goBack(graph), 'Titan')

    expect(childrenOf(graph, graph.rootIds[0])).toHaveLength(1)
    expect(currentTitle(graph)).toBe('Titan')
  })

  it('makes separate nodes for the same title reached by different routes', () => {
    // Two arrivals at one article are two places in the journey, not one.
    let graph = visit(visit(jump(createVisitGraph(), 'Saturn'), 'Titan'), 'Atmosphere')
    graph = goTo(graph, graph.rootIds[0])
    graph = visit(visit(graph, 'Rings of Saturn'), 'Atmosphere')

    const arrivals = Object.values(graph.nodes).filter((node) => node.title === 'Atmosphere')
    expect(arrivals).toHaveLength(2)
    expect(backTitles(graph)).toEqual(['Saturn', 'Rings of Saturn'])
  })

  describe('back and forward', () => {
    it('walks up and back down the branch it came from', () => {
      const graph = visit(visit(jump(createVisitGraph(), 'Saturn'), 'Titan'), 'Atmosphere')

      const back = goBack(graph)
      expect(currentTitle(back)).toBe('Titan')
      expect(canGoForward(back)).toBe(true)

      expect(currentTitle(goForward(back))).toBe('Atmosphere')
    })

    it('remembers which branch you came down when there are several', () => {
      let graph = visit(jump(createVisitGraph(), 'Saturn'), 'Titan')
      graph = visit(goBack(graph), 'Rings of Saturn')
      graph = goBack(graph)

      // Last descent was into Rings of Saturn, so that is what forward means.
      expect(currentTitle(goForward(graph))).toBe('Rings of Saturn')
    })

    it('does nothing at the ends', () => {
      const graph = jump(createVisitGraph(), 'Saturn')

      expect(goBack(graph)).toBe(graph)
      expect(goForward(graph)).toBe(graph)
    })

    it('projects a forward chain for the rest of the app to read', () => {
      let graph = visit(visit(jump(createVisitGraph(), 'Saturn'), 'Titan'), 'Atmosphere')
      graph = goBack(goBack(graph))

      expect(forwardTitles(graph)).toEqual(['Titan', 'Atmosphere'])
    })
  })

  it('returns to a node without rewriting the journey', () => {
    // The old breadcrumb called navigateTo, which pushed a new entry and
    // wiped the forward stack — clicking your own history rewrote it.
    const graph = visit(visit(jump(createVisitGraph(), 'Saturn'), 'Titan'), 'Atmosphere')
    const before = Object.keys(graph.nodes).length

    const returned = goTo(graph, graph.rootIds[0])

    expect(Object.keys(returned.nodes)).toHaveLength(before)
    expect(currentTitle(returned)).toBe('Saturn')
    expect(canGoForward(returned)).toBe(true)
  })

  it('ignores a node id that is not in the journey', () => {
    const graph = jump(createVisitGraph(), 'Saturn')

    expect(goTo(graph, 'nope')).toBe(graph)
  })

  describe('fromLinearHistory', () => {
    it('rebuilds a flat session as one unbranched journey', () => {
      const graph = fromLinearHistory({ current: 'Titan', backstack: ['Saturn'], forwardstack: ['Atmosphere'] })

      expect(currentTitle(graph)).toBe('Titan')
      expect(backTitles(graph)).toEqual(['Saturn'])
      expect(forwardTitles(graph)).toEqual(['Atmosphere'])
    })

    it('produces an empty journey from an empty history', () => {
      expect(fromLinearHistory()).toEqual(createVisitGraph())
      expect(fromLinearHistory({ current: null, backstack: [], forwardstack: [] })).toEqual(createVisitGraph())
    })
  })

  it('round-trips through JSON', () => {
    const graph = visit(visit(jump(createVisitGraph(), 'Saturn'), 'Titan'), 'Atmosphere')

    expect(JSON.parse(JSON.stringify(graph))).toEqual(graph)
  })

  it('recognises a real graph and refuses a broken one', () => {
    expect(isVisitGraph(jump(createVisitGraph(), 'Saturn'))).toBe(true)
    expect(isVisitGraph(null)).toBe(false)
    expect(isVisitGraph({ nodes: {}, rootIds: [] })).toBe(false)
    expect(isVisitGraph({ nodes: {}, rootIds: 'no', currentId: null, nextId: 1 })).toBe(false)
  })

  it('never mutates the graph it is given', () => {
    const graph = jump(createVisitGraph(), 'Saturn')
    const before = JSON.stringify(graph)

    visit(graph, 'Titan')
    goBack(graph)

    expect(JSON.stringify(graph)).toBe(before)
  })
})
