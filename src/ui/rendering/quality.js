/**
 * How hard to push the renderer, decided once per session from what the
 * device tells us about itself.
 *
 * WHY THIS EXISTS
 *
 * Nothing ever called renderer.setPixelRatio, and three defaults it to
 * 1. That is not a neutral default — it means the drawing buffer is
 * sized in CSS pixels and the browser upscales it to the physical
 * screen. On a 1x monitor that is exactly right and costs nothing. On a
 * 2x laptop the world is drawn at a quarter of the pixels it is shown
 * at, and on a 3x phone a ninth, then blurred up to fit. Every edge in
 * a stylized look — a ridge line, a blade of grass, a snow boundary —
 * is soft for no reason.
 *
 * The reason it was never noticed is that it also made the fragment
 * cost of everything we added nine times cheaper than it looked. So
 * fixing it is not free, and a fixed pixel ratio of 2 would be a poor
 * trade on the devices that most need help. Hence tiers: match the
 * buffer to the screen where there is headroom, and spend less where
 * there is not.
 *
 * WHAT A TIER CONTROLS
 *
 * Only things that can be decided without knowing what is on screen.
 * Anything that depends on where the camera is belongs in the per-frame
 * detail fraction (see foliageDetailFraction in foliage.js), and the two
 * multiply: a low tier thins the vegetation everywhere, and distance
 * thins it further.
 *
 * Antialiasing is deliberately NOT here. It is fixed when the WebGL
 * context is created and cannot be changed afterwards, so making it a
 * tier setting would mean tearing down the renderer to change quality —
 * and at a pixel ratio of 2 or more it buys little anyway.
 *
 * Free of three.js, like the rest of ui/rendering: this decides numbers,
 * and the component applies them.
 */

/**
 * The tiers, coarsest knob first.
 *
 * `pixelRatio` is a CEILING, not a target — a 1x screen stays at 1 on
 * every tier, because there is nothing above 1 to resolve. Going past 2
 * is deliberately not offered: the difference between 2 and 3 is close
 * to invisible at arm's length and costs another 125% of the fragments.
 *
 * `foliageDensity` scales the instance count of both vegetation layers.
 * It is a count rather than a size so that thinning changes how MUCH
 * grows, not how big it is — a shrunken world reads as wrong, where a
 * sparser one reads as different ground.
 */
export const QUALITY_TIERS = Object.freeze({
  high: Object.freeze({ name: 'high', pixelRatio: 2, foliageDensity: 1 }),
  medium: Object.freeze({ name: 'medium', pixelRatio: 1.5, foliageDensity: 0.7 }),
  low: Object.freeze({ name: 'low', pixelRatio: 1, foliageDensity: 0.45 }),
})

/**
 * Picks a tier from what the browser will admit about the device.
 *
 * Every signal here is a hint rather than a measurement, which is why
 * they are combined conservatively: a touch device with few cores or
 * little memory gets the low tier, any other touch device the middle
 * one, and a desktop the top unless it looks thin.
 *
 * A phone is identified by its POINTER, not by its screen size or user
 * agent string. A narrow window on a desktop is still a desktop, and a
 * tablet held in landscape is still a tablet; what actually correlates
 * with a mobile GPU is that the primary pointer is a finger.
 *
 * hardwareConcurrency is the least bad proxy available for GPU class,
 * and it is a poor one — but a 4-core phone is reliably not going to
 * enjoy a 3x drawing buffer, and that is the call being made.
 *
 * Everything is injected rather than read off globals so the boundaries
 * can be tested. Missing values are treated as capable, because the
 * browsers that withhold them (Safari reports neither deviceMemory nor
 * a useful concurrency) are not the ones we most need to protect.
 *
 * @param {{ coarsePointer?: boolean, hardwareConcurrency?: number,
 *   deviceMemory?: number }} [device]
 * @returns {object} one of QUALITY_TIERS
 */
export function detectQualityTier({ coarsePointer = false, hardwareConcurrency, deviceMemory } = {}) {
  const cores = Number.isFinite(hardwareConcurrency) ? hardwareConcurrency : Infinity
  const memory = Number.isFinite(deviceMemory) ? deviceMemory : Infinity

  if (coarsePointer) {
    return cores <= 4 || memory <= 4 ? QUALITY_TIERS.low : QUALITY_TIERS.medium
  }
  return cores <= 2 || memory <= 2 ? QUALITY_TIERS.medium : QUALITY_TIERS.high
}

/**
 * Reads the tier's inputs off the current browser.
 *
 * The one place in this module that touches globals, kept separate from
 * detectQualityTier so the decision stays testable.
 */
export function readDeviceProfile() {
  return {
    coarsePointer: globalThis.matchMedia?.('(pointer: coarse)').matches ?? false,
    hardwareConcurrency: globalThis.navigator?.hardwareConcurrency,
    deviceMemory: globalThis.navigator?.deviceMemory,
  }
}

/**
 * The pixel ratio to hand the renderer: the screen's own, capped by the
 * tier.
 *
 * Capped rather than replaced, because asking for MORE pixels than the
 * screen has is pure waste — it renders detail that is then averaged
 * away by the downscale.
 *
 * @param {object} tier from QUALITY_TIERS
 * @param {number} [devicePixelRatio]
 */
export function resolvePixelRatio(tier, devicePixelRatio = globalThis.devicePixelRatio ?? 1) {
  const screen = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1
  return Math.min(screen, tier.pixelRatio)
}
