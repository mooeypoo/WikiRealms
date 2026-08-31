import { describe, expect, it, vi } from 'vitest'
import { useSnapshot } from '../../../src/ui/composables/useSnapshot.js'

function makeState(overrides = {}) {
  return { current: 'A', backstack: [], forwardstack: [], articleCache: {}, engineVersion: 'v1', ...overrides }
}

describe('useSnapshot', () => {
  it('exportSnapshot delegates to createSnapshotFn', () => {
    const createSnapshotFn = vi.fn().mockReturnValue({ schemaVersion: '1.0' })
    const { exportSnapshot } = useSnapshot({ createSnapshotFn })

    const snapshot = exportSnapshot(makeState())

    expect(createSnapshotFn).toHaveBeenCalledWith(makeState())
    expect(snapshot).toEqual({ schemaVersion: '1.0' })
  })

  it('importSnapshot parses JSON strings and restores via restoreSnapshotFn', () => {
    const restored = { current: 'A', backstack: [], forwardstack: [], articleCache: {} }
    const restoreSnapshotFn = vi.fn().mockReturnValue(restored)
    const { importSnapshot, errorMessage } = useSnapshot({ restoreSnapshotFn })

    const result = importSnapshot('{"schemaVersion":"1.0"}')

    expect(restoreSnapshotFn).toHaveBeenCalledWith({ schemaVersion: '1.0' })
    expect(result).toBe(restored)
    expect(errorMessage.value).toBeNull()
  })

  it('importSnapshot sets an error message and rethrows on invalid JSON', () => {
    const { importSnapshot, errorMessage } = useSnapshot()

    expect(() => importSnapshot('not json')).toThrow()
    expect(errorMessage.value).toBeTruthy()
  })

  it('importSnapshot sets an error message and rethrows when restoreSnapshotFn rejects it', () => {
    const restoreSnapshotFn = vi.fn().mockImplementation(() => {
      throw new Error('incompatible version')
    })
    const { importSnapshot, errorMessage } = useSnapshot({ restoreSnapshotFn })

    expect(() => importSnapshot('{}')).toThrow('incompatible version')
    expect(errorMessage.value).toBe('incompatible version')
  })

  it('persist delegates to saveFn', () => {
    const saveFn = vi.fn()
    const { persist } = useSnapshot({ saveFn })

    persist({ schemaVersion: '1.0' })

    expect(saveFn).toHaveBeenCalledWith({ schemaVersion: '1.0' })
  })

  it('loadPersisted returns null when nothing is stored', () => {
    const loadFn = vi.fn().mockReturnValue(null)
    const { loadPersisted } = useSnapshot({ loadFn })

    expect(loadPersisted()).toBeNull()
  })

  it('loadPersisted restores a stored snapshot', () => {
    const restored = { current: 'A', backstack: [], forwardstack: [], articleCache: {} }
    const loadFn = vi.fn().mockReturnValue({ schemaVersion: '1.0' })
    const restoreSnapshotFn = vi.fn().mockReturnValue(restored)
    const { loadPersisted } = useSnapshot({ loadFn, restoreSnapshotFn })

    expect(loadPersisted()).toBe(restored)
  })

  it('loadPersisted returns null (without throwing) for a corrupted/incompatible stored snapshot', () => {
    const loadFn = vi.fn().mockReturnValue({ schemaVersion: '999' })
    const restoreSnapshotFn = vi.fn().mockImplementation(() => {
      throw new Error('incompatible')
    })
    const { loadPersisted } = useSnapshot({ loadFn, restoreSnapshotFn })

    expect(loadPersisted()).toBeNull()
  })
})
