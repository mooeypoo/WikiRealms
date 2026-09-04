import { CITATION_FAERIES } from '../../engine/generation/config.js'

/**
 * Section marker sizing/animation parameters — the "energy wall" cylinder
 * around each section's radius plus a soft flat halo ring on the ground.
 *
 * Values are tuned in grid units (matching peak.radius and terrain grid
 * coords) so the same parameters work whether the terrain is 128², 256²,
 * or larger. Heights are still grid units — the caller multiplies by the
 * mesh's heightScale to place them in world Z.
 *
 * Kept intentionally as constants + pure functions here so the halo
 * behavior can be tuned and unit-tested without touching three.js.
 */
export const SECTION_MARKERS = Object.freeze({
  // Ring on the ground tracing the section footprint. Slightly larger
  // than the peak radius so it reads as an outline, not an inscribed disk.
  ring: {
    radiusMultiplier: 1.05,
    thickness: 1.4, // grid units, ring's inner-to-outer band width
    hoverOffset: 0.4, // sits just above the terrain surface to avoid z-fighting
  },
  // Vertical "energy wall" cylinder around the section perimeter.
  wall: {
    radiusMultiplier: 1.02, // matches the ring closely
    // Wall height = peak.amplitude * heightMultiplier, floored so tiny
    // sections still get a visible marker instead of a 0-height sliver.
    // Sized to a fraction of the terrain's own vertical scale so a big
    // section is prominent but never dwarfs its own mountain.
    heightMultiplier: 8,
    minHeight: 6, // grid units, minimum wall height even for the smallest peak
    radialSegments: 24, // low enough to be cheap, high enough to read round
  },
  // Opacity states — one semantic vocabulary reused across every marker
  // interaction. Top-level idle/unrelated stays visible at a low
  // background presence; subsections default to 0 so they hide entirely
  // and only reveal (via 'child') when their parent is hovered.
  opacity: Object.freeze({
    idle: 0.08, // top-level, nothing hovered
    hovered: 0.8, // hovered top-level (with breathing pulse on top)
    child: 0.3, // subsection of hovered top-level — the LOD reveal
    parent: 0.32, // top-level whose subsection is hovered (Phase 5+, when subsection hover exists)
    // Siblings sit above the 0.1 halo-hover threshold so the cursor can
    // travel straight from one subsection to the next without dropping
    // back through terrain hover, but well below the hovered peak.
    sibling: 0.14, // sibling of a hovered peak (Phase 5+)
    unrelated: 0.04, // top-level, another section hovered
    subsectionIdle: 0, // subsection when nothing/other is hovered — hides
  }),
  // Wall-height multipliers mirroring the opacity vocabulary. Opacity
  // alone flattens out — a bright ring and a slightly-less-bright ring
  // read as "both highlighted". Height doesn't: the hovered section's
  // energy wall stands at full height while its context sits visibly
  // lower, so the focus is legible from any camera angle. Applied to the
  // wall only; ground rings keep tracing the true section footprint.
  heightScale: Object.freeze({
    idle: 0.45, // top-level, nothing hovered — the resting skyline
    hovered: 1, // hovered peak — full wall, the tallest thing on the map
    child: 0.55, // subsection revealed under its hovered parent
    parent: 0.62, // top-level whose subsection is hovered — context, not focus
    sibling: 0.3, // sibling of a hovered peak
    unrelated: 0.25, // another section is hovered — sinks out of the way
    // Never exactly 0: a zero-scaled mesh has a singular world matrix.
    // Invisible at subsectionIdle opacity anyway, so the value is only
    // the height these walls grow from when their parent is hovered.
    subsectionIdle: 0.05,
  }),
  // Slow breathing pulse on the hovered wall — modulates opacity so it
  // reads as "attention" without being distracting. Kept slow (period ~2s)
  // so it doesn't compete with the faster faerie hover animation.
  pulse: Object.freeze({
    frequency: CITATION_FAERIES.hoverFrequency * 0.5, // rad/sec, ~half faerie speed
    amplitude: 0.15, // ± this on top of opacity.hovered
  }),
})

/**
 * Wall height in GRID units (before world-Z scaling). Callers multiply
 * by heightScale to get the actual mesh height.
 * @param {number} amplitude peak.amplitude (~[0.3, 1.0])
 */
export function computeWallHeight(amplitude) {
  const scaled = (amplitude ?? 0) * SECTION_MARKERS.wall.heightMultiplier
  return Math.max(scaled, SECTION_MARKERS.wall.minHeight)
}

/**
 * Radii for the ground ring geometry (RingGeometry inner/outer radius),
 * in grid units. Slightly larger than peak.radius so the ring outlines
 * the footprint rather than sitting inside it.
 * @param {number} peakRadius peak.radius (grid units)
 */
export function computeRingRadii(peakRadius) {
  const outer = peakRadius * SECTION_MARKERS.ring.radiusMultiplier
  const inner = Math.max(outer - SECTION_MARKERS.ring.thickness, 0.1)
  return { inner, outer }
}

/**
 * Wall radius (grid units). Uses its own multiplier so the wall can sit
 * a hair outside or inside the ring without either fighting the other.
 * @param {number} peakRadius peak.radius (grid units)
 */
export function computeWallRadius(peakRadius) {
  return peakRadius * SECTION_MARKERS.wall.radiusMultiplier
}

/**
 * Picks the target opacity for a peak given its relationship to the
 * currently hovered section. Consumers lerp toward this each frame.
 *
 * Relationship semantics:
 * - 'self':      the hovered top-level peak
 * - 'child':     a subsection whose owning top-level is the hovered section
 *                (Phase 4's LOD reveal — subsections fade in when their
 *                parent is hovered)
 * - 'parent':    top-level whose subsection is hovered directly (Phase 5+)
 * - 'sibling':   sibling of a hovered peak (Phase 5+)
 * - 'unrelated': no relationship
 * - null:        nothing is hovered → idle
 *
 * `isSubsection` (default false) lets subsections use their own idle
 * value — 0 by default — so they don't clutter the map when their
 * parent isn't hovered.
 *
 * @param {'self' | 'child' | 'parent' | 'sibling' | 'unrelated' | null} relationship
 * @param {boolean} [isSubsection]
 * @returns {number}
 */
export function pickHaloOpacity(relationship, isSubsection = false) {
  const o = SECTION_MARKERS.opacity
  switch (relationship) {
    case 'self': return o.hovered
    case 'child': return o.child
    case 'parent': return o.parent
    case 'sibling': return o.sibling
    case 'unrelated': return isSubsection ? o.subsectionIdle : o.unrelated
    default: return isSubsection ? o.subsectionIdle : o.idle
  }
}

/**
 * Wall-height multiplier for a peak given its relationship to the
 * currently hovered section — the height counterpart of pickHaloOpacity,
 * with the same relationship vocabulary and the same subsection default.
 * Consumers lerp toward this each frame and keep the wall's base pinned
 * to the terrain, so the wall grows and shrinks from the ground up.
 *
 * @param {'self' | 'child' | 'parent' | 'sibling' | 'unrelated' | null} relationship
 * @param {boolean} [isSubsection]
 * @returns {number} multiplier on the peak's computeWallHeight()
 */
export function pickWallHeightScale(relationship, isSubsection = false) {
  const h = SECTION_MARKERS.heightScale
  switch (relationship) {
    case 'self': return h.hovered
    case 'child': return h.child
    case 'parent': return h.parent
    case 'sibling': return h.sibling
    case 'unrelated': return isSubsection ? h.subsectionIdle : h.unrelated
    default: return isSubsection ? h.subsectionIdle : h.idle
  }
}

/**
 * Determines a peak's relationship to the currently hovered peak, using
 * peak.sectionIndex (added by annotateSectionIndices) plus the peaks
 * array for the depth/parent lookups needed when a subsection is hovered.
 *
 * Cases:
 * - hoveredIndex === peakIndex → 'self'
 * - hovered is a TOP-LEVEL:
 *   - this peak's sectionIndex === hoveredIndex (subsection of hovered) → 'child'
 *   - else → 'unrelated'
 * - hovered is a SUBSECTION:
 *   - this is its owning top-level (peakIndex === hovered.sectionIndex) → 'parent'
 *   - this is a sibling subsection (same owning top-level, different peak) → 'sibling'
 *   - else → 'unrelated'
 *
 * @param {{ sectionIndex: number, depth?: number } | null | undefined} peak
 * @param {number | null | undefined} hoveredIndex peaks-array index of the hovered peak
 * @param {number} peakIndex this peak's own peaks-array index
 * @param {object[]} [peaks] full peaks array — required for subsection-hover cases
 * @returns {'self' | 'child' | 'parent' | 'sibling' | 'unrelated' | null}
 */
export function relationshipToHover(peak, hoveredIndex, peakIndex, peaks) {
  if (hoveredIndex === null || hoveredIndex === undefined || hoveredIndex < 0) {
    return null
  }
  if (peakIndex === hoveredIndex) return 'self'

  const hoveredPeak = Array.isArray(peaks) ? peaks[hoveredIndex] : undefined
  const hoveredIsTopLevel = (hoveredPeak?.depth ?? 1) <= 1

  if (hoveredIsTopLevel || !hoveredPeak) {
    // A subsection whose owning top-level is the hovered section — LOD-
    // reveal case (Phase 4). Also the fallback when no peaks array was
    // passed: we can't distinguish subsection hover, so we assume top-level.
    if ((peak?.sectionIndex ?? -1) === hoveredIndex) return 'child'
    return 'unrelated'
  }

  // Hovered is a subsection.
  const hoveredParent = hoveredPeak.sectionIndex ?? -1

  // This peak IS the hovered subsection's parent top-level range.
  if (peakIndex === hoveredParent) return 'parent'

  // This peak is a sibling subsection (same owning top-level, not the same peak).
  if ((peak?.sectionIndex ?? -1) === hoveredParent && (peak?.depth ?? 0) > 1) return 'sibling'

  return 'unrelated'
}

/**
 * Given a hovered peaks-array index (top-level OR subsection) resolves
 * to the peaks-array index of its owning top-level section. Used by
 * markers whose semantics only care about "which top-level range am I
 * in" — portals and citation faeries.
 *
 * @param {number | null | undefined} hoveredIndex
 * @param {object[]} peaks
 * @returns {number} the top-level's peaks-array index, or `-1` if nothing is hovered
 */
export function resolveHoveredTopLevel(hoveredIndex, peaks) {
  if (hoveredIndex === null || hoveredIndex === undefined || hoveredIndex < 0) return -1
  const peak = Array.isArray(peaks) ? peaks[hoveredIndex] : undefined
  if (!peak) return -1
  if ((peak.depth ?? 1) <= 1) return hoveredIndex
  return peak.sectionIndex ?? -1
}

/**
 * Anchor (the source Wikipedia heading id) of the top-level section that
 * owns `peakIndex` — the peak itself when it is already top-level, its
 * parent range when it is a subsection. This is the granularity the
 * article panel lists, so a subsection click focuses its parent card.
 *
 * Returns `null` when the peak is unknown or carries no anchor — the
 * synthetic folded "Miscellaneous" range (see sectionPeakLimits.js) has
 * no heading of its own, and consumers read `null` as "nothing to focus".
 *
 * @param {number | null | undefined} peakIndex
 * @param {object[]} peaks
 * @returns {string | null}
 */
export function resolveSectionAnchor(peakIndex, peaks) {
  const topLevelIndex = resolveHoveredTopLevel(peakIndex, peaks)
  if (topLevelIndex < 0) return null
  return peaks[topLevelIndex]?.anchor ?? null
}

/**
 * Breathing pulse offset (± amplitude) added on top of the base hovered
 * opacity. Callers pass performance.now()/1000 or an animation clock.
 * @param {number} timeSeconds
 * @param {number} [phaseOffset] per-peak phase so adjacent halos don't beat in lockstep
 */
export function computeBreathingPulse(timeSeconds, phaseOffset = 0) {
  return Math.sin(timeSeconds * SECTION_MARKERS.pulse.frequency + phaseOffset) * SECTION_MARKERS.pulse.amplitude
}
