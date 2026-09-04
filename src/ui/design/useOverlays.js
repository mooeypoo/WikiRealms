import { computed, ref } from 'vue'
import { registerBinding } from './useKeymap.js'

/**
 * The single owner of every summoned surface (docs/ux-vision.md §3).
 *
 * The first-pass UI tracked four independent booleans — showInfoHub,
 * showSettings, isSearchOpen, portalConfirmation — so two could be open at
 * once, Escape reached only two of them, nothing restored focus, and each
 * surface invented its own dismissal.
 *
 * One stack fixes all of that at once: opening a peer closes the peer, the
 * topmost entry owns Escape, and focus returns to whatever the viewer was on
 * before the surface appeared.
 */

const stack = ref([])
let escapeRelease = null
let scrollLock = null

/** Escape is registered lazily and only while something is open. */
function ensureEscape() {
  if (escapeRelease) return
  escapeRelease = registerBinding({
    keys: 'escape',
    // Above anything the app binds: a viewer pressing Escape means "get this
    // off my screen", never whatever else Escape might do underneath.
    priority: 1000,
    // Escape must work while typing, or a search field traps the viewer.
    allowInField: true,
    enabled: () => stack.value.length > 0,
    run: () => {
      const top = stack.value.at(-1)
      if (!top?.dismissible) return false
      close(top.id)
    },
  })
}

function releaseEscapeIfIdle() {
  if (stack.value.length > 0) return
  escapeRelease?.()
  escapeRelease = null
}

function applyScrollLock() {
  const wantsLock = stack.value.some((entry) => entry.modal)
  if (wantsLock && !scrollLock) {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    scrollLock = () => {
      document.body.style.overflow = previous
      scrollLock = null
    }
  } else if (!wantsLock && scrollLock) {
    scrollLock()
  }
}

/**
 * Opens a surface.
 *
 * @param {string} id
 * @param {object} [options]
 * @param {boolean} [options.modal] traps focus, locks scroll, dims the stage
 * @param {boolean} [options.exclusive] closes open peers first (the default,
 *   which is what "one summon at a time" means); pass false to layer, e.g. a
 *   confirmation raised from inside a settings sheet
 * @param {boolean} [options.dismissible] may be closed by Escape
 * @param {() => void} [options.onClose]
 */
export function open(id, { modal = true, exclusive = true, dismissible = true, onClose = null } = {}) {
  if (stack.value.some((entry) => entry.id === id)) return

  if (exclusive) {
    for (const entry of [...stack.value]) close(entry.id)
  }

  const restoreFocusTo = typeof document !== 'undefined' ? document.activeElement : null

  stack.value = [...stack.value, { id, modal, dismissible, onClose, restoreFocusTo }]
  ensureEscape()
  applyScrollLock()
}

export function close(id) {
  const entry = stack.value.find((item) => item.id === id)
  if (!entry) return

  stack.value = stack.value.filter((item) => item.id !== id)
  applyScrollLock()
  releaseEscapeIfIdle()

  entry.onClose?.()

  // Focus goes back where the viewer left it. Guarded: the element may have
  // been unmounted while the surface was open.
  const target = entry.restoreFocusTo
  if (target && typeof target.focus === 'function' && target.isConnected) {
    target.focus()
  }
}

export function closeTop() {
  const top = stack.value.at(-1)
  if (top) close(top.id)
}

export function closeAll() {
  for (const entry of [...stack.value].reverse()) close(entry.id)
}

export function useOverlays() {
  return {
    open,
    close,
    closeTop,
    closeAll,
    stack: computed(() => stack.value),
    /** Only the topmost surface should react to a dismissal gesture. */
    isTopmost: (id) => stack.value.at(-1)?.id === id,
    isOpen: (id) => stack.value.some((entry) => entry.id === id),
    hasModal: computed(() => stack.value.some((entry) => entry.modal)),
    depth: computed(() => stack.value.length),
  }
}

/** Test seam. */
export function resetOverlays() {
  stack.value = []
  scrollLock?.()
  escapeRelease?.()
  escapeRelease = null
}
