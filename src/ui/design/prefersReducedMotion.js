/**
 * Whether the reader has asked the system for less motion.
 *
 * §5 gates every motion token behind this, and a panel that scrolls
 * itself is motion the reader did not ask for. matchMedia is absent in
 * jsdom, so an unanswerable question reads as "no preference".
 *
 * One copy rather than three. It was written twice — once in Ledger.vue
 * and once in useTravel.js — and the 3D view was about to need a third,
 * which is the point at which two identical private helpers stop being a
 * coincidence. The 3D view was also the one place that ignored the
 * preference entirely, so the duplication and the gap arrived together.
 *
 * @returns {boolean}
 */
export function prefersReducedMotion() {
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}
