import { computed, ref } from 'vue'

/**
 * Tracks which section is currently "focused" on the world view — the
 * single source of truth every marker layer reactively reads from
 * (halos, labels, portals, tooltip).
 *
 * The hover state is intentionally a small dumb value ({ sectionIndex,
 * source }) rather than an object reference — index space matches
 * peak.sectionIndex / terrain.sectionOwnershipMap so any raycaster or
 * marker can translate to/from a section without knowing about anything
 * else in the scene.
 *
 * A short debounce on clear() prevents flicker when the pointer briefly
 * leaves one marker and enters another (e.g. sliding across the seam
 * between a range's ridge and a subsection summit).
 *
 * Framework-agnostic in spirit: this composable only uses Vue's ref/
 * computed — no three.js, no DOM. Any renderer can drive it.
 *
 * @param {{ debounceMs?: number, timerFactory?: object }} [options]
 *   debounceMs: how long clear() waits before actually clearing (default 200ms).
 *   timerFactory: injected {setTimeout, clearTimeout} for deterministic tests.
 */
export function useHoverState({ debounceMs = 200, timerFactory = globalThis } = {}) {
  const sectionIndex = ref(null)
  const source = ref(null)
  let pendingClearId = null

  const isHovered = computed(() => sectionIndex.value !== null)

  function cancelPendingClear() {
    if (pendingClearId !== null) {
      timerFactory.clearTimeout(pendingClearId)
      pendingClearId = null
    }
  }

  function setHovered(nextIndex, nextSource = null) {
    cancelPendingClear()
    sectionIndex.value = nextIndex
    source.value = nextSource
  }

  /** Immediately clears — for tests, teardown, or when the user commits a click. */
  function clearNow() {
    cancelPendingClear()
    sectionIndex.value = null
    source.value = null
  }

  /** Schedules a debounced clear; call setHovered() before it fires to keep the current section. */
  function clear() {
    cancelPendingClear()
    pendingClearId = timerFactory.setTimeout(() => {
      sectionIndex.value = null
      source.value = null
      pendingClearId = null
    }, debounceMs)
  }

  return {
    sectionIndex,
    source,
    isHovered,
    setHovered,
    clear,
    clearNow,
  }
}
