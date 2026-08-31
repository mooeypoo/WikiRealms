import { describe, expect, it } from 'vitest'
import {
  SCHEMA_VERSION,
  SnapshotIncompatibleError,
  SnapshotInvalidError,
  createSnapshot,
  restoreSnapshot,
} from '../../../src/core/snapshot/snapshot.js'

function makeState(overrides = {}) {
  return {
    current: 'Albert Einstein',
    backstack: ['Physics'],
    forwardstack: [],
    articleCache: { 'Albert Einstein': { title: 'Albert Einstein' } },
    engineVersion: 'v1',
    ...overrides,
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
      navigation: { current: 'Albert Einstein', backstack: ['Physics'], forwardstack: [] },
      articleCache: { 'Albert Einstein': { title: 'Albert Einstein' } },
      generationCache: {},
      uiState: {},
    })
  })

  it('defaults current to null and copies arrays/objects instead of aliasing them', () => {
    const backstack = ['A']
    const snapshot = createSnapshot(makeState({ current: null, backstack }))

    expect(snapshot.navigation.current).toBeNull()
    backstack.push('B')
    expect(snapshot.navigation.backstack).toEqual(['A']) // unaffected by later mutation
  })
})

describe('restoreSnapshot', () => {
  it('extracts navigation and article cache from a valid snapshot', () => {
    const snapshot = createSnapshot(makeState())

    expect(restoreSnapshot(snapshot)).toEqual({
      current: 'Albert Einstein',
      backstack: ['Physics'],
      forwardstack: [],
      articleCache: { 'Albert Einstein': { title: 'Albert Einstein' } },
    })
  })

  it('throws SnapshotInvalidError for non-object input', () => {
    expect(() => restoreSnapshot(null)).toThrow(SnapshotInvalidError)
    expect(() => restoreSnapshot('not json')).toThrow(SnapshotInvalidError)
  })

  it('throws SnapshotIncompatibleError for a mismatched schema version', () => {
    const snapshot = createSnapshot(makeState())
    snapshot.schemaVersion = '2.0'

    expect(() => restoreSnapshot(snapshot)).toThrow(SnapshotIncompatibleError)
  })

  it('throws SnapshotInvalidError when navigation is missing or malformed', () => {
    const snapshot = createSnapshot(makeState())
    delete snapshot.navigation

    expect(() => restoreSnapshot(snapshot)).toThrow(SnapshotInvalidError)

    const snapshot2 = createSnapshot(makeState())
    snapshot2.navigation.backstack = 'not-an-array'
    expect(() => restoreSnapshot(snapshot2)).toThrow(SnapshotInvalidError)
  })

  it('defaults articleCache to an empty object when absent', () => {
    const snapshot = createSnapshot(makeState())
    delete snapshot.articleCache

    expect(restoreSnapshot(snapshot).articleCache).toEqual({})
  })
})
