import { ref } from 'vue'
import { createSnapshot, restoreSnapshot } from '../../core/snapshot/snapshot.js'
import { loadSnapshotFromStorage, saveSnapshotToStorage } from '../../adapters/snapshotStorage.js'
import { t } from '../i18n/banana.js'

/**
 * Orchestrates building/parsing session snapshots and persisting them,
 * kept separate from the traversal/article/world composables so none of
 * them need to know snapshots exist.
 *
 * @param {{
 *   createSnapshotFn?: typeof createSnapshot,
 *   restoreSnapshotFn?: typeof restoreSnapshot,
 *   saveFn?: typeof saveSnapshotToStorage,
 *   loadFn?: typeof loadSnapshotFromStorage,
 * }} [options]
 */
export function useSnapshot({
  createSnapshotFn = createSnapshot,
  restoreSnapshotFn = restoreSnapshot,
  saveFn = saveSnapshotToStorage,
  loadFn = loadSnapshotFromStorage,
} = {}) {
  const errorMessage = ref(null)

  function exportSnapshot(state) {
    errorMessage.value = null
    return createSnapshotFn(state)
  }

  function importSnapshot(rawJson) {
    try {
      const parsed = typeof rawJson === 'string' ? JSON.parse(rawJson) : rawJson
      const restored = restoreSnapshotFn(parsed)
      errorMessage.value = null
      return restored
    } catch (error) {
      errorMessage.value = error?.message ?? t('wikirealms-error-import-snapshot')
      throw error
    }
  }

  function persist(snapshot) {
    saveFn(snapshot)
  }

  function loadPersisted() {
    const raw = loadFn()
    if (!raw) return null

    try {
      return restoreSnapshotFn(raw)
    } catch {
      return null // a corrupted/incompatible persisted snapshot shouldn't block app startup
    }
  }

  return { errorMessage, exportSnapshot, importSnapshot, persist, loadPersisted }
}
