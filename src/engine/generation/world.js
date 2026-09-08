import { CURRENT_ENGINE_VERSION } from './engineVersion.js'
import { deriveSeed, createRng } from './rng.js'
import { applyPeakLimits } from './sectionPeakLimits.js'
import { annotateSectionIndices, flattenPeaks, generateSectionTerrain, separateSections } from './sectionTerrain.js'
import { generateSectionPortals } from './sectionPortals.js'
import { computeArticleCitationRate } from './lushness.js'
import { GRID, PEAK_LAYOUT, POLAR_CAPS } from './config.js'

const EMPTY_SECTION_TREE = {
  lead: { ownSize: 0, links: [], citationCount: 0, sentenceCount: 0 },
  sections: [],
  totalSize: 0,
  citationCount: 0,
  sentenceCount: 0,
}

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
  // Sections spread around the whole globe in longitude (hence `width`,
  // not min(width,height)) but stay in a latitude band via yScale, so the
  // polar caps remain open ocean. Footprint size is scaled separately —
  // see flattenPeaks.
  const layoutBounds = {
    centerX: width / 2,
    centerY: height / 2,
    maxRadius: width * PEAK_LAYOUT.topLevelSpreadRatio,
    minRadius: width * PEAK_LAYOUT.topLevelInnerSpreadRatio,
    yScale: PEAK_LAYOUT.latitudeCompression,
    peakRadiusScale: Math.min(width, height) * PEAK_LAYOUT.peakRadiusRatio,
    // Subsections raise the continental base now, so a long north-south
    // ridge could march land straight into a polar icecap. Clamping the
    // spine keeps open water between the continents and the caps.
    latitudeBand: {
      min: POLAR_CAPS.reachRows + PEAK_LAYOUT.polarClearanceRows,
      max: height - 1 - POLAR_CAPS.reachRows - PEAK_LAYOUT.polarClearanceRows,
    },
  }
  // Spread sections apart AFTER layout: how much room each one needs
  // depends on the subsection ridge it ended up with, which the spiral
  // that placed it cannot know.
  const peaks = separateSections(annotateSectionIndices(flattenPeaks(cappedSections, layoutBounds)), {
    width,
    minY: layoutBounds.latitudeBand.min,
    maxY: layoutBounds.latitudeBand.max,
    gap: PEAK_LAYOUT.sectionSeparationGap,
  })

  const terrain = generateSectionTerrain({
    width,
    height,
    rng,
    peaks,
    totalArticleSize: sectionTree.totalSize,
    // Derived from the whole tree, not from the capped peaks: how well
    // the article cites is a fact about the article, and folding its
    // smallest sections into one peak must not change it.
    articleCitationRate: computeArticleCitationRate(sectionTree),
  })
  const portals = generateSectionPortals(sectionTree, peaks, rng, { width, height })

  return {
    worldId: `${articleId}@${revisionId}:${engineVersion}`,
    articleId,
    revisionId,
    engineVersion,
    seed,
    generatedAt: now(),
    citationCount: sectionTree.citationCount ?? 0,
    terrain,
    portals,
  }
}

