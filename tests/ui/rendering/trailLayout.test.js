import { describe, expect, it } from 'vitest'
import { createVisitGraph, goBack, jump, realmId, visit } from '../../../src/core/traversal/visitGraph.js'
import { NODE_HEIGHT, RANK_GAP, layoutJourney, routeInto } from '../../../src/ui/rendering/trailLayout.js'

const nodeFor = (layout, title) => layout.nodes.find((node) => node.title === title)
const rankOf = (layout, title) => nodeFor(layout, title).rank

/** The journey that disproved the tree. */
function looped() {
  let journey = jump(createVisitGraph(), 'Spacetime diagram')
  journey = visit(journey, 'Spacetime')
  journey = visit(journey, 'Template talk: Spacetime')
  journey = visit(journey, 'Physics')
  return visit(journey, 'Spacetime')
}

describe('layoutJourney', () => {
  it('places nothing for an empty journey', () => {
    expect(layoutJourney(createVisitGraph())).toEqual({ nodes: [], links: [], width: 0, height: 0 })
  })

  it('survives being handed nothing', () => {
    expect(layoutJourney(null).nodes).toEqual([])
  })

  it('ranks realms by how far they are from the start', () => {
    const journey = visit(visit(jump(createVisitGraph(), 'Saturn'), 'Titan'), 'Atmosphere')
    const layout = layoutJourney(journey)

    expect(rankOf(layout, 'Saturn')).toBe(0)
    expect(rankOf(layout, 'Titan')).toBe(1)
    expect(rankOf(layout, 'Atmosphere')).toBe(2)
  })

  it('runs ranks down the panel', () => {
    const layout = layoutJourney(visit(jump(createVisitGraph(), 'Saturn'), 'Titan'))

    expect(nodeFor(layout, 'Titan').y - nodeFor(layout, 'Saturn').y).toBe(NODE_HEIGHT + RANK_GAP)
  })

  it('sits siblings side by side at the same rank', () => {
    let journey = visit(jump(createVisitGraph(), 'Saturn'), 'Titan')
    journey = visit(goBack(journey), 'Rings of Saturn')
    const layout = layoutJourney(journey)

    expect(rankOf(layout, 'Titan')).toBe(rankOf(layout, 'Rings of Saturn'))
    expect(nodeFor(layout, 'Titan').x).not.toBe(nodeFor(layout, 'Rings of Saturn').x)
    expect(nodeFor(layout, 'Titan').y).toBe(nodeFor(layout, 'Rings of Saturn').y)
  })

  describe('a realm reached twice', () => {
    it('is placed once', () => {
      const layout = layoutJourney(looped())

      expect(layout.nodes.filter((node) => node.title === 'Spacetime')).toHaveLength(1)
      expect(layout.nodes).toHaveLength(4)
    })

    it('keeps both routes in, and says how many there are', () => {
      const layout = layoutJourney(looped())
      const spacetime = nodeFor(layout, 'Spacetime')

      expect(spacetime.routesIn).toBe(2)
      expect(layout.links.filter((link) => link.to === spacetime.id)).toHaveLength(2)
    })

    it('marks the edge that closes the loop', () => {
      // Physics sits below Spacetime, so the link back up is a loop closing
      // rather than an ordinary step, and a straight line between them would
      // read as a mistake.
      const layout = layoutJourney(looped())
      const back = layout.links.filter((link) => link.isBackEdge)

      expect(back).toHaveLength(1)
      expect(nodeFor(layout, 'Physics').id).toBe(back[0].from)
      expect(nodeFor(layout, 'Spacetime').id).toBe(back[0].to)
    })

    it('ranks it by the SHORTEST way there', () => {
      // Two routes reach Spacetime, at one step and at three. Ranking by the
      // long one would push everything below it down for no reason.
      const layout = layoutJourney(looped())

      expect(rankOf(layout, 'Spacetime')).toBe(1)
    })
  })

  it('gives a jumped-to realm a rank of its own', () => {
    // No portal was taken, so it is not "one step from" anything.
    const journey = jump(visit(jump(createVisitGraph(), 'Saturn'), 'Titan'), 'Jazz')
    const layout = layoutJourney(journey)

    expect(rankOf(layout, 'Saturn')).toBe(0)
    expect(rankOf(layout, 'Jazz')).toBe(0)
  })

  it('says where the viewer is standing', () => {
    const layout = layoutJourney(goBack(visit(jump(createVisitGraph(), 'Saturn'), 'Titan')))
    const current = layout.nodes.filter((node) => node.isCurrent)

    expect(current).toHaveLength(1)
    expect(current[0].title).toBe('Saturn')
  })

  it('reports a canvas big enough to hold everything', () => {
    const layout = layoutJourney(looped())

    for (const node of layout.nodes) {
      expect(node.x).toBeGreaterThanOrEqual(0)
      expect(node.x).toBeLessThan(layout.width)
      expect(node.y).toBeLessThan(layout.height)
    }
  })

  it('lays the same journey out the same way twice', () => {
    // Ranks come from the journey rather than from a simulation, so opening
    // the panel again shows the map where it was left.
    expect(layoutJourney(looped())).toEqual(layoutJourney(looped()))
  })
})

describe('routeInto', () => {
  it('finds every realm that leads to one', () => {
    const journey = looped()
    const route = routeInto(journey, realmId('Physics'))

    expect(route).toContain(realmId('Spacetime'))
    expect(route).toContain(realmId('Template talk: Spacetime'))
    expect(route).toContain(realmId('Spacetime diagram'))
  })

  it('terminates on a loop rather than going round it forever', () => {
    const journey = looped()

    expect(() => routeInto(journey, realmId('Spacetime'))).not.toThrow()
    expect(routeInto(journey, realmId('Spacetime')).length).toBeLessThanOrEqual(4)
  })

  it('returns just the realm when nothing leads to it', () => {
    const journey = jump(createVisitGraph(), 'Saturn')

    expect(routeInto(journey, realmId('Saturn'))).toEqual([realmId('Saturn')])
  })
})
