/**
 * Detects whether a previously generated world may be stale: the article
 * it was generated from has since received a newer revision. Pure and
 * simple by design — richer staleness/caching behavior is deferred until
 * the app actually caches worlds across sessions (see docs/roadmap.md).
 *
 * @param {string|number|null|undefined} previousRevisionId revision the world was generated from
 * @param {string|number|null|undefined} currentRevisionId the article's freshly fetched revision
 * @returns {boolean}
 */
export function isWorldStale(previousRevisionId, currentRevisionId) {
  if (previousRevisionId == null || currentRevisionId == null) return false
  return previousRevisionId !== currentRevisionId
}
