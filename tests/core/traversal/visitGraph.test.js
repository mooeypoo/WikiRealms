import { describe, expect, it } from 'vitest'
import {
  backTitles,
  canGoBack,
  canGoForward,
  createVisitGraph,
  currentId,
  currentTitle,
  forwardTitles,
  fromLinearHistory,
  fromVisitTree,
  goBack,
  goForward,
  goTo,
  isVisitGraph,
  jump,
  neighboursOf,
  realmId,
  realmsOf,
  visit,
} from '../../../src/core/traversal/visitGraph.js'

const titles = (journey) => realmsOf(journey).map((realm) => realm.title)
const links = (journey) =>
  journey.edges.map((edge) => `${journey.realms[edge.from].title} → ${journey.realms[edge.to].title}`)

describe('the journey', () => {
  it('starts nowhere', () => {
    const journey = createVisitGraph()

    expect(currentTitle(journey)).toBeNull()
    expect(canGoBack(journey)).toBe(false)
    expect(canGoForward(journey)).toBe(false)
  })

  it('records a realm and the portal that reached it', () => {
    const journey = visit(visit(jump(createVisitGraph(), 'Saturn'), 'Rings of Saturn'), 'Cassini Division')

    expect(titles(journey)).toEqual(['Saturn', 'Rings of Saturn', 'Cassini Division'])
    expect(links(journey)).toEqual(['Saturn → Rings of Saturn', 'Rings of Saturn → Cassini Division'])
  })

  describe('a realm reached twice', () => {
    /**
     * The journey that disproved the tree: Spacetime reached from Spacetime
     * diagram, and again from Physics, having gone round through Template
     * talk on the way.
     */
    function looped() {
      let journey = jump(createVisitGraph(), 'Spacetime diagram')
      journey = visit(journey, 'Spacetime')
      journey = visit(journey, 'Template talk: Spacetime')
      journey = visit(journey, 'Physics')
      return visit(journey, 'Spacetime')
    }

    it('is one place, not two', () => {
      // worldId derives from articleId, revision and engine version, so both
      // arrivals generate the byte-identical world. A model that called them
      // different would contradict the generator.
      const journey = looped()

      expect(titles(journey).filter((title) => title === 'Spacetime')).toHaveLength(1)
      expect(Object.keys(journey.realms)).toHaveLength(4)
    })

    it('keeps both ways in', () => {
      const journey = looped()

      expect(links(journey)).toContain('Spacetime diagram → Spacetime')
      expect(links(journey)).toContain('Physics → Spacetime')
    })

    it('holds the loop, which a tree could not hold at all', () => {
      const journey = looped()
      const spacetime = realmId('Spacetime')

      expect(neighboursOf(journey, spacetime).map((realm) => realm.title)).toEqual(['Template talk: Spacetime'])
      expect(links(journey)).toContain('Physics → Spacetime')
    })

    it('records the second arrival in history even though the realm is known', () => {
      const journey = looped()

      expect(journey.history.map((id) => journey.realms[id].title)).toEqual([
        'Spacetime diagram',
        'Spacetime',
        'Template talk: Spacetime',
        'Physics',
        'Spacetime',
      ])
    })

    it('does not duplicate an edge already walked', () => {
      let journey = visit(jump(createVisitGraph(), 'Saturn'), 'Titan')
      journey = visit(goBack(journey), 'Titan')

      expect(journey.edges).toHaveLength(1)
    })
  })

  it('ignores travelling to where you already are', () => {
    const journey = jump(createVisitGraph(), 'Saturn')

    expect(visit(journey, 'Saturn')).toBe(journey)
  })

  it('records no edge for a jump, there being no portal to record', () => {
    // A search is a teleport. Drawing a road there would put one on the map
    // where none exists.
    const journey = jump(visit(jump(createVisitGraph(), 'Saturn'), 'Titan'), 'Jazz')

    expect(titles(journey)).toEqual(['Saturn', 'Titan', 'Jazz'])
    expect(links(journey)).toEqual(['Saturn → Titan'])
  })

  describe('back and forward', () => {
    it('walks the order things happened, not the shape of the map', () => {
      // A graph has no unique "previous"; a history does. This is the split
      // a browser makes, and the reason both exist here.
      const journey = visit(visit(jump(createVisitGraph(), 'Saturn'), 'Titan'), 'Atmosphere')

      const back = goBack(journey)
      expect(currentTitle(back)).toBe('Titan')
      expect(canGoForward(back)).toBe(true)
      expect(currentTitle(goForward(back))).toBe('Atmosphere')
    })

    it('discards what was ahead once you leave a different way', () => {
      let journey = visit(visit(jump(createVisitGraph(), 'Saturn'), 'Titan'), 'Atmosphere')
      journey = visit(goBack(goBack(journey)), 'Rings of Saturn')

      expect(canGoForward(journey)).toBe(false)
      // The abandoned branch is still ON THE MAP, though — that is the
      // difference between history and the graph.
      expect(titles(journey)).toContain('Atmosphere')
    })

    it('projects the flat stacks the rest of the app still reads', () => {
      let journey = visit(visit(jump(createVisitGraph(), 'Saturn'), 'Titan'), 'Atmosphere')
      journey = goBack(journey)

      expect(backTitles(journey)).toEqual(['Saturn'])
      expect(forwardTitles(journey)).toEqual(['Atmosphere'])
    })

    it('does nothing at the ends', () => {
      const journey = jump(createVisitGraph(), 'Saturn')

      expect(goBack(journey)).toBe(journey)
      expect(goForward(journey)).toBe(journey)
    })
  })

  describe('returning to a realm on the map', () => {
    it('moves there and remembers that it did', () => {
      const journey = visit(visit(jump(createVisitGraph(), 'Saturn'), 'Titan'), 'Atmosphere')
      const back = goTo(journey, realmId('Saturn'))

      expect(currentTitle(back)).toBe('Saturn')
      expect(canGoBack(back)).toBe(true)
    })

    it('records no edge, the viewer having teleported rather than walked', () => {
      const journey = visit(visit(jump(createVisitGraph(), 'Saturn'), 'Titan'), 'Atmosphere')
      const before = journey.edges.length

      expect(goTo(journey, realmId('Saturn')).edges).toHaveLength(before)
    })

    it('ignores a realm that is not on the map, or the one you are on', () => {
      const journey = jump(createVisitGraph(), 'Saturn')

      expect(goTo(journey, 'r:Nowhere')).toBe(journey)
      expect(goTo(journey, realmId('Saturn'))).toBe(journey)
    })
  })

  describe('reading older sessions', () => {
    it('rebuilds a flat history', () => {
      const journey = fromLinearHistory({ current: 'Titan', backstack: ['Saturn'], forwardstack: ['Atmosphere'] })

      expect(currentTitle(journey)).toBe('Titan')
      expect(backTitles(journey)).toEqual(['Saturn'])
      expect(forwardTitles(journey)).toEqual(['Atmosphere'])
    })

    it('invents no portals from a flat history, having no way to know', () => {
      // 1.0 recorded only "these articles, in this order" — it had no concept
      // of search versus portal, because the app it came from had none. This
      // used to chain them, which put a road between an article and whatever
      // the viewer had merely been reading before searching for it.
      const journey = fromLinearHistory({
        current: 'Barack Obama',
        backstack: ['Albert Einstein', 'General relativity'],
        forwardstack: [],
      })

      expect(titles(journey)).toEqual(['Albert Einstein', 'General relativity', 'Barack Obama'])
      expect(journey.edges).toEqual([])
      // The session itself is intact; only the unknowable claim is dropped.
      expect(backTitles(journey)).toEqual(['Albert Einstein', 'General relativity'])
    })

    it('merges a per-arrival tree by realm', () => {
      // The 2.0 shape: Saturn with two children, one of them a title also
      // reached elsewhere.
      const tree = {
        nodes: {
          n1: { id: 'n1', title: 'Saturn', parentId: null },
          n2: { id: 'n2', title: 'Titan', parentId: 'n1' },
          n3: { id: 'n3', title: 'Atmosphere', parentId: 'n2' },
          n4: { id: 'n4', title: 'Rings of Saturn', parentId: 'n1' },
          n5: { id: 'n5', title: 'Atmosphere', parentId: 'n4' },
        },
        rootIds: ['n1'],
        currentId: 'n5',
        nextId: 6,
      }

      const journey = fromVisitTree(tree)

      expect(titles(journey)).toEqual(['Saturn', 'Titan', 'Atmosphere', 'Rings of Saturn'])
      expect(links(journey)).toContain('Titan → Atmosphere')
      expect(links(journey)).toContain('Rings of Saturn → Atmosphere')
      expect(currentTitle(journey)).toBe('Atmosphere')
    })

    it('produces an empty journey from nothing', () => {
      expect(fromLinearHistory()).toEqual(createVisitGraph())
      expect(fromVisitTree(null)).toEqual(createVisitGraph())
    })
  })

  it('round-trips through JSON', () => {
    const journey = visit(visit(jump(createVisitGraph(), 'Saturn'), 'Titan'), 'Atmosphere')

    expect(JSON.parse(JSON.stringify(journey))).toEqual(journey)
  })

  it('recognises a real journey and refuses a broken one', () => {
    expect(isVisitGraph(jump(createVisitGraph(), 'Saturn'))).toBe(true)
    expect(isVisitGraph(null)).toBe(false)
    expect(isVisitGraph({ realms: {}, edges: [] })).toBe(false)
    // The 2.0 tree must NOT pass as a journey, or it would be read as one.
    expect(isVisitGraph({ nodes: {}, rootIds: [], currentId: null, nextId: 1 })).toBe(false)
  })

  it('never mutates what it is given', () => {
    const journey = jump(createVisitGraph(), 'Saturn')
    const before = JSON.stringify(journey)

    visit(journey, 'Titan')
    goBack(journey)
    goTo(journey, realmId('Saturn'))

    expect(JSON.stringify(journey)).toBe(before)
  })

  it('answers where it is by id as well as by name', () => {
    const journey = jump(createVisitGraph(), 'Saturn')

    expect(currentId(journey)).toBe(realmId('Saturn'))
    expect(currentId(createVisitGraph())).toBeNull()
  })
})
