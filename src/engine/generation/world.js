import { CURRENT_ENGINE_VERSION } from './engineVersion.js'
import { deriveSeed, createRng } from './rng.js'
import { applyPeakLimits } from './sectionPeakLimits.js'
import { flattenPeaks, generateSectionTerrain } from './sectionTerrain.js'
import { generateSectionPortals } from './sectionPortals.js'
import { GRID, PEAK_LAYOUT } from './config.js'

const EMPTY_SECTION_TREE = { lead: { ownSize: 0, links: [] }, sections: [], totalSize: 0 }

/**
 * Generates a deterministic World from an Article (docs/model.md).
 * The same articleId + revisionId + engineVersion always produces the
 * same seed, terrain, and portals — only `generatedAt` varies.
 *
 * Terrain and portals are driven by the article's section tree
 * (article.sections, from parseSectionTree.js) — see docs/generation.md
 * for the section/peak brainstorm this implements. An article without a
 * section tree (e.g. sections fetch not wired up yet) degrades to an
 * empty tree rather than throwing.
 *
 * @param {object} article Article (docs/model.md)
 * @param {{ engineVersion?: string, width?: number, height?: number, now?: () => string }} [options]
 * @returns {object} World (docs/model.md)
 */
export function generateWorld(
  article,
  { engineVersion = CURRENT_ENGINE_VERSION, width = GRID.width, height = GRID.height, now = () => new Date().toISOString() } = {},
) {
  const { articleId, latestRevisionId: revisionId } = article
  const sectionTree = article.sections ?? EMPTY_SECTION_TREE

  const seed = deriveSeed({ articleId, revisionId, engineVersion })
  const rng = createRng(seed)

  const cappedSections = applyPeakLimits(sectionTree.sections)
  const layoutBounds = {
    centerX: width / 2,
    centerY: height / 2,
    maxRadius: Math.min(width, height) * PEAK_LAYOUT.topLevelMaxRadiusRatio,
  }
  const peaks = flattenPeaks(cappedSections, layoutBounds)

  const terrain = generateSectionTerrain({
    width,
    height,
    rng,
    peaks,
    totalArticleSize: sectionTree.totalSize,
  })
  const portals = generateSectionPortals(sectionTree, peaks, rng, { width, height })

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

