<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Icon from '../design/Icon.vue'
import { placeCard } from '../rendering/anchorPlacement.js'

/**
 * Where a portal goes, asked at the portal.
 *
 * Travel used to be a centred confirm dialog: no destination context, no
 * relationship to the thing tapped, and dropped in the middle of the screen
 * away from where the viewer was looking. The preview IS the confirmation —
 * naming the destination is most of what a confirm step is for — so this
 * replaces both the question and the answer with one card at the marker.
 *
 * It never covers its own marker, and never leaves the viewport: see
 * anchorPlacement.js, which also stops it appearing for portals on the far
 * side of the planet at all.
 */
const props = defineProps({
  portal: { type: Object, default: null },
  /** Marker position in viewport pixels, or null if it cannot be placed. */
  anchor: { type: Object, default: null },
})

const emit = defineEmits(['travel', 'dismiss'])

const card = ref(null)
const size = ref({ width: 260, height: 132 })
const viewport = ref({ width: 0, height: 0 })

function measure() {
  viewport.value = { width: window.innerWidth, height: window.innerHeight }
  if (card.value) {
    const rect = card.value.getBoundingClientRect()
    if (rect.width) size.value = { width: rect.width, height: rect.height }
  }
}

onMounted(() => {
  measure()
  window.addEventListener('resize', measure)
})

onBeforeUnmount(() => window.removeEventListener('resize', measure))

// Re-measure once the card exists: its height depends on how long the
// destination's name wraps, which nothing can know in advance.
watch(() => props.portal, () => requestAnimationFrame(measure))

const placement = computed(() => {
  if (!props.anchor) return null
  return placeCard({ anchor: props.anchor, card: size.value, viewport: viewport.value })
})

const style = computed(() =>
  placement.value ? { transform: `translate(${placement.value.x}px, ${placement.value.y}px)` } : { display: 'none' },
)
</script>

<template>
  <Teleport to="body">
    <Transition name="preview">
      <div v-if="portal && anchor" class="preview-layer" @click.self="$emit('dismiss')">
        <!-- A line back to the marker, so the card reads as belonging to it
             rather than floating near it. -->
        <svg class="preview__leader" aria-hidden="true">
          <line
            v-if="placement"
            :x1="anchor.x"
            :y1="anchor.y"
            :x2="placement.x + size.width / 2"
            :y2="placement.side === 'above' ? placement.y + size.height : placement.y"
          />
          <circle :cx="anchor.x" :cy="anchor.y" r="3" />
        </svg>

        <section
          ref="card"
          class="preview"
          :style="style"
          role="dialog"
          aria-labelledby="preview-title"
        >
          <p class="preview__label">Portal to</p>
          <h2 id="preview-title" class="preview__title">{{ portal.targetTitle }}</h2>

          <div class="preview__actions">
            <button class="preview__go" type="button" data-autofocus @click="$emit('travel', portal)">
              Travel
              <Icon name="chevron-right" :size="15" />
            </button>
            <button class="preview__stay" type="button" @click="$emit('dismiss')">Stay</button>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.preview-layer {
  position: fixed;
  inset: 0;
  /* A summon, so it outranks the persistent panels for the same reason the
     menus do — and it is anchored to a marker the Ledger may be sitting on. */
  z-index: var(--z-overlays);
}

.preview__leader {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.preview__leader line {
  stroke: var(--edge-accent);
  stroke-width: 1;
  stroke-dasharray: 3 3;
}

.preview__leader circle {
  fill: var(--accent);
}

.preview {
  position: absolute;
  top: 0;
  left: 0;
  display: grid;
  gap: var(--spacing-sm);
  width: max-content;
  max-width: min(280px, calc(100vw - 24px));
  padding: var(--spacing-md);
  border: 1px solid var(--edge-accent);
  border-radius: var(--radius-lg);
  /* Opaque, not translucent: this card lands over bright terrain as often
     as dark sky, and it has to be readable over both. */
  background: var(--surface-1-solid);
  box-shadow: var(--shadow-panel);
}

.preview__label {
  margin: 0;
  color: var(--ink-2);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: var(--tracking-label);
  text-transform: uppercase;
}

.preview__title {
  margin: 0;
  color: var(--ink-1);
  font-size: var(--text-md);
  font-weight: 500;
  text-wrap: pretty;
}

.preview__actions {
  display: flex;
  gap: var(--spacing-sm);
  margin-top: var(--spacing-xs);
}

.preview__go,
.preview__stay {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: var(--hit);
  padding: 0 var(--spacing-md);
  border-radius: var(--radius-md);
  font: inherit;
  font-size: var(--text-sm);
}

.preview__go {
  border: 1px solid var(--edge-accent);
  background: var(--accent-wash);
  color: var(--accent-ink);
}

.preview__go:hover {
  background: rgba(var(--accent-rgb), 0.24);
}

.preview__stay {
  border: 1px solid transparent;
  background: none;
  color: var(--ink-3);
}

.preview__stay:hover {
  color: var(--ink-1);
}

.preview-enter-active,
.preview-leave-active {
  transition: opacity var(--dur-1) var(--ease-out);
}

.preview-enter-from,
.preview-leave-to {
  opacity: 0;
}
</style>
