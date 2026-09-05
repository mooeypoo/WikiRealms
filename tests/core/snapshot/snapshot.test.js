import { describe, expect, it } from 'vitest'
import {
  SCHEMA_VERSION,
  SnapshotIncompatibleError,
  SnapshotInvalidError,
  createSnapshot,
  restoreSnapshot,
} from '../../../src/core/snapshot/snapshot.js'
import { createVisitGraph, currentTitle, backTitles, jump, visit } from '../../../src/core/traversal/visitGraph.js'

/** Physics → Albert Einstein, the journey the old fixtures described. */
function makeGraph() {
  return visit(jump(createVisitGraph(), 'Physics'), 'Albert Einstein')
}

function makeState(overrides = {}) {
  return {
    graph: makeGraph(),
    articleCache: { 'Albert Einstein': { title: 'Albert Einstein' } },
    engineVersion: 'v1',
    ...overrides,
  }
}

/** A snapshot in the shape the app wrote before the visit graph existed. */
function legacySnapshot({ current = 'Albert Einstein', backstack = ['Physics'], forwardstack = [] } = {}) {
  return {
    schemaVersion: '1.0',
    createdAt: '2026-08-31T00:00:00Z',
    appVersion: '0.1.0',
    engineVersion: 'v1',
    worlds: {},
    navigation: { current, backstack, forwardstack },
    articleCache: { Physics: { title: 'Physics' } },
    generationCache: {},
    uiState: {},
  }
}

describe('createSnapshot', () => {
  it('produces a snapshot matching the documented shape', () => {
    const snapshot = createSnapshot(makeState({ now: () => '2026-08-31T00:00:00Z' }))

    expect(snapshot).toEqual({
      schemaVersion: SCHEMA_VERSION,
      createdAt: '2026-08-31T00:00:00Z',
      appVersion: '0.1.0',
      engineVersion: 'v1',
      worlds: {},
      navigation: { graph: makeGraph() },
      articleCache: { 'Albert Einstein': { title: 'Albert Einstein' } },
      generationCache: {},
      uiState: {},
    })
  })

  it('is JSON-serializable, which is the whole point of a portable snapshot', () => {
    const snapshot = createSnapshot(makeState())

    expect(restoreSnapshot(JSON.parse(JSON.stringify(snapshot))).graph).toEqual(makeGraph())
  })

  it('falls back to an empty journey rather than writing undefined', () => {
    expect(createSnapshot({ engineVersion: 'v1' }).navigation.graph).toEqual(createVisitGraph())
  })

  it('copies the article cache instead of aliasing it', () => {
    const articleCache = { A: { title: 'A' } }
    const snapshot = createSnapshot(makeState({ articleCache }))

    articleCache.B = { title: 'B' }

    expect(Object.keys(snapshot.articleCache)).toEqual(['A'])
  })
})

describe('restoreSnapshot', () => {
  it('returns the journey and article cache from a current snapshot', () => {
    const snapshot = createSnapshot(makeState())

    expect(restoreSnapshot(snapshot)).toEqual({
      graph: makeGraph(),
      articleCache: { 'Albert Einstein': { title: 'Albert Einstein' } },
    })
  })

  it('throws SnapshotInvalidError for non-object input', () => {
    expect(() => restoreSnapshot(null)).toThrow(SnapshotInvalidError)
    expect(() => restoreSnapshot('not json')).toThrow(SnapshotInvalidError)
  })

  it('throws SnapshotIncompatibleError for an unknown schema version', () => {
    const snapshot = createSnapshot(makeState())
    snapshot.schemaVersion = '9.0'

    expect(() => restoreSnapshot(snapshot)).toThrow(SnapshotIncompatibleError)
  })

  it('throws SnapshotInvalidError when navigation is missing or not a graph', () => {
    const missing = createSnapshot(makeState())
    delete missing.navigation
    expect(() => restoreSnapshot(missing)).toThrow(SnapshotInvalidError)

    const malformed = createSnapshot(makeState())
    malformed.navigation.graph = { nodes: 'not-an-object' }
    expect(() => restoreSnapshot(malformed)).toThrow(SnapshotInvalidError)
  })

  it('defaults articleCache to an empty object when absent', () => {
    const snapshot = createSnapshot(makeState())
    delete snapshot.articleCache

    expect(restoreSnapshot(snapshot).articleCache).toEqual({})
  })

  describe('migrating a 1.0 snapshot', () => {
    it('rebuilds the linear history as one unbranched journey', () => {
      // Sessions saved before the tree existed are read, not rejected: their
      // flat history is exactly a journey that never branched.
      const { graph, articleCache } = restoreSnapshot(legacySnapshot())

      expect(currentTitle(graph)).toBe('Albert Einstein')
      expect(backTitles(graph)).toEqual(['Physics'])
      expect(articleCache).toEqual({ Physics: { title: 'Physics' } })
    })

    it('keeps a forward stack reachable rather than discarding it', () => {
      const { graph } = restoreSnapshot(
        legacySnapshot({ current: 'Physics', backstack: [], forwardstack: ['Albert Einstein', 'Relativity'] }),
      )

      expect(currentTitle(graph)).toBe('Physics')
      expect(backTitles(graph)).toEqual([])
    })

    it('handles a session that had gone nowhere', () => {
      const { graph } = restoreSnapshot(legacySnapshot({ current: null, backstack: [], forwardstack: [] }))

      expect(currentTitle(graph)).toBeNull()
    })

    it('still rejects a malformed 1.0 snapshot', () => {
      const broken = legacySnapshot()
      broken.navigation.backstack = 'not-an-array'

      expect(() => restoreSnapshot(broken)).toThrow(SnapshotInvalidError)
    })
  })
})
