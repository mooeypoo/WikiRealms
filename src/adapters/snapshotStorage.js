const STORAGE_KEY = 'wikirealms:snapshot'

function defaultStorage() {
  return typeof localStorage !== 'undefined' ? localStorage : undefined
}

/**
 * Persists a snapshot to storage (defaults to browser localStorage).
 * Silently no-ops if no storage is available.
 * @param {object} snapshot
 * @param {{ storage?: Storage }} [options]
 */
export function saveSnapshotToStorage(snapshot, { storage = defaultStorage() } = {}) {
  storage?.setItem(STORAGE_KEY, JSON.stringify(snapshot))
}

/**
 * Reads a previously persisted snapshot, if any.
 * @param {{ storage?: Storage }} [options]
 * @returns {object|null}
 */
export function loadSnapshotFromStorage({ storage = defaultStorage() } = {}) {
  const raw = storage?.getItem(STORAGE_KEY)
  return raw ? JSON.parse(raw) : null
}

/**
 * Removes any persisted snapshot.
 * @param {{ storage?: Storage }} [options]
 */
export function clearSnapshotFromStorage({ storage = defaultStorage() } = {}) {
  storage?.removeItem(STORAGE_KEY)
}
