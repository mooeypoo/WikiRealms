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
  // Opacity states — the same idle/hovered/related targets used by every
  // Phase 2+ marker (subsections, siblings, parent breadcrumb) so opacity
  // is a single semantic vocabulary across the whole hover language.
  opacity: Object.freeze({
    idle: 0.08,
    hovered: 0.75,
    parent: 0.42, // parent of hovered subsection (Phase 4)
    sibling: 0.05, // sibling of a hovered peak (Phase 4)
    unrelated: 0.04,
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
 * - 'self':      this peak is the hovered section (or the hovered peak itself)
 * - 'parent':    this top-level section owns the hovered subsection
 * - 'sibling':   this subsection shares a parent with a hovered subsection,
 *                or two top-level peaks with a hovered top-level
 * - 'unrelated': no relationship (or Phase 4 hasn't landed yet, so treat
 *                everything not-self as unrelated)
 * - null / 'none': nothing is hovered → idle
 *
 * @param {'self' | 'parent' | 'sibling' | 'unrelated' | null} relationship
 * @returns {number}
 */
export function pickHaloOpacity(relationship) {
  const o = SECTION_MARKERS.opacity
  switch (relationship) {
    case 'self': return o.hovered
    case 'parent': return o.parent
    case 'sibling': return o.sibling
    case 'unrelated': return o.unrelated
    default: return o.idle
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
 * @returns {'self' | 'parent' | 'sibling' | 'unrelated' | null}
 */
export function relationshipToHover(peak, hoveredSectionIndex, peakIndex) {
  if (hoveredSectionIndex === null || hoveredSectionIndex === undefined || hoveredSectionIndex < 0) {
    return null
  }
  // The peak IS the hovered section.
  if (peakIndex === hoveredSectionIndex) return 'self'
  // Subsection whose owning top-level is the hovered section — that's the
  // hovered range's own subsection. Also 'self' for hover purposes: it
  // lights up with its parent.
  if ((peak?.sectionIndex ?? -1) === hoveredSectionIndex) return 'self'
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
