import { CURRENT_ENGINE_VERSION } from './engineVersion.js'
import { deriveSeed, createRng } from './rng.js'
import { extractFeatureVector } from './featureVector.js'
import { generateTerrain } from './terrain.js'
import { generatePortals } from './portals.js'

const DEFAULT_GRID_SIZE = 128

/**
 * Generates a deterministic World from an Article (docs/model.md).
 * The same articleId + revisionId + engineVersion always produces the
 * same seed, terrain, and portals — only `generatedAt` varies.
 *
 * @param {object} article Article (docs/model.md)
 * @param {{ engineVersion?: string, width?: number, height?: number, now?: () => string }} [options]
 * @returns {object} World (docs/model.md)
 */
export function generateWorld(
  article,
  { engineVersion = CURRENT_ENGINE_VERSION, width = DEFAULT_GRID_SIZE, height = DEFAULT_GRID_SIZE, now = () => new Date().toISOString() } = {},
) {
  const { articleId, latestRevisionId: revisionId } = article

  const seed = deriveSeed({ articleId, revisionId, engineVersion })
  const rng = createRng(seed)
  const featureVector = extractFeatureVector(article)

  const terrain = generateTerrain({ width, height, rng, featureVector })
  const portals = generatePortals(article.links, rng, { width, height })

  return {
    worldId: `${articleId}@${revisionId}:${engineVersion}`,
    articleId,
    revisionId,
    engineVersion,
    seed,
    generatedAt: now(),
    terrain,
    portals,
  }
}
