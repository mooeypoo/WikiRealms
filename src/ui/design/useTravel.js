import { computed, onBeforeUnmount, readonly, ref } from 'vue'

/**
 * The moment between two worlds.
 *
 * SHAPED BY A MEASUREMENT, not by taste. generateWorld blocks the main
 * thread for ~120ms on a development laptop for a 131k-cell terrain, and
 * plausibly 400-500ms on a mid-range phone. It is synchronous, so it stops
 * requestAnimationFrame dead.
 *
 * That rules out the obvious design — a long camera dive "masking" the
 * work — because the dive would stutter exactly when the work landed, and
 * motion that hitches reads as broken. You cannot hide blocking work behind
 * animation; you can only hide it behind something that does not animate.
 *
 * So: dive (motion, cheap, nothing else running) → wash (STATIC, and the
 * generation happens here, where a frozen frame is indistinguishable from a
 * held one) → rise (motion, on the new world). The hold has a floor so it
 * cannot flash, and no ceiling, so a slow network simply waits inside it.
 *
 *   idle → diving → washing → rising → idle
 */

export const TRAVEL_PHASES = Object.freeze({
  DIVE: 260,
  /** Floor, not a duration: the wash holds until the world is ready. */
  WASH_MIN: 220,
  RISE: 320,
})

export function useTravel({ prefersReducedMotion = defaultReducedMotion } = {}) {
  const phase = ref('idle')
  const target = ref(null)

  let timers = []
  let finish = null

  const isTravelling = computed(() => phase.value !== 'idle')
  /** The stage should not accept clicks while the world is being replaced. */
  const isBusy = computed(() => phase.value === 'diving' || phase.value === 'washing')

  function wait(ms) {
    return new Promise((resolve) => {
      timers.push(setTimeout(resolve, ms))
    })
  }

  function clearTimers() {
    for (const timer of timers) clearTimeout(timer)
    timers = []
  }

  /**
   * @param {object} portal the destination, echoed back to the caller
   * @param {object} hooks
   * @param {(portal) => void} hooks.onArrive called at the start of the wash,
   *   where the blocking work belongs
   * @param {() => void} [hooks.onDive] camera choreography, if any
   * @param {boolean} [hooks.animate] false skips straight to arrival
   */
  async function travel(portal, { onArrive, onDive = null, animate = true } = {}) {
    cancel()
    target.value = portal

    // Reduced motion is not a lesser animation, it is none: the viewer has
    // asked for no movement, and a shorter dive is still movement.
    const moving = animate && !prefersReducedMotion()

    if (!moving) {
      phase.value = 'washing'
      onArrive?.(portal)
      await wait(0)
      settle()
      return
    }

    phase.value = 'diving'
    onDive?.(portal)
    await wait(TRAVEL_PHASES.DIVE)
    if (phase.value !== 'diving') return

    phase.value = 'washing'
    // Behind the wash, where a 400ms freeze looks like a held frame.
    onArrive?.(portal)

    await wait(TRAVEL_PHASES.WASH_MIN)
    if (phase.value !== 'washing') return

    phase.value = 'rising'
    await wait(TRAVEL_PHASES.RISE)
    if (phase.value !== 'rising') return

    settle()
  }

  function settle() {
    clearTimers()
    phase.value = 'idle'
    target.value = null
    finish?.()
    finish = null
  }

  /**
   * Ends the transition immediately, leaving the viewer at the destination.
   *
   * Bound to Escape and to a click anywhere on the wash: a viewer who does
   * not want the flourish should never have to sit through it, and one who
   * has seen it forty times certainly should not.
   */
  function cancel() {
    clearTimers()
    phase.value = 'idle'
    target.value = null
  }

  onBeforeUnmount(clearTimers)

  return { phase: readonly(phase), target: readonly(target), isTravelling, isBusy, travel, cancel }
}

function defaultReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}
