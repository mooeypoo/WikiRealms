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
 *
 * The 2:1 aspect is load-bearing for the planet view: the grid is treated
 * as an equirectangular map, so `width` columns span 360° of longitude and
 * `height` rows span 180° of latitude. A square grid would stretch every
 * landmass 2× east-west once wrapped onto a sphere.
 *
 * Peak sizing below keys off min(width, height), which is unchanged from
 * the old 256² grid — the extra columns add ocean, not smaller land. That
 * also puts the ±180° meridian (the seam) and both poles in deep water,
 * where the discontinuity is invisible and sits under the water surface.
 */
export const GRID = Object.freeze({
  width: 512,
  height: 256,
})

/**
 * Where the water stops. Below oceanMaxHeight a cell is sea, and the
 * strip up to beachMaxHeight is shore; everything above is land, and what
 * colour that land takes is the section's lushness (see LUSHNESS below),
 * not a terrain property.
 *
 * Rock and snow used to live here too, as mountainMinHeight and
 * snowMinHeight. They are altitude COVER now rather than thresholds — see
 * ALTITUDE.
 *
 * There is no moisture here any more either. Biome was once a purely
 * physical concern — local height plus an ambient noise field — and
 * moisture chose between plains and forest. Citations replaced that, and
 * forestMinMoisture sat here unread for as long.
 */
export const BIOME_THRESHOLDS = Object.freeze({
  oceanMaxHeight: 0.32,
  beachMaxHeight: 0.36,
})

/**
 * Altitude, as a second axis over the top of lushness rather than a
 * replacement for it.
 *
 * Height used to REPLACE a cell's lushness band outright: past 0.7 the
 * ground became bare rock and past 0.85 it became snow, whatever the
 * section cited. Three things were wrong with that. It drew a hard
 * contour line at exactly 0.7 on every peak in the world. It deleted all
 * foliage above the line, because no variants were registered for rock or
 * snow. And measured on the story fixture it took 24% of land — with the
 * 0.7 line sitting at about the 89th percentile of land height, so it ate
 * precisely the summits a reader looks at.
 *
 * Now rock and snow arrive as smooth cover, and the rock itself is
 * tinted by lushness, so a well-cited summit reads as damp, mossy stone
 * and a barren one as dry scree. The signal survives all the way up.
 *
 * Each pair is a smoothstep band: nothing below `start`, complete at
 * `full`. They overlap on purpose — snow begins before rock has finished,
 * so there is no altitude at which the ground is uniformly one thing.
 *
 * All four heights are placed against the MEASURED distribution of land
 * height, which on the story fixture runs p50 0.50, p75 0.60, p90 0.72,
 * p99 0.96. A band that starts at 0.5 is not a mountain band, it is half
 * the world — the first cut of this group put the treeline there and
 * thinned the foliage on every second cell of open lowland.
 */
export const ALTITUDE = Object.freeze({
  // Bare stone showing through the vegetation. Starts around the 78th
  // percentile of land height, so it reads as high ground rather than as
  // a wash over the whole map.
  rockStart: 0.62,
  rockFull: 0.86,
  // Snow lying on top of whatever the rock band left.
  snowStart: 0.82,
  snowFull: 0.97,
  // The treeline: foliage density falls off across this band rather than
  // vanishing at a line. Deliberately BELOW rockStart — trees thin out
  // before the stone starts showing, which is the order it happens in.
  treelineStart: 0.58,
  treelineEnd: 0.86,
  // Where one kind of tree gives way to another (see foliage.js
  // resolveArchetypeForAltitude). Broadleaf turns to conifer well before
  // the treeline starts, and conifer to stunted krummholz inside it, so a
  // slope changes in KIND as it climbs rather than only thinning out.
  coniferStart: 0.52,
  krummholzStart: 0.74,
  // How far a fully-lush section lifts its own treeline, in height units.
  // Wetter ground grows trees higher up a real mountain, so this reads as
  // geography rather than as a second helping of the same signal — and it
  // gives a well-cited range a visibly greener silhouette.
  treelineLushnessLift: 0.1,
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
  // Portals sit between these fractions of their region's footprint
  // radius: far enough out to clear the section's summit marker, far
  // enough in to still read as "inside this section's land".
  minFootprintFraction: 0.18,
  maxFootprintFraction: 0.92,
  // Lead-section links belong to the article as a whole rather than to
  // any one mountain, so they get a central region sized to this
  // fraction of the smaller grid axis.
  leadRegionRadiusRatio: 0.3,
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
  // How far apart top-level sections are SPREAD, as a fraction of the
  // grid WIDTH (i.e. of 360° of longitude). Sections used to be packed
  // into a min(width,height) disc, which fused them into one
  // mountain-range island on the flat map and left most of the planet
  // empty ocean. Spreading them around the globe is what makes each
  // section read as its own landmass. Requires the seam-wrapping in
  // sectionTerrain.js — at this spread, land crosses the ±180° meridian.
  topLevelSpreadRatio: 0.46,
  topLevelInnerSpreadRatio: 0.14, // multi-section articles reserve a central basin instead of forcing one section to the center
  minPeakRadius: 10, // grid cells; below this a peak isn't visually distinct from noise roughness
  // Scales a section's footprint from its share of the article, as a
  // fraction of min(width,height). Separate from the spread ratio above
  // so widening the spread doesn't inflate every section to the cap.
  peakRadiusRatio: 0.28,
  // Upper bound on a peak's footprint, as a fraction of min(width,height).
  // A peak's radius is maxRadius * sqrt(its share of the article), so an
  // article with FEW sections gives each one an enormous footprint — a
  // 2-section stub used to get radius ~69, whose continental skirt
  // (sigma 2.2x, see TERRAIN_GENERATION) blanketed the whole grid. That
  // read as "stub = more land than a featured article", inverting the
  // size signal WATER_LEVEL is trying to send, and on the planet it
  // wrapped land over the poles as a pinched wedge.
  maxPeakRadiusRatio: 0.14,
  childRadiusRatio: 0.68, // a parent's children are placed within this fraction of its own radius
  childInnerRadiusRatio: 0.28, // child peaks begin away from the parent summit so the range has a readable shape
  minTopLevelAmplitude: 0.42, // smaller primary sections stay distinct without matching major ranges in height
  minSubsectionAmplitude: 0.3, // nested sections read as lower ridges within their parent range
  topLevelSigmaRatio: 0.58, // broad primary shoulders and foothills around each section summit
  subsectionSigmaRatio: 0.32, // broad secondary ridges within their parent mountain range
  // Baseline stretch of every peak's own Gaussian along its axis. A
  // section's overall SHAPE no longer comes from here — it emerges from
  // the chain of subsection contributions strung along its wandering
  // ridge (see TERRAIN_GENERATION.continent.subsectionRadiusRatio). This
  // just keeps individual peaks off being perfect circles.
  minSectionElongation: 1.25,
  // Subsection ridge geometry (see computeRidgePath). The spine.s
  // half-length is the greater of this multiple of the parent's radius
  // and what ridgeMinSpacing demands for the child count, so long ranges
  // stretch out instead of packing tighter. Curvature bows the spine;
  // jitter knocks individual peaks off the curve so it isn't a drawn arc.
  ridgeHalfLengthRatio: 0.95,
  // Centre-to-centre grid cells between adjacent summits. A subsection
  // peak's sigma is ~7 cells, so anything under ~2 sigma smears them
  // into an unreadable ridge.
  ridgeMinSpacing: 15,
  // Lateral swing of the spine as a fraction of its half-length. This is
  // what turns a drawn arc into something that reads as geology — and,
  // because a wandering path is longer than the straight line between its
  // ends, it also buys adjacent summits more separation for free.
  ridgeWander: 0.34,
  // Clear grid cells required between two sections' footprints once
  // they've been pushed apart (see separateSections). Sized to cover the
  // halo margin drawn on either side plus visible water between them.
  sectionSeparationGap: 16,
  // Rows of open water to keep between a subsection ridge and the polar
  // icecaps. Subsections build land (see TERRAIN_GENERATION.continent),
  // so without this a long north-south spine welds a continent to a cap.
  polarClearanceRows: 22,
  // Vertical squash on peak PLACEMENT (not peak radii — see layout.js).
  // Grid rows are latitude in the planet view, and an uncompressed spiral
  // plus outward-spiralling subsections puts land over both poles, where
  // equirectangular longitude compression pinches it. This keeps the
  // continents off the polar caps; the value is tuned so a maximal
  // article's land stops short of the pole rows entirely.
  latitudeCompression: 0.20,
})

/**
 * Small snowy islands centred on each pole.
 *
 * The latitude band that keeps continents off the poles (see
 * PEAK_LAYOUT.latitudeCompression) leaves both caps as empty ocean, which
 * reads as an unfinished planet. These fill them with a modest icecap.
 *
 * Being centred ON the pole is what makes them safe: they cover every
 * longitude at the top and bottom rows, so they converge to a smooth cap
 * rather than the pinched wedge that arbitrary land near a pole produces.
 * `reachRows` is deliberately small — these are landmarks, not continents.
 */
export const POLAR_CAPS = Object.freeze({
  reachRows: 9, // rows from the pole the cap can reach, out of GRID.height
  // How deeply the noise bites into the disc. 0 would be a perfect
  // circle — the thing that made every other landmass look artificial.
  roughness: 0.5,
  noiseScale: 16,
  noiseOctaves: 2,
  noisePersistence: 0.5,
  // Height added at the pole, on top of sea level. Deliberately shallow —
  // these read as ice floes just clearing the water, not as a third
  // mountain range competing with the article's own sections.
  peakLift: 0.09,
})

/**
 * Fractal noise layered on top of the section-driven structural height, for
 * natural roughness/detail. Deliberately a small perturbation, not a
 * replacement for the structural shape — the section peaks define the
 * silhouette and this only roughens it.
 */
export const TERRAIN_DETAIL = Object.freeze({
  noiseWeight: 0.05, // subtle surface texture; section peaks should define the terrain silhouette
  noiseScale: 18,
  noiseOctaves: 2,
  noisePersistence: 0.45,
  smoothingPasses: 2, // rounds grid-scale spikes without changing the section layout
  smoothingStrength: 0.18,
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
 * Land lushness: how a section's citation habits become ground cover.
 *
 * The signal is a single scalar in [0, 1] per section (see lushness.js),
 * built in four steps, and the bands below are cut points on it. The
 * previous system compared a section's raw citations-per-sentence against
 * ABSOLUTE thresholds, which had two consequences worth not repeating:
 * only two of its five bands ever rendered on a normal article, and the
 * whole map slid with the article's overall citation rate, so the
 * within-article comparison — the one a reader can actually act on while
 * standing in a world — was lost.
 *
 * Every value here is a tunable of the continuous curve, not a cliff.
 *
 * CALIBRATED against live English Wikipedia — see
 * scripts/calibrate-bands.mjs, which is how these numbers were chosen and
 * how to re-choose them. Measured over ten articles from a stub to a
 * featured one:
 *
 *   article rate (citations per sentence)  0.185 to 0.922, median 0.640
 *   within-article spread                  0.00 to 3.61 doublings, median 1.01
 *
 * The first of those figures is nearly double what this plan estimated
 * before anyone measured it. Real Wikipedia cites far more densely than
 * "0.2 to 0.4 even for well-cited articles" — Jupiter runs at 0.92 and
 * Barack Obama at 0.85 — which had put articleRateSaturation below the
 * rate of the WORST article in the sample, so the absolute ceiling never
 * engaged for anything at all.
 */
export const LUSHNESS = Object.freeze({
  // Step 1, shrinkage. A section's rate is pulled toward the article's
  // own rate by this many notional sentences, so a short section reads as
  // "typical for this article" rather than as an extreme. Without it a
  // one-sentence section carrying one citation scored 1.0 citations per
  // sentence and rendered as the lushest land on the map — the most
  // extreme reading from the least evidence.
  shrinkageSentences: 6,

  // Step 3, how far from the article's own rate the scale reaches, in
  // doublings. At 0.7, a section cited 2^0.7 = 1.62x the article's own
  // rate saturates the top of the scale, and one cited 1/1.62x saturates
  // the bottom. Doublings rather than a linear ratio because "twice as
  // cited" is the same perceptual step wherever it starts.
  //
  // Chosen by sweeping 0.5 to 1.5 against ten live articles and counting
  // how many of the six bands each world actually shows. Mean bands per
  // article: 3.63 at 0.5, 3.75 at 0.6, 3.88 at 0.7, 3.50 at 0.8, 3.38 at
  // 1.0, 2.50 at 1.5. Wide scales fail the way the ORIGINAL system did —
  // everything piles into two or three bands — because the median
  // within-article spread is only about one doubling. Narrow is right
  // here, and the shrinkage above is what stops that sensitivity
  // amplifying noise.
  //
  // The articles with a much wider spread (Cyclone Tracy at 3.61
  // doublings, Cassini Division at 2.90) do clip a section to each end of
  // the scale. That is the intended trade: widening the scale to fit them
  // would flatten every median article, and a section cited a fifth as
  // often as its neighbours has genuinely bottomed out.
  spanDoublings: 0.7,

  // Step 4, the absolute ceiling. An article whose overall rate reaches
  // this many citations per sentence can use the full scale; below it,
  // the scale is compressed toward the floor, so a barely-cited article's
  // best section cannot read as lush. This replaces a binary switch at
  // 0.15 that made two articles either side of it render visibly
  // differently.
  //
  // 0.6, just under the measured median of 0.640, so a typical article
  // gets nearly the whole scale and a poorly-sourced one is held down.
  // Was 0.35, which is BELOW the rate of the worst article in the sample
  // (a list article at 0.185) — the ceiling was therefore inert, and
  // "List of Doctor Who episodes", with twelve references across
  // sixty-five sentences, could reach woodland. At 0.6 its ceiling is
  // 0.37 and it tops out in light vegetation, which is what it is.
  //
  // Saturation barely moves the band COUNT, because it scales every
  // section of an article together: at span 0.7 the mean is 3.88 bands at
  // both 0.35 and 0.6. It is chosen on what it is FOR — not letting a
  // thinly-sourced article look well sourced — which band counting cannot
  // see.
  articleRateSaturation: 0.6,
  ceilingFloor: 0.18,

  // How sharply the per-cell lushness blend favours the nearest peak
  // (see sectionTerrain.js pass 1). Each peak's weight at a cell is its
  // Gaussian contribution raised to this power.
  //
  // The blend exists to make the boundary between a subsection's ground
  // and its parent's a few cells wide rather than a hard contour — the
  // same artefact ALTITUDE was restructured to remove from the rock
  // line. It is NOT there to average a section with its neighbours: at 1
  // it would, and a jungle subsection inside a steppe parent would come
  // out meadow, which is true of neither.
  //
  // Chosen against the criterion that matters: EVERY section's own band
  // has to appear somewhere on the map, or that section is invisible and
  // hovering it contradicts the ground — the bug this blend was built to
  // fix. Measured on a deliberately hostile shape, where each parent has
  // one very lush child and one barren one:
  //
  //   k=10   2 of 7 peaks have no ground in their own band
  //   k=16   0 of 7            gradient 6.1% of land
  //   k=24   0 of 7            gradient 4.2%
  //   k=40   0 of 7            gradient 2.7%
  //
  // 16 is the lowest that clears it, and lowest is what to want: the
  // gradient IS the soft boundary, and sharpening past the criterion
  // just walks back toward the hard edge blending was chosen to avoid.
  //
  // KNOWN, and inherent to blending rather than to this value: a section
  // with a very different immediate neighbour has its reading pulled
  // about 0.2 toward that neighbour, and no amount of sharpening fixes
  // it — the hostile shape's worst peak sits 0.199 from the nearest
  // ground at k=16 and 0.182 at k=24, because the two summits are only a
  // few cells apart. The BAND still lands correctly; it is the
  // continuous value, which drives foliage density and the rock tint,
  // that compresses.
  blendSharpness: 16,

  // Smallest lushness a section with ANY citation can be given, so that
  // exactly 0 is reserved for "cites nothing" (see lushness.js). Without
  // this the bottom of the relative scale collapses into the dunes and
  // the two bands say the same thing — measured on the fixture, a
  // section with one citation in 22 sentences landed in the band that
  // means no citations at all.
  citedFloor: 0.001,

  // Cut points between the five CITED bands, on the [0, 1] scalar: even
  // fifths. The sixth band, dunes, is not a cut — it is the reserved
  // value 0. Even cuts are what let the legend describe the bands
  // truthfully without restating a table of numbers. Tune spanDoublings
  // and the ceiling, not these.
  bandCuts: Object.freeze([1 / 5, 2 / 5, 3 / 5, 4 / 5]),
})

/**
 * Two-pass terrain generation: section bases (broad domes) and subsection
 * peaks (taller, narrower summits). Each pass uses radial Gaussian falloff
 * with separate radius/height/sigma tuning to reflect different scales
 * (sections = broad and gentle, subsections = tighter and prominent).
 *
 * Pass 1 (sections): adds base height via exp(-distance²/sectionRadius²)
 * Pass 2 (subsections): adds peak height on top of section dome via
 *   exp(-distance²/subsectionRadius²), positioned within parent's footprint
 */
/**
 * Continental topography generation, split into layered passes that each
 * add a specific class of feature. The idea: start from a broad connected
 * landmass, then add ridges, then peaks, then noise — every pass gated by
 * "is there already land here" so we never get floating pointy sticks.
 *
 * Every Gaussian in these passes uses the proper `exp(-r²/(2σ²))` form
 * where σ is a real standard deviation (in grid cells). Do NOT reintroduce
 * the earlier `exp(-r²/σ)` shortcut — that made falloffs collapse to
 * needle-thin peaks.
 */
export const TERRAIN_GENERATION = Object.freeze({
  // Pass 1: Continental base — MAX blend of wide Gaussians. Wide σ so a
  // cell counts as "land" whenever ANY section is within ~σ. MAX (not
  // SUM) preserves saddles between adjacent peaks — SUM would raise the
  // midpoint of two nearby Gaussians ABOVE either center.
  continent: {
    sigmaMultiplier: 1.4,
    softCeiling: 0.45, // upper bound on the base at each peak's center
    // Domain warp: the sample point is displaced by low-frequency noise
    // before the Gaussians are evaluated, so a footprint comes out as an
    // irregular coast with bays and headlands instead of a smooth oval.
    // Amplitude is in grid cells; the scale is deliberately well above a
    // peak radius so it deforms whole coastlines rather than adding fuzz
    // (that's what TERRAIN_DETAIL's noise is for).
    // Subsections also raise the continental base, at this fraction of
    // their own footprint radius, so the coastline sweeps along a section's
    // mountain chain instead of ignoring it. Below 1 so a subsection makes
    // a shoulder on its parent's landmass, not an island of its own.
    subsectionRadiusRatio: 0.72,
    warpAmplitude: 15,
    warpScale: 70,
    warpOctaves: 2,
    warpPersistence: 0.5,
  },
  // Pass 2: Mountain ranges — MAX-blended prominence per section on top
  // of the continental base. Only applied where the base is already land
  // (gated), so no ranges float in the ocean. MAX (not SUM) preserves
  // saddles between adjacent ranges.
  ranges: {
    sigmaMultiplier: 1.1,
    heightMultiplier: 0.38,
    landGateMin: 0.22, // start blending in ranges as base crosses this
    landGateWidth: 0.14,
  },
  // Pass 3: Subsection peaks — MAX-blended prominence per subsection.
  // Also gated: peaks only appear where a range already exists, so they
  // read as summits ON ranges rather than isolated needles.
  peaks: {
    sigmaMultiplier: 0.55,
    heightMultiplier: 0.44,
    rangeGateMin: 0.45,
    rangeGateWidth: 0.14,
  },
  // Pass 4: Fractal noise for natural surface detail. Gated by land, so
  // ocean stays smooth and we don't create phantom underwater ripples
  // that show up as spikes after normalization.
  noise: {
    weight: 0.06,
    landGateMin: 0.24,
    landGateWidth: 0.12,
  },
  // Pass 5: Light smoothing before erosion — knocks down grid-scale
  // sharpness without erasing small saddles.
  preErosionSmoothing: {
    passes: 1,
    strength: 0.2,
  },
  // Pass 6: Thermal erosion — iterative "material transfer downhill"
  // that naturally rounds pointy summits into weathered slopes. Higher
  // iterations = more weathered look. Slope threshold defines the angle
  // of repose (steeper than this and material moves).
  erosion: {
    iterations: 10,
    strength: 0.15,
    slopeThreshold: 0.015,
  },
  // Pass 7: Final smoothing — polish after erosion.
  postErosionSmoothing: {
    passes: 1,
    strength: 0.15,
  },
})

