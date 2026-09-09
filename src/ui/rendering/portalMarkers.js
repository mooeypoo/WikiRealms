/**
 * Portal marker sizing/animation parameters — the whirlpool sprite that
 * marks an outbound article link, its idle pulse, and its hover response.
 *
 * Portals are the only markers on the map a click actually navigates
 * through, so they need to be findable — but not louder than the section
 * halos they sit beside. Size and glow stay under the wall markers;
 * colour (pink/cyan swirl) is what keeps them in a different vocabulary.
 *
 * Kept as constants + pure functions here (no three.js) so the behavior
 * can be tuned and unit-tested without a WebGL context.
 */
export const PORTAL_MARKERS = Object.freeze({
  // World-units at rest. Smaller than a section wall (~6–8) so portals
  // mark a destination without competing with the halo vocabulary —
  // especially from orbit, where a scale of 9 used to own the silhouette.
  baseScale: 5,
  // How far the marker floats above the surface (or above sea level).
  // Sized with baseScale: the vortex extends about half its scale below
  // its centre, so too small a lift buries it in the ground.
  hoverOffset: 3.2,
  texture: Object.freeze({
    size: 128, // px; the aura needs room around the glyph to fade out
    coreRatio: 0.06, // solid-white core radius, fraction of the canvas
    auraRatio: 0.34, // where the accent-tinted aura peaks, before fading
    // The glyph is drawn rather than typed. It was an emoji, which cannot
    // take the accent colour, renders differently on every platform, and
    // was the last thing in the app still doing that — in the place a
    // viewer looks most.
    ringRatio: 0.19, // outer aperture ring, fraction of the canvas
    innerRingRatio: 0.11,
    tickRatio: 0.075, // length of the four cardinal ticks
    strokeRatio: 0.022, // line weight, so the glyph scales as one piece
  }),
  // Slow idle breathing so a map full of portals shimmers rather than
  // strobes. Frequency is rad/sec.
  pulse: Object.freeze({ frequency: 1.7, amplitude: 0.08 }),
  // Phase offset per portal, in radians, so a cluster shimmers instead
  // of beating in unison. Not a divisor of 2π, or portals would fall
  // back into step with each other at regular intervals along the list.
  pulsePhaseStep: 0.7,
  // Growth under the cursor — clear without swallowing neighbours.
  hover: Object.freeze({ scale: 1.35 }),
  opacity: Object.freeze({
    related: 1, // nothing hovered, or this portal's section is hovered
    unrelated: 0.2, // another section is hovered — recede
  }),
  // Exponential lerp factor for scale/opacity transitions, per frame.
  lerpAlpha: 0.18,
  /**
   * Vortex form palette and spin. Fixed pink/cyan — not the section
   * accent — so portals never read as another halo ring from orbit.
   */
  vortex: Object.freeze({
    pink: 0xe04a8f,
    cyan: 0x3aa8d4,
    core: 0xf0c4d8,
    /** Radians per second around the surface normal. */
    spin: 1.35,
    /**
     * Multiplier on additive material opacity. Full opacity on additive
     * pink/cyan washes the planet; keep the glow present but quieter.
     */
    intensity: 0.52,
  }),
})

/**
 * Idle breathing multiplier for a portal sprite: 1 ± pulse.amplitude.
 * @param {number} timeSeconds animation clock
 * @param {number} [phaseOffset] per-portal offset so they don't beat in unison
 */
export function computePortalPulse(timeSeconds, phaseOffset = 0) {
  const { frequency, amplitude } = PORTAL_MARKERS.pulse
  return 1 + Math.sin(timeSeconds * frequency + phaseOffset) * amplitude
}

/**
 * Whether a portal belongs to the currently hovered top-level section.
 * With nothing hovered every portal counts as related, so the map sits
 * at full presence instead of uniformly dimmed.
 *
 * @param {number} portalSectionIndex portal.sectionIndex (-1 for lead links)
 * @param {number} hoveredTopLevelIndex from resolveHoveredTopLevel (-1 when nothing is hovered)
 */
export function isPortalRelated(portalSectionIndex, hoveredTopLevelIndex) {
  if (hoveredTopLevelIndex === null || hoveredTopLevelIndex === undefined || hoveredTopLevelIndex < 0) return true
  return portalSectionIndex === hoveredTopLevelIndex
}

/**
 * Target scale multiplier for the hover state. Consumers lerp toward it
 * so the growth eases in rather than snapping.
 * @param {boolean} isHovered
 */
export function pickPortalHoverScale(isHovered) {
  return isHovered ? PORTAL_MARKERS.hover.scale : 1
}

/**
 * Target opacity for a portal. A hovered portal is never dimmed — the
 * cursor is a stronger statement of intent than the section-link
 * highlight it might otherwise be excluded from.
 *
 * @param {boolean} isRelated see isPortalRelated
 * @param {boolean} [isHovered]
 */
export function pickPortalOpacity(isRelated, isHovered = false) {
  if (isHovered) return PORTAL_MARKERS.opacity.related
  return isRelated ? PORTAL_MARKERS.opacity.related : PORTAL_MARKERS.opacity.unrelated
}

/**
 * Composes the final sprite scale. Pulse and hover growth multiply
 * rather than add, so a portal breathes by the same proportion whether
 * it's at rest or grown under the cursor.
 *
 * @param {number} baseScale
 * @param {number} pulse from computePortalPulse
 * @param {number} hoverScale current (lerped) hover multiplier
 */
export function computePortalScale(baseScale, pulse, hoverScale) {
  return baseScale * pulse * hoverScale
}
