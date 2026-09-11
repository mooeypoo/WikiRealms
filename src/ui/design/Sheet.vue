<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import Scrim from './Scrim.vue'
import { useOverlays } from './useOverlays.js'
import { useViewport } from './useViewport.js'

/**
 * The one surface primitive. The Ledger, the field guide, settings, the
 * command palette and the journey menu are all this component with different
 * props — which is what stops each of them inventing its own dismissal,
 * its own focus behaviour and its own idea of what "open" means.
 *
 * It owns presentation (where the surface comes from), snap points and drag,
 * the focus trap, and hiding the background from assistive technology.
 * Escape, scroll lock, focus RETURN and the one-at-a-time rule belong to
 * useOverlays; this registers with it rather than reimplementing them.
 *
 * Anchored popovers are deliberately not here yet: positioning against a
 * marker needs the projection the 3D view provides, so PortalPreview brings
 * that presentation with it rather than this guessing the API in advance.
 */
const props = defineProps({
  open: { type: Boolean, required: true },
  /** Identity in the overlay stack; must be unique per surface. */
  id: { type: String, required: true },
  /**
   * 'auto' resolves against the viewport and `modal`:
   *   modal     → sheet below md, dialog otherwise (dialog when short, since
   *               a bottom sheet on a 390px-tall screen has nowhere to go)
   *   non-modal → sheet below md, drawer when short, panel otherwise
   */
  presentation: {
    type: String,
    default: 'auto',
    validator: (value) => ['auto', 'dialog', 'sheet', 'drawer', 'panel'].includes(value),
  },
  /** Modal surfaces trap focus, dim the stage and hide the background. */
  modal: { type: Boolean, default: true },
  dismissible: { type: Boolean, default: true },
  /** Accessible name. One of these is required for a modal surface. */
  label: { type: String, default: null },
  labelledby: { type: String, default: null },
  /** Heights as fractions of the viewport: peek, open, full. */
  snapPoints: { type: Array, default: () => [0.14, 0.45, 0.9] },
  snap: { type: Number, default: 1 },
  /**
   * Minimised to a bar, rather than gone.
   *
   * A summon is dismissed and the top scrim is how you ask again. A
   * PERSISTENT surface cannot work that way: close it outright and nothing
   * on screen explains how to get it back, because its own affordance went
   * with it (docs/ux-vision.md §4.2). Collapsing renders the `collapsed`
   * slot in place of everything else, so the bar left behind is both the
   * state and the way out of it.
   */
  collapsed: { type: Boolean, default: false },
  /**
   * Size to the header + footer and collapse the empty body. Used by the
   * Ledger at peek: a fixed snap fraction left a tall hollow gap between
   * the stats and the always-on legend.
   */
  compact: { type: Boolean, default: false },
  /** Which edge a drawer or panel is docked to. */
  side: { type: String, default: 'left', validator: (value) => ['left', 'right'].includes(value) },
  /** Dragging a sheet below its lowest snap dismisses it. */
  dismissOnDrag: { type: Boolean, default: null },
})

const emit = defineEmits(['close', 'update:snap'])

const overlays = useOverlays()
const viewport = useViewport()

const surface = ref(null)
const dragOffset = ref(0)
const dragging = ref(false)

const resolvedPresentation = computed(() => {
  if (props.presentation !== 'auto') return props.presentation
  if (props.modal) return viewport.atLeast('md') || viewport.isShort.value ? 'dialog' : 'sheet'
  if (viewport.isShort.value) return 'drawer'
  return viewport.atLeast('md') ? 'panel' : 'sheet'
})

const isSheet = computed(() => resolvedPresentation.value === 'sheet')
/** A drawer already fills its edge; only these take a height from a snap. */
const isSized = computed(() => ['sheet', 'panel'].includes(resolvedPresentation.value))
const canDragDismiss = computed(() => props.dismissOnDrag ?? props.modal)

const snapFraction = computed(() => {
  const points = props.snapPoints
  const index = Math.min(Math.max(props.snap, 0), points.length - 1)
  return points[index]
})

const surfaceStyle = computed(() => {
  // Collapsed / compact take height from what they contain — a fixed snap
  // fraction would leave an empty band between header and footer.
  if (props.collapsed || props.compact || !isSized.value) {
    return {
      transform: dragOffset.value ? `translateY(${dragOffset.value}px)` : undefined,
      transition: dragging.value ? 'none' : undefined,
    }
  }
  return {
    height: `${snapFraction.value * 100}dvh`,
    transform: dragOffset.value ? `translateY(${dragOffset.value}px)` : undefined,
    transition: dragging.value ? 'none' : undefined,
  }
})

/* ── overlay registration ──────────────────────────────────────────────── */

// True while the parent is the one closing us, so the stack's onClose does
// not echo a `close` back at a parent that already knows.
let closingFromParent = false

function syncOverlay(isOpen) {
  if (isOpen) {
    overlays.open(props.id, {
      modal: props.modal,
      dismissible: props.dismissible,
      // A non-modal surface is not a "summon" in the §3 sense — the Ledger
      // coexists with anything else — so it must not evict its peers.
      exclusive: props.modal,
      onClose: () => {
        if (!closingFromParent) emit('close')
      },
    })
  } else {
    closingFromParent = true
    overlays.close(props.id)
    closingFromParent = false
  }
}

watch(() => props.open, syncOverlay, { immediate: true })

onBeforeUnmount(() => {
  closingFromParent = true
  overlays.close(props.id)
})

/* ── focus ─────────────────────────────────────────────────────────────── */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Deliberately not filtered by layout. `offsetParent` is null for anything
 * inside a position: fixed subtree — which every presentation here is — so
 * a layout-based visibility test would empty the list and disable the trap.
 */
function focusablesIn(root) {
  return [...root.querySelectorAll(FOCUSABLE)].filter(
    (element) => !element.hasAttribute('hidden') && element.getAttribute('aria-hidden') !== 'true',
  )
}

/**
 * Only a modal surface takes focus. A non-modal one may appear without the
 * viewer asking — the Ledger arrives with a world — and yanking focus out of
 * whatever they were doing would be a theft, not a courtesy.
 */
async function focusIntoSurface() {
  if (!props.modal) return
  await nextTick()
  const root = surface.value
  if (!root) return
  const target = root.querySelector('[data-autofocus]') ?? focusablesIn(root)[0] ?? root
  target.focus?.()
}

/**
 * Keeps Tab inside a modal surface. Non-modal surfaces (the Ledger) must NOT
 * trap: the viewer has to be able to tab back out to the world's controls.
 */
function onKeydown(event) {
  if (event.key !== 'Tab' || !props.modal || !surface.value) return

  const focusables = focusablesIn(surface.value)
  if (focusables.length === 0) {
    event.preventDefault()
    return
  }

  const first = focusables[0]
  const last = focusables.at(-1)

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

/* ── hiding the background from assistive technology ───────────────────── */

let restoreInert = null
/**
 * Bumped on every open/close. applyInert runs after an await, so without a
 * generation to check against, a surface that closed during that await
 * would still hide the background — and never restore it, because the
 * close already ran. That left the whole app inert: nothing clickable but
 * the one panel teleported outside it.
 */
let inertGeneration = 0

function applyInert() {
  if (!props.modal || restoreInert || typeof document === 'undefined') return
  const wrapper = surface.value?.closest('[data-sheet-root]')
  const changed = []

  for (const child of [...document.body.children]) {
    if (child === wrapper || child.contains(wrapper)) continue
    changed.push([child, child.hasAttribute('inert')])
    child.setAttribute('inert', '')
  }

  restoreInert = () => {
    for (const [element, had] of changed) {
      if (!had) element.removeAttribute('inert')
    }
    restoreInert = null
  }
}

watch(
  () => props.open,
  async (isOpen) => {
    const generation = ++inertGeneration

    if (!isOpen) {
      restoreInert?.()
      return
    }

    await focusIntoSurface()
    // Closed while we waited: leave the background alone.
    if (generation !== inertGeneration || !props.open) return
    applyInert()
  },
  { immediate: true },
)

onBeforeUnmount(() => restoreInert?.())

/* ── drag and snap ─────────────────────────────────────────────────────── */

let dragStartY = 0
let dragStartHeight = 0

function onDragStart(event) {
  if (!isSheet.value || props.collapsed) return
  dragging.value = true
  dragStartY = event.clientY
  dragStartHeight = snapFraction.value * window.innerHeight
  event.target.setPointerCapture?.(event.pointerId)
  window.addEventListener('pointermove', onDragMove)
  window.addEventListener('pointerup', onDragEnd)
  window.addEventListener('pointercancel', onDragEnd)
}

function onDragMove(event) {
  if (!dragging.value) return
  const delta = event.clientY - dragStartY
  const maxHeight = Math.max(...props.snapPoints) * window.innerHeight

  // Rubber band above the tallest snap: the sheet resists rather than
  // stopping dead, so the limit is felt instead of just hit.
  if (dragStartHeight - delta > maxHeight) {
    const overshoot = dragStartHeight - delta - maxHeight
    dragOffset.value = delta + overshoot * 0.7
  } else {
    dragOffset.value = delta
  }
}

function onDragEnd() {
  if (!dragging.value) return
  window.removeEventListener('pointermove', onDragMove)
  window.removeEventListener('pointerup', onDragEnd)
  window.removeEventListener('pointercancel', onDragEnd)
  dragging.value = false

  const settledHeight = dragStartHeight - dragOffset.value
  const fraction = settledHeight / window.innerHeight
  dragOffset.value = 0

  const lowest = Math.min(...props.snapPoints)
  // Dragged below the smallest snap: either dismiss, or settle on it.
  if (canDragDismiss.value && fraction < lowest * 0.6) {
    emit('close')
    return
  }

  let nearest = 0
  let bestDistance = Infinity
  props.snapPoints.forEach((point, index) => {
    const distance = Math.abs(point - fraction)
    if (distance < bestDistance) {
      bestDistance = distance
      nearest = index
    }
  })

  if (nearest !== props.snap) emit('update:snap', nearest)
}

onBeforeUnmount(onDragEnd)

function onScrimDismiss() {
  if (props.dismissible) emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" :class="['sheet-root', { 'sheet-root--modal': modal }]" data-sheet-root>
      <Transition name="scrim">
        <Scrim v-if="modal" :dismissible="dismissible" @dismiss="onScrimDismiss" />
      </Transition>

      <Transition :name="`sheet-${resolvedPresentation}`" appear>
        <section
          ref="surface"
          class="sheet"
          :class="[
            `sheet--${resolvedPresentation}`,
            `sheet--${side}`,
            { 'sheet--dragging': dragging, 'sheet--collapsed': collapsed, 'sheet--compact': compact },
          ]"
          :style="surfaceStyle"
          :role="modal ? 'dialog' : undefined"
          :aria-modal="modal ? 'true' : undefined"
          :aria-label="label || undefined"
          :aria-labelledby="labelledby || undefined"
          tabindex="-1"
          @keydown="onKeydown"
        >
          <template v-if="collapsed">
            <slot name="collapsed" />
            <!-- Persistent footers (e.g. Ledger legend) stay reachable when
                 the bar is the only chrome left — collapsing must not hide
                 the only way back into a summoned surface. -->
            <footer v-if="$slots.footer" class="sheet__footer sheet__footer--collapsed">
              <slot name="footer" />
            </footer>
          </template>

          <template v-else>
          <div
            v-if="isSheet"
            class="sheet__grip"
            role="separator"
            aria-orientation="horizontal"
            :aria-label="`Resize ${label || 'panel'}`"
            @pointerdown="onDragStart"
          >
            <span class="sheet__grip-bar" />
          </div>

          <header v-if="$slots.header" class="sheet__header">
            <slot name="header" />
          </header>

          <div class="sheet__body">
            <slot />
          </div>

          <footer v-if="$slots.footer" class="sheet__footer">
            <slot name="footer" />
          </footer>
          </template>
        </section>
      </Transition>
    </div>
  </Teleport>
</template>

<style scoped>
/**
 * One stacking context per surface. The scrim and the surface order
 * themselves inside it, so no presentation needs its own z-index.
 *
 * A MODAL surface sits a rung higher than a persistent one, which is what
 * the ladder in tokens.css meant all along by separating `sheets` from
 * `overlays` — and what this originally got wrong by putting every sheet on
 * the same rung. Equal z-index leaves DOM order to decide, and DOM order
 * here is not what anyone would guess: Vue places a Teleport's anchor when
 * the TELEPORT mounts, not when its content appears, so the menus (which
 * exist from app start with nothing in them) anchor ahead of the Ledger
 * (which mounts only once an article resolves). The Ledger therefore
 * painted over every menu.
 *
 * pointer-events are off here and back on for the children: a non-modal
 * panel renders inside a full-viewport root, and without this the invisible
 * root would swallow every click meant for the world behind it.
 */
.sheet-root {
  position: fixed;
  inset: 0;
  z-index: var(--z-sheets);
  pointer-events: none;
}

.sheet-root--modal {
  z-index: var(--z-overlays);
}

.sheet {
  position: fixed;
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  box-sizing: border-box;
  color: var(--ink-1);
  background: var(--surface-1);
  border: 1px solid var(--edge-line);
  backdrop-filter: blur(14px);
  box-shadow: var(--shadow-panel);
  transition: height var(--dur-2) var(--ease-out), transform var(--dur-2) var(--ease-out);
}

.sheet:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

/* Centred, for a surface that wants the viewer's whole attention. */
.sheet--dialog {
  top: 50%;
  left: 50%;
  width: min(560px, 92vw);
  max-height: 86dvh;
  transform: translate(-50%, -50%);
  border-radius: var(--radius-lg);
}

/* Up from the bottom edge, within thumb reach, resizable by its grip. */
.sheet--sheet {
  right: 0;
  bottom: 0;
  left: 0;
  border-width: 1px 0 0;
  border-radius: var(--radius-sheet) var(--radius-sheet) 0 0;
  padding-bottom: env(safe-area-inset-bottom, 0);
}

/* In from a side edge: the `short` case, where height is what is scarce. */
.sheet--drawer {
  top: 0;
  bottom: 0;
  width: min(340px, 86vw);
  border-radius: 0;
}

.sheet--drawer.sheet--left {
  left: 0;
  border-width: 0 1px 0 0;
  padding-left: env(safe-area-inset-left, 0);
}

.sheet--drawer.sheet--right {
  right: 0;
  border-width: 0 0 0 1px;
  padding-right: env(safe-area-inset-right, 0);
}

/* Docked to a corner and non-modal: the world stays usable around it. */
.sheet--panel {
  bottom: var(--spacing-md);
  width: min(400px, 92vw);
  max-height: 60dvh;
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-float);
}

.sheet--panel.sheet--left {
  left: var(--spacing-md);
}

.sheet--panel.sheet--right {
  right: var(--spacing-md);
}

.sheet--collapsed {
  height: auto;
  max-height: none;
}

.sheet--compact {
  height: auto;
}

.sheet--compact .sheet__body {
  flex: none;
  height: 0;
  min-height: 0;
  padding: 0;
  overflow: hidden;
}

.sheet--dragging {
  transition: none;
  user-select: none;
}

.sheet__grip {
  display: grid;
  flex: none;
  place-items: center;
  /* Comfortably larger than the bar it draws: this is the one control a
     viewer aims at with a thumb, mid-scroll. */
  min-height: var(--hit);
  height: var(--hit);
  cursor: grab;
  touch-action: none;
}

.sheet__grip:active {
  cursor: grabbing;
}

.sheet__grip-bar {
  width: 42px;
  height: 4px;
  border-radius: 2px;
  background: rgba(var(--edge-rgb), 0.55);
}

.sheet__header {
  flex: none;
  padding: var(--spacing-md) var(--spacing-md) var(--spacing-sm);
}

.sheet__body {
  flex: 1;
  min-height: 0;
  padding: 0 var(--spacing-md) var(--spacing-md);
  overflow-y: auto;
  /* Keeps a scroll gesture inside the surface instead of handing it to the
     world's orbit controls underneath. */
  overscroll-behavior: contain;
}

.sheet__footer {
  flex: none;
  padding: var(--spacing-sm) var(--spacing-md) var(--spacing-md);
  border-top: 1px solid var(--edge-line);
}

.sheet__footer--collapsed {
  padding-top: var(--spacing-sm);
}

.scrim-enter-active,
.scrim-leave-active {
  transition: opacity var(--dur-2) var(--ease-out);
}

.scrim-enter-from,
.scrim-leave-to {
  opacity: 0;
}

.sheet-dialog-enter-active,
.sheet-dialog-leave-active,
.sheet-sheet-enter-active,
.sheet-sheet-leave-active,
.sheet-drawer-enter-active,
.sheet-drawer-leave-active,
.sheet-panel-enter-active,
.sheet-panel-leave-active {
  transition: opacity var(--dur-2) var(--ease-out), transform var(--dur-2) var(--ease-out);
}

.sheet-dialog-enter-from,
.sheet-dialog-leave-to {
  opacity: 0;
  transform: translate(-50%, calc(-50% + 12px));
}

.sheet-sheet-enter-from,
.sheet-sheet-leave-to {
  transform: translateY(100%);
}

.sheet-drawer-enter-from,
.sheet-drawer-leave-to {
  opacity: 0;
  transform: translateX(-8%);
}

.sheet--right.sheet-drawer-enter-from,
.sheet--right.sheet-drawer-leave-to {
  transform: translateX(8%);
}

.sheet-panel-enter-from,
.sheet-panel-leave-to {
  opacity: 0;
  transform: translateY(12px);
}
</style>
