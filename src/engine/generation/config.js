/**
 * Single source of truth for generation engine tunables.
 *
 * Rules for this file:
 * - Every generation module imports its constants from here — never
 *   redefine or duplicate a tunable value in another file.
 * - Group related values together, and document any dependency a group
 *   has on another group directly in the comments (e.g. "assumes GRID").
 * - This project is pre-release with no external snapshots/users yet, so
 *   there's no versioning ceremony around changing these numbers — tune
 *   freely, but keep this the only file that does so.
 */

/**
 * Terrain grid dimensions. Several groups below document an assumption
 * on this size (visual/peak-count budgets); revisit those if this changes
 * substantially.
 */
export const GRID = Object.freeze({
  width: 256,
  height: 256,
})

/**
 * Elevation/moisture thresholds used to classify a cell's biome.
 * Biome is purely a physical/terrain concern (local height + moisture) —
 * independent of article content. Article categories drive a separate
 * global visual "style" layer, not biome placement.
 */
export const BIOME_THRESHOLDS = Object.freeze({
  oceanMaxHeight: 0.32,
  beachMaxHeight: 0.36,
  mountainMinHeight: 0.7,
  snowMinHeight: 0.85,
  forestMinMoisture: 0.5,
})

/**
 * Soft caps used to normalize raw article counts into [0, 1] feature
 * values (see featureVector.js). Each is "the count at which the feature
 * saturates to 1" — a handful more than this doesn't change much.
 */
export const FEATURE_SOFT_CAPS = Object.freeze({
  summaryLength: 1200,
  categoryCount: 15,
  linkCount: 150,
  imageCount: 20,
})

/**
 * Outbound portal generation limits.
 */
export const PORTAL_LIMITS = Object.freeze({
  maxPortals: 24,
})

/**
 * Section/peak hierarchy limits (planned for the section-driven terrain
 * work — see brainstorm notes). Assumes the GRID size above: at ~8px/cell
 * rendering, a peak needs a minimum footprint to stay visually distinct
 * from ordinary noise roughness, which bounds how many peaks can be
 * meaningfully distinguished at once. If GRID grows substantially, these
 * caps can likely grow too — revisit together, don't tune in isolation.
 *
 * Sections beyond these caps are folded into a single aggregate
 * "Miscellaneous" bump for terrain/visual purposes only — their outbound
 * links still generate portals independently (see PORTAL_LIMITS), since a
 * portal is a cheap point-marker, not a full peak.
 */
export const SECTION_LIMITS = Object.freeze({
  maxTopLevelSections: 16,
  maxSubsectionsPerParent: 16,
  maxPeakDepth: 2,
})

/**
 * Boilerplate section titles (case-insensitive) excluded from the terrain
 * peak tree entirely — these are structural Wikipedia conventions (citation
 * lists, link farms), not real article content, and would otherwise
 * dominate the map with noise-inflated "mountains". Their links are also
 * excluded from portal generation implicitly, since citation/external
 * links use rel="mw:ExtLink" rather than the internal rel="mw:WikiLink"
 * our per-section link extraction matches on.
 */
export const EXCLUDED_SECTION_TITLES = Object.freeze([
  'references',
  'external links',
  'see also',
  'further reading',
  'notes',
  'bibliography',
  'notes and references',
  'citations',
])

/**
 * Governs how section/peak nodes are placed and sized on the grid (see
 * layout.js's spiral placement and sectionTerrain.js). Assumes GRID above.
 */
export const PEAK_LAYOUT = Object.freeze({
  topLevelMaxRadiusRatio: 0.38, // fraction of min(width,height) spanned by the top-level spiral
  topLevelInnerRadiusRatio: 0.18, // multi-section articles reserve a central basin instead of forcing one section to the center
  minPeakRadius: 10, // grid cells; below this a peak isn't visually distinct from noise roughness
  childRadiusRatio: 0.68, // a parent's children are placed within this fraction of its own radius
  childInnerRadiusRatio: 0.28, // child peaks begin away from the parent summit so the range has a readable shape
  minTopLevelAmplitude: 0.58, // every retained primary section must rise above sea level
  minSubsectionAmplitude: 0.46, // nested sections remain visible as secondary peaks
  topLevelSigmaRatio: 0.44, // broad base of a section's mountain range
  subsectionSigmaRatio: 0.2, // sharper summits that give the range its subsection shape
})

/**
 * Fractal noise layered on top of the section-driven structural height, for
 * natural roughness/detail. Deliberately a small perturbation, not a
 * replacement for the structural shape — see docs/generation.md brainstorm
 * notes on why moisture stays ambient/independent of article content.
 */
export const TERRAIN_DETAIL = Object.freeze({
  noiseWeight: 0.05, // subtle surface texture; section peaks should define the terrain silhouette
  noiseScale: 18,
  noiseOctaves: 2,
  noisePersistence: 0.45,
})

/**
 * Derives a sea-level shift from the article's total (section) text size:
 * a stub-like article gets a higher effective sea level (smaller exposed
 * landmass), a long/detailed article gets a lower one (bigger landmass).
 * Biome itself stays a pure function of (shifted) height + citation density — see
 * docs/generation.md brainstorm notes — this only shifts height before
 * classification, it does not change the classification thresholds.
 */
export const WATER_LEVEL = Object.freeze({
  articleSizeSoftCap: 20000, // total section text length at which the size signal saturates
  maxShift: 0.2, // maximum height adjustment applied before biome classification
})

/**
 * Citation density thresholds used to classify land biome lushness.
 * Reflects how "cited" or "important" a section is within the article.
 * Thresholds represent the percentile of total article citations for a section:
 * - desert (under-cited): 0-10%
 * - light vegetation (sparse citations): 10-25%
 * - meadow (moderate citations): 25-50%
 * - woodland (well-cited): 50-75%
 * - jungle (heavily-cited): 75%+
 */
export const CITATION_LUSHNESS = Object.freeze({
  desertThreshold: 0.1,
  lightVegThreshold: 0.25,
  meadowThreshold: 0.5,
  woodlandThreshold: 0.75,
})

/**
 * Citation visualization: glowing faerie birds hovering near cited sections.
 */
export const CITATION_FAERIES = Object.freeze({
  glimmerMax: 3, // small glimmer: 1-3 citations
  faerieMax: 7, // bright faerie: 4-7 citations
  // 8+ citations: a prominent faerie flock
  hoverAmplitude: 1.4,
  hoverFrequency: 0.6,
})

