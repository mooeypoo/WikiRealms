import { describe, expect, it } from 'vitest'
import {
  clearSnapshotFromStorage,
  loadSnapshotFromStorage,
  saveSnapshotToStorage,
} from '../../src/adapters/snapshotStorage.js'

function makeFakeStorage() {
  const data = new Map()
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  }
}

describe('snapshotStorage', () => {
  it('round-trips a snapshot through save/load', () => {
    const storage = makeFakeStorage()
    const snapshot = { schemaVersion: '1.0', navigation: { current: 'A', backstack: [], forwardstack: [] } }

    saveSnapshotToStorage(snapshot, { storage })

    expect(loadSnapshotFromStorage({ storage })).toEqual(snapshot)
  })

  it('returns null when nothing has been saved', () => {
    const storage = makeFakeStorage()

    expect(loadSnapshotFromStorage({ storage })).toBeNull()
  })

  it('clears a saved snapshot', () => {
    const storage = makeFakeStorage()
    saveSnapshotToStorage({ schemaVersion: '1.0' }, { storage })

    clearSnapshotFromStorage({ storage })

    expect(loadSnapshotFromStorage({ storage })).toBeNull()
  })

  it('does not throw when no storage is available', () => {
    expect(() => saveSnapshotToStorage({ a: 1 }, { storage: null })).not.toThrow()
    expect(loadSnapshotFromStorage({ storage: null })).toBeNull()
    expect(() => clearSnapshotFromStorage({ storage: null })).not.toThrow()
  })
})
