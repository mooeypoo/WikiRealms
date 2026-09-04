import { computed, onUnmounted, readonly, ref } from 'vue'

/**
 * The breakpoint ladder from docs/ux-vision.md §4.2, as the one place
 * JavaScript states it. CSS states it independently in media queries — the
 * two cannot share a value, since media queries cannot read custom
 * properties, which is exactly why the old --breakpoint-* tokens were
 * useless. tests/ui/design/useViewport.test.js pins the boundary that CSS
 * also encodes, so the pair cannot drift silently.
 */
export const BREAKPOINTS = Object.freeze({
  xs: 0,
  sm: 480,
  md: 768,
  lg: 1024,
  xl: 1440,
})

export const BREAKPOINT_ORDER = Object.freeze(['xs', 'sm', 'md', 'lg', 'xl'])

/**
 * Landscape phones. Height is the scarce axis there, so it gets its own
 * case rather than being inferred from width — a 844x390 phone is wider
 * than an `md` tablet and must not be treated like one.
 */
export const SHORT_MAX_HEIGHT = 520

// Module-level so the whole app shares one listener and one truth, however
// many components ask.
const width = ref(0)
const height = ref(0)
const coarsePointer = ref(false)
let consumers = 0
let detach = null

function measure() {
  width.value = window.innerWidth
  height.value = window.innerHeight
  // matchMedia is absent in jsdom; a mouse is the safer assumption there,
  // since assuming touch would silently relax hit-target expectations.
  coarsePointer.value = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches
}

function attach() {
  if (detach) return
  measure()
  const onResize = () => measure()
  window.addEventListener('resize', onResize)
  window.addEventListener('orientationchange', onResize)
  detach = () => {
    window.removeEventListener('resize', onResize)
    window.removeEventListener('orientationchange', onResize)
    detach = null
  }
}

function breakpointFor(px) {
  let match = 'xs'
  for (const name of BREAKPOINT_ORDER) {
    if (px >= BREAKPOINTS[name]) match = name
  }
  return match
}

/**
 * Reactive viewport facts, for the handful of decisions CSS cannot make:
 * which presentation a Sheet should take, whether hover exists, whether the
 * short case applies.
 *
 * Layout itself belongs in media queries. Reach for this only when the
 * choice is structural — a different component tree, not a different size.
 */
export function useViewport() {
  attach()
  consumers += 1

  onUnmounted(() => {
    consumers -= 1
    if (consumers <= 0) {
      consumers = 0
      detach?.()
    }
  })

  const breakpoint = computed(() => breakpointFor(width.value))
  const isShort = computed(() => height.value > 0 && height.value <= SHORT_MAX_HEIGHT)

  /** True at or above the named breakpoint, e.g. atLeast('md'). */
  const atLeast = (name) => width.value >= BREAKPOINTS[name]

  return {
    width: readonly(width),
    height: readonly(height),
    breakpoint,
    isShort,
    /** Coarse pointer: no hover, and larger hit targets. */
    isTouch: readonly(coarsePointer),
    atLeast,
    /** Escape hatch for tests and for the rare imperative read. */
    measure,
  }
}
