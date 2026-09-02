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
    hovered: 0.75, // hovered top-level (with breathing pulse on top)
    child: 0.4, // subsection of hovered top-level — the LOD reveal
    parent: 0.42, // top-level whose subsection is hovered (Phase 5+, when subsection hover exists)
    sibling: 0.06, // sibling of a hovered peak (Phase 5+)
    unrelated: 0.04, // top-level, another section hovered
    subsectionIdle: 0, // subsection when nothing/other is hovered — hides
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
 * Determines a peak's relationship to the currently hovered section, using
 * peak.sectionIndex (added by annotateSectionIndices) to resolve owning
 * top-level section without any tree walking.
 *
 * @param {{ sectionIndex: number, depth?: number } | null | undefined} peak
 * @param {number | null | undefined} hoveredSectionIndex peaks-array index of the hovered top-level section
 * @param {number} peakIndex this peak's own peaks-array index
 * @returns {'self' | 'child' | 'parent' | 'sibling' | 'unrelated' | null}
 */
export function relationshipToHover(peak, hoveredSectionIndex, peakIndex) {
  if (hoveredSectionIndex === null || hoveredSectionIndex === undefined || hoveredSectionIndex < 0) {
    return null
  }
  // The peak IS the hovered top-level section.
  if (peakIndex === hoveredSectionIndex) return 'self'
  // Subsection whose owning top-level is the hovered section — the LOD-
  // reveal case. Rendered dimmer than the top-level itself so the parent
  // range still visually dominates.
  if ((peak?.sectionIndex ?? -1) === hoveredSectionIndex) return 'child'
  return 'unrelated'
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
