import { describe, expect, it } from 'vitest'
import {
  createVisitGraph,
  goBack,
  goTo,
  jump,
  visit,
} from '../../../src/core/traversal/visitGraph.js'
import { ancestryOf, layoutTrail } from '../../../src/ui/rendering/trailLayout.js'

const titles = (rows) => rows.map((row) => row.title)
const shape = (rows) => rows.map((row) => `${'  '.repeat(row.depth)}${row.title}`)

describe('layoutTrail', () => {
  it('lays out an empty journey as nothing', () => {
    expect(layoutTrail(createVisitGraph())).toEqual({ rows: [], journeys: 0, maxDepth: 0 })
  })

  it('survives being handed nothing at all', () => {
    expect(layoutTrail(null).rows).toEqual([])
  })

  it('lays a straight journey out in a line', () => {
    const graph = visit(visit(jump(createVisitGraph(), 'Saturn'), 'Titan'), 'Atmosphere')

    const { rows, maxDepth } = layoutTrail(graph)

    expect(shape(rows)).toEqual(['Saturn', '  Titan', '    Atmosphere'])
    expect(maxDepth).toBe(2)
  })

  describe('a journey that forks', () => {
    /** Saturn → Titan, back, → Rings of Saturn → Cassini Division. */
    function forked() {
      let graph = visit(jump(createVisitGraph(), 'Saturn'), 'Titan')
      graph = visit(goBack(graph), 'Rings of Saturn')
      return visit(graph, 'Cassini Division')
    }

    it('shows both branches, in the order they were taken', () => {
      const { rows } = layoutTrail(forked())

      expect(shape(rows)).toEqual([
        'Saturn',
        '  Titan',
        '  Rings of Saturn',
        '    Cassini Division',
      ])
    })

    it('marks the fork, which is the whole reason for the panel', () => {
      const { rows } = layoutTrail(forked())

      expect(rows.find((row) => row.title === 'Saturn').isBranchPoint).toBe(true)
      expect(rows.find((row) => row.title === 'Titan').isBranchPoint).toBe(false)
    })

    it('marks the last child of each fork, so it draws an elbow not a tee', () => {
      const { rows } = layoutTrail(forked())

      expect(rows.find((row) => row.title === 'Titan').isLastChild).toBe(false)
      expect(rows.find((row) => row.title === 'Rings of Saturn').isLastChild).toBe(true)
    })

    it('draws no lane beside a row whose branch is finished', () => {
      // Cassini sits under the LAST branch, so nothing continues beside it.
      const { rows } = layoutTrail(forked())

      expect(rows.find((row) => row.title === 'Cassini Division').rails).toEqual([false])
    })

    it('draws a lane beside a deeper row under an unfinished branch', () => {
      // Saturn → Titan → Atmosphere, then back twice and off a different way,
      // so Titan still has a sibling waiting below Atmosphere and its lane
      // has to carry past.
      let graph = visit(visit(jump(createVisitGraph(), 'Saturn'), 'Titan'), 'Atmosphere')
      graph = visit(goBack(goBack(graph)), 'Rings of Saturn')

      const { rows } = layoutTrail(graph)

      expect(rows.find((row) => row.title === 'Atmosphere').rails).toEqual([true])
    })

    it('gives a first-level row no ancestor lane, the root having none to draw', () => {
      const { rows } = layoutTrail(forked())

      expect(rows.find((row) => row.title === 'Titan').rails).toEqual([])
      expect(rows.find((row) => row.title === 'Saturn').rails).toEqual([])
    })

    it('keeps one lane per ancestor, however deep it goes', () => {
      let graph = jump(createVisitGraph(), 'A')
      for (const title of ['B', 'C', 'D', 'E']) graph = visit(graph, title)

      for (const row of layoutTrail(graph).rows) {
        expect(row.rails.length, row.title).toBe(Math.max(0, row.depth - 1))
      }
    })
  })

  it('keeps separate journeys separate', () => {
    // A search starts a new one rather than pretending you walked there.
    let graph = visit(jump(createVisitGraph(), 'Saturn'), 'Titan')
    graph = visit(jump(graph, 'Jazz'), 'Bebop')

    const { rows, journeys } = layoutTrail(graph)

    expect(journeys).toBe(2)
    expect(rows.map((row) => row.journey)).toEqual([0, 0, 1, 1])
    expect(titles(rows)).toEqual(['Saturn', 'Titan', 'Jazz', 'Bebop'])
  })

  it('says where the viewer is standing', () => {
    let graph = visit(visit(jump(createVisitGraph(), 'Saturn'), 'Titan'), 'Atmosphere')
    graph = goBack(graph)

    const { rows } = layoutTrail(graph)
    const current = rows.filter((row) => row.isCurrent)

    expect(current).toHaveLength(1)
    expect(current[0].title).toBe('Titan')
  })

  it('lists the same title twice when it was reached twice', () => {
    // Two arrivals are two places in the journey. Collapsing them would be
    // a different document — an index of what was seen, not a record of
    // where the viewer went.
    let graph = visit(visit(jump(createVisitGraph(), 'Saturn'), 'Titan'), 'Atmosphere')
    graph = goTo(graph, graph.rootIds[0])
    graph = visit(visit(graph, 'Rings of Saturn'), 'Atmosphere')

    const { rows } = layoutTrail(graph)

    expect(rows.filter((row) => row.title === 'Atmosphere')).toHaveLength(2)
  })

  it('orders children by when they were first reached', () => {
    let graph = jump(createVisitGraph(), 'Saturn')
    graph = visit(graph, 'Zeta')
    graph = visit(goBack(graph), 'Alpha')

    const { rows } = layoutTrail(graph)

    // Visit order, not alphabetical: this is a record of what happened.
    expect(titles(rows)).toEqual(['Saturn', 'Zeta', 'Alpha'])
  })
})

describe('ancestryOf', () => {
  it('returns the line from a node back to the start of its journey', () => {
    let graph = visit(jump(createVisitGraph(), 'Saturn'), 'Titan')
    graph = visit(goBack(graph), 'Rings of Saturn')
    graph = visit(graph, 'Cassini Division')

    const { rows } = layoutTrail(graph)
    const cassini = rows.find((row) => row.title === 'Cassini Division')

    const line = ancestryOf(rows, cassini.id).map((id) => rows.find((row) => row.id === id).title)

    expect(line.sort()).toEqual(['Cassini Division', 'Rings of Saturn', 'Saturn'])
  })

  it('excludes the branch the viewer did not take', () => {
    let graph = visit(jump(createVisitGraph(), 'Saturn'), 'Titan')
    graph = visit(goBack(graph), 'Rings of Saturn')

    const { rows } = layoutTrail(graph)
    const rings = rows.find((row) => row.title === 'Rings of Saturn')

    expect(ancestryOf(rows, rings.id)).not.toContain(rows.find((row) => row.title === 'Titan').id)
  })

  it('returns nothing for a node that is not there', () => {
    expect(ancestryOf([], 'nope')).toEqual([])
  })
})
