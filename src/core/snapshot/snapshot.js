/**
 * Portable session snapshot format (see docs/snapshot-format.md).
 * Pure and isolated from storage/UI: this module only builds and
 * validates plain JSON-serializable snapshot objects.
 */
import { APP_VERSION } from '../../appInfo.js'
import { DEFAULT_LANGUAGE, articleCacheKey, normalizeLanguage } from '../i18n/wikipediaEditions.js'
import {
  createVisitGraph,
  fromLinearHistory,
  fromVisitTree,
  isVisitGraph,
  migrateJourneyLanguages,
} from '../traversal/visitGraph.js'

export const SCHEMA_VERSION = '4.0'

/** Read, migrated, and never written again. */
const LEGACY_SCHEMA_VERSIONS = ['1.0', '2.0', '3.0']
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
 * Schema 4.0 keys realms by language+title (`r:en:Saturn`) so multiple
 * Wikipedia editions can share one session without colliding.
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
 * Rewrites title-only article cache keys to `language:title`.
 * @param {Record<string, object>} cache
 * @param {string} [language]
 */
function migrateArticleCache(cache, language = DEFAULT_LANGUAGE) {
  const code = normalizeLanguage(language)
  const next = {}
  for (const [key, article] of Object.entries(cache)) {
    const lang = article?.language ? normalizeLanguage(article.language) : code
    const title = article?.title ?? (key.includes(':') ? key.slice(key.indexOf(':') + 1) : key)
    // Already language-keyed and matches the article language.
    if (key === articleCacheKey(lang, title)) {
      next[key] = { ...article, language: lang }
      continue
    }
    // Legacy title-only key, or mismatched key — re-key.
    next[articleCacheKey(lang, title)] = { ...article, language: lang, title }
  }
  return next
}

/**
 * Validates a snapshot and returns the journey it holds.
 *
 * Older schemas are MIGRATED rather than rejected: 3.0 title-only realm
 * ids become `r:en:Title` (or the language carried on cached articles),
 * 2.0 trees and 1.0 stacks become journeys the same way as before.
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

  let articleCache = { ...(snapshot.articleCache ?? {}) }

  if (isLegacy) {
    // 2.0 stored a tree of ARRIVALS, which recorded the same realm twice
    // when it was reached twice and could not hold a loop at all. Realms
    // merge by title on the way in.
    if (schemaVersion === '2.0') {
      if (!snapshot.navigation.graph?.nodes) {
        throw new SnapshotInvalidError('Snapshot "navigation" is missing a visit tree')
      }
      return {
        graph: fromVisitTree(snapshot.navigation.graph),
        articleCache: migrateArticleCache(articleCache),
      }
    }

    if (schemaVersion === '1.0') {
      const { current, backstack, forwardstack } = snapshot.navigation
      if (!Array.isArray(backstack) || !Array.isArray(forwardstack)) {
        throw new SnapshotInvalidError('Snapshot "navigation" backstack/forwardstack must be arrays')
      }
      return {
        graph: fromLinearHistory({ current, backstack, forwardstack }),
        articleCache: migrateArticleCache(articleCache),
      }
    }

    // 3.0: title-only realm ids → language-aware.
    if (!isVisitGraph(snapshot.navigation.graph)) {
      throw new SnapshotInvalidError('Snapshot "navigation" is missing a valid journey')
    }
    articleCache = migrateArticleCache(articleCache)
    return {
      graph: migrateJourneyLanguages(snapshot.navigation.graph, DEFAULT_LANGUAGE),
      articleCache,
    }
  }

  if (!isVisitGraph(snapshot.navigation.graph)) {
    throw new SnapshotInvalidError('Snapshot "navigation" is missing a valid journey')
  }

  return {
    graph: migrateJourneyLanguages(snapshot.navigation.graph, DEFAULT_LANGUAGE),
    articleCache: migrateArticleCache(articleCache),
  }
}
