/**
 * Portable session snapshot format (see docs/snapshot-format.md).
 * Pure and isolated from storage/UI: this module only builds and
 * validates plain JSON-serializable snapshot objects.
 */
import { APP_VERSION } from '../../appInfo.js'

export const SCHEMA_VERSION = '1.0'
export { APP_VERSION }

export class SnapshotInvalidError extends Error {
  constructor(message) {
    super(message)
    this.name = 'SnapshotInvalidError'
  }
}

export class SnapshotIncompatibleError extends Error {
  constructor(message) {
    super(message)
    this.name = 'SnapshotIncompatibleError'
  }
}

/**
 * Builds a portable snapshot of the current session's navigation state
 * and article cache.
 * @param {{
 *   current: string|null,
 *   backstack: string[],
 *   forwardstack: string[],
 *   articleCache?: Record<string, object>,
 *   engineVersion: string,
 *   now?: () => string,
 * }} state
 */
export function createSnapshot({
  current,
  backstack,
  forwardstack,
  articleCache = {},
  engineVersion,
  now = () => new Date().toISOString(),
}) {
  return {
    schemaVersion: SCHEMA_VERSION,
    createdAt: now(),
    appVersion: APP_VERSION,
    engineVersion,
    worlds: {},
    navigation: {
      current: current ?? null,
      backstack: [...backstack],
      forwardstack: [...forwardstack],
    },
    articleCache: { ...articleCache },
    generationCache: {},
    uiState: {},
  }
}

/**
 * Validates and extracts navigation/article-cache state from a snapshot.
 * Only the current SCHEMA_VERSION is supported in v1 — older/newer
 * schemas are rejected rather than silently misinterpreted.
 * @param {object} snapshot
 * @returns {{ current: string|null, backstack: string[], forwardstack: string[], articleCache: Record<string, object> }}
 */
export function restoreSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    throw new SnapshotInvalidError('Snapshot must be an object')
  }

  if (snapshot.schemaVersion !== SCHEMA_VERSION) {
    throw new SnapshotIncompatibleError(
      `Unsupported snapshot schema version "${snapshot.schemaVersion}" (expected "${SCHEMA_VERSION}")`,
    )
  }

  if (!snapshot.navigation || typeof snapshot.navigation !== 'object') {
    throw new SnapshotInvalidError('Snapshot is missing "navigation" state')
  }

  const { current, backstack, forwardstack } = snapshot.navigation
  if (!Array.isArray(backstack) || !Array.isArray(forwardstack)) {
    throw new SnapshotInvalidError('Snapshot "navigation" backstack/forwardstack must be arrays')
  }

  return {
    current: current ?? null,
    backstack: [...backstack],
    forwardstack: [...forwardstack],
    articleCache: { ...(snapshot.articleCache ?? {}) },
  }
}
