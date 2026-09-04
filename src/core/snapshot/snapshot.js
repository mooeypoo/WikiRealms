/**
 * Portable session snapshot format (see docs/snapshot-format.md).
 * Pure and isolated from storage/UI: this module only builds and
 * validates plain JSON-serializable snapshot objects.
 */
import { APP_VERSION } from '../../appInfo.js'
import { createVisitGraph, fromLinearHistory, isVisitGraph } from '../traversal/visitGraph.js'

export const SCHEMA_VERSION = '2.0'

/** Read, migrated, and never written again. */
const LEGACY_SCHEMA_VERSIONS = ['1.0']
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
 * Builds a portable snapshot of the current session's journey and article
 * cache.
 *
 * Schema 2.0 stores the visit GRAPH rather than two flat stacks, because the
 * stacks could not represent a journey that branched — the shape a viewer
 * actually produces the moment they backtrack and take a different portal.
 *
 * @param {{
 *   graph: object,
 *   articleCache?: Record<string, object>,
 *   engineVersion: string,
 *   now?: () => string,
 * }} state
 */
export function createSnapshot({
  graph,
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
      graph: graph ?? createVisitGraph(),
    },
    articleCache: { ...articleCache },
    generationCache: {},
    uiState: {},
  }
}

/**
 * Validates a snapshot and returns the journey it holds.
 *
 * A 1.0 snapshot is MIGRATED rather than rejected: its linear history
 * becomes a single unbranched journey, which is exactly what it recorded.
 * Anything else is refused rather than guessed at.
 *
 * @param {object} snapshot
 * @returns {{ graph: object, articleCache: Record<string, object> }}
 */
export function restoreSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    throw new SnapshotInvalidError('Snapshot must be an object')
  }

  const { schemaVersion } = snapshot
  const isLegacy = LEGACY_SCHEMA_VERSIONS.includes(schemaVersion)

  if (schemaVersion !== SCHEMA_VERSION && !isLegacy) {
    throw new SnapshotIncompatibleError(
      `Unsupported snapshot schema version "${schemaVersion}" (expected "${SCHEMA_VERSION}")`,
    )
  }

  if (!snapshot.navigation || typeof snapshot.navigation !== 'object') {
    throw new SnapshotInvalidError('Snapshot is missing "navigation" state')
  }

  const articleCache = { ...(snapshot.articleCache ?? {}) }

  if (isLegacy) {
    const { current, backstack, forwardstack } = snapshot.navigation
    if (!Array.isArray(backstack) || !Array.isArray(forwardstack)) {
      throw new SnapshotInvalidError('Snapshot "navigation" backstack/forwardstack must be arrays')
    }
    return { graph: fromLinearHistory({ current, backstack, forwardstack }), articleCache }
  }

  if (!isVisitGraph(snapshot.navigation.graph)) {
    throw new SnapshotInvalidError('Snapshot "navigation" is missing a valid visit graph')
  }

  return { graph: snapshot.navigation.graph, articleCache }
}
