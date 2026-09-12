<script setup>
import { computed, onBeforeUnmount, onMounted, onUnmounted, ref, watch } from 'vue'
import Icon from '../design/Icon.vue'
import { useOverlays } from '../design/useOverlays.js'
import { useViewport } from '../design/useViewport.js'
import {
  CREATURE_SWATCH,
  FOLIAGE_SWATCH,
  SNOW_SWATCH,
  WATER_SWATCH,
  featureLegend,
  groundLegend,
  lushnessCeilingNote,
} from '../content/legend.js'
import { useI18n } from '../i18n/banana.js'
import { legendKeyReserves, placeLegendPins } from '../rendering/legendPinPlacement.js'

/**
 * The world, annotated.
 *
 * Deliberately not a modal. What the markers mean is a question about the
 * thing on screen, and answering it in a dialog that covers the thing is
 * answering it badly. So the world dims and labels itself: features that
 * are actually visible get pointed at where they sit, and the colour
 * semantics — which are everywhere at once and cannot be pointed at — get
 * a key down the side.
 *
 * Callout pins float beside their markers with leaders back to a ring on
 * the feature, and placement spreads them when two anchors project near
 * each other — stacking the boxes on the markers made them unreadable.
 */
const props = defineProps({
  show: Boolean,
  /**
   * Screen anchors for features currently visible, from the renderer:
   * `{ range: {x, y, name}, portal: {x, y, name} }`. Absent entries
   * simply go unannotated — pointing at something off-screen is worse
   * than not pointing.
   */
  anchors: { type: Object, default: () => ({}) },
})

const emit = defineEmits(['close'])

const { t } = useI18n()
const overlays = useOverlays()
const viewport = useViewport()
const frame = ref({ width: 0, height: 0 })

const groundRows = computed(() => groundLegend())
const features = computed(() => featureLegend())
const ceilingNote = computed(() => lushnessCeilingNote())

function measureFrame() {
  frame.value = { width: window.innerWidth, height: window.innerHeight }
}

onMounted(() => {
  measureFrame()
  window.addEventListener('resize', measureFrame)
})

onUnmounted(() => window.removeEventListener('resize', measureFrame))

const dismissCopy = computed(() =>
  viewport.atLeast('md')
    ? t('wikirealms-legend-dismiss-desktop')
    : t('wikirealms-legend-dismiss-mobile'),
)

// It is a summon like any other, so it takes its turn in the stack: Escape
// closes it, and opening something else puts it away rather than leaving
// two explanations of the world on screen at once.
watch(
  () => props.show,
  (open) => {
    if (open) {
      measureFrame()
      overlays.open('legend', { onClose: () => emit('close') })
    } else overlays.close('legend')
  },
  { immediate: true },
)

onBeforeUnmount(() => overlays.close('legend'))

const annotated = computed(() =>
  features.value.filter((entry) => props.anchors[entry.id]).map((entry) => ({
    ...entry,
    anchor: props.anchors[entry.id],
  })),
)

const placedPins = computed(() => {
  const reserves = legendKeyReserves(frame.value)
  const placements = placeLegendPins({
    anchors: annotated.value.map((item) => ({
      id: item.id,
      x: item.anchor.x,
      y: item.anchor.y,
    })),
    viewport: frame.value,
    ...reserves,
  })
  const byId = new Map(placements.map((placement) => [placement.id, placement]))

  return annotated.value
    .map((item) => {
      const placement = byId.get(item.id)
      if (!placement) return null
      return { ...item, placement, title: pinTitle(item) }
    })
    .filter(Boolean)
})

const keyed = computed(() => features.value.filter((entry) => !props.anchors[entry.id]))

function featureSwatch(id) {
  if (id === 'water') return WATER_SWATCH
  if (id === 'snow') return SNOW_SWATCH
  if (id === 'foliage') return FOLIAGE_SWATCH
  if (id === 'creatures') return CREATURE_SWATCH
  return 'var(--accent)'
}

/** Title line for a pin: name in italics, role in plain words. */
function pinTitle(item) {
  const name = item.anchor?.name
  if (item.id === 'range' && name) {
    return { kind: 'section', name }
  }
  if (item.id === 'portal' && name) {
    return { kind: 'portal', name }
  }
  // Legacy string labels (stories / older callers) still render.
  return { kind: 'plain', text: item.anchor?.label ?? item.label }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="legend">
      <div
        v-if="show"
        class="legend"
        role="dialog"
        :aria-label="t('wikirealms-legend-title')"
        @click="$emit('close')"
      >
        <!-- Leaders from each callout to a ring on the real feature. -->
        <svg class="legend__leaders" aria-hidden="true">
          <template v-for="item in placedPins" :key="item.id">
            <line
              :x1="item.placement.leader.x1"
              :y1="item.placement.leader.y1"
              :x2="item.placement.leader.x2"
              :y2="item.placement.leader.y2"
            />
            <circle :cx="item.placement.anchor.x" :cy="item.placement.anchor.y" r="4" />
          </template>
        </svg>

        <p
          v-for="item in placedPins"
          :key="item.id"
          class="legend__pin"
          :style="{ transform: `translate(${item.placement.pin.x}px, ${item.placement.pin.y}px)` }"
        >
          <strong>
            <template v-if="item.title.kind === 'section'">
              <em><bdi>{{ item.title.name }}</bdi></em><bdi>{{ t('wikirealms-legend-pin-section-suffix') }}</bdi>
            </template>
            <template v-else-if="item.title.kind === 'portal'">
              <bdi>{{ t('wikirealms-legend-pin-portal-prefix') }}</bdi><em><bdi>{{ item.title.name }}</bdi></em>
            </template>
            <template v-else>{{ item.title.text }}</template>
          </strong>
          <span><bdi>{{ item.detail }}</bdi></span>
        </p>

        <aside class="legend__key" @click.stop>
          <header class="legend__head">
            <h2><bdi>{{ t('wikirealms-legend-title') }}</bdi></h2>
            <button type="button" :aria-label="t('wikirealms-legend-close')" @click="$emit('close')">
              <Icon name="close" :size="16" />
            </button>
          </header>

          <section>
            <h3><bdi>{{ t('wikirealms-legend-ground-heading') }}</bdi></h3>
            <ul class="legend__ground">
              <li v-for="entry in groundRows" :key="entry.biome">
                <span class="legend__swatch" :style="{ background: entry.swatch }" />
                <span class="legend__text">
                  <strong><bdi>{{ entry.name }}</bdi></strong>
                  <span><bdi>{{ entry.detail }}</bdi></span>
                </span>
              </li>
            </ul>
            <p class="legend__note"><bdi>{{ ceilingNote }}</bdi></p>
          </section>

          <section v-if="keyed.length">
            <h3><bdi>{{ t('wikirealms-legend-rest-heading') }}</bdi></h3>
            <ul class="legend__features">
              <li v-for="entry in keyed" :key="entry.id">
                <span class="legend__swatch" :style="{ background: featureSwatch(entry.id) }" />
                <span class="legend__text">
                  <strong><bdi>{{ entry.label }}</bdi></strong>
                  <span><bdi>{{ entry.detail }}</bdi></span>
                </span>
              </li>
            </ul>
          </section>

          <p class="legend__dismiss"><bdi>{{ dismissCopy }}</bdi></p>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.legend {
  position: fixed;
  inset: 0;
  z-index: var(--z-overlays);
  /* Dims rather than covers: the whole point is that you can still see
     what is being described. */
  background: rgba(var(--surface-1-rgb), 0.62);
  cursor: pointer;
}

.legend__leaders {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.legend__leaders line {
  stroke: var(--accent);
  stroke-width: 1.25;
  stroke-dasharray: 4 4;
}

.legend__leaders circle {
  fill: rgba(var(--accent-rgb), 0.2);
  stroke: var(--accent);
  stroke-width: 1.75;
}

.legend__pin {
  position: absolute;
  top: 0;
  left: 0;
  display: grid;
  gap: 2px;
  margin: 0;
  width: max-content;
  max-width: 220px;
  padding: var(--spacing-sm) var(--spacing-md);
  border: 1px solid var(--edge-accent);
  border-radius: var(--radius-md);
  background: var(--surface-1-solid);
  box-shadow: var(--shadow-float);
  pointer-events: none;
}

.legend__pin strong {
  color: var(--ink-1);
  font-size: var(--text-sm);
  font-weight: 500;
  line-height: 1.35;
}

.legend__pin em {
  font-style: italic;
  font-weight: 500;
  color: var(--accent-ink);
}

.legend__pin span {
  color: var(--ink-2);
  font-size: var(--text-xs);
  line-height: 1.45;
}

.legend__key {
  /* Dock to the inline end; safe-area env() is physical (exception 3). */
  position: absolute;
  top: 50%;
  inset-inline-end: max(var(--spacing-md), env(safe-area-inset-right, 0px));
  display: grid;
  gap: var(--spacing-md);
  width: min(320px, calc(100vw - 24px));
  max-height: 80dvh;
  padding: var(--spacing-md);
  overflow-y: auto;
  border: 1px solid var(--edge-line);
  border-radius: var(--radius-lg);
  background: var(--surface-1-solid);
  box-shadow: var(--shadow-panel);
  transform: translateY(-50%);
  cursor: default;
}

[dir='rtl'] .legend__key {
  inset-inline-end: max(var(--spacing-md), env(safe-area-inset-left, 0px));
}

.legend__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-md);
}

.legend__head h2 {
  margin: 0;
  font-size: var(--text-md);
}

.legend__head button {
  display: grid;
  place-items: center;
  width: var(--hit);
  height: var(--hit);
  border: 1px solid var(--edge-line);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--ink-2);
}

.legend__key h3 {
  margin: 0 0 var(--spacing-sm);
  color: var(--ink-2);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  font-weight: 400;
  letter-spacing: var(--tracking-label);
  text-transform: uppercase;
}

.legend__ground,
.legend__features {
  display: grid;
  gap: var(--spacing-sm);
  margin: 0;
  padding: 0;
  list-style: none;
}

.legend__ground li,
.legend__features li {
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-sm);
}

.legend__swatch {
  flex: none;
  width: 14px;
  height: 14px;
  margin-top: 2px;
  border: 1px solid rgba(var(--edge-rgb), 0.25);
  border-radius: var(--radius-sm);
}

.legend__text {
  display: grid;
  gap: 1px;
}

.legend__text strong {
  color: var(--ink-1);
  font-size: var(--text-sm);
  font-weight: 500;
}

.legend__text > span {
  color: var(--ink-3);
  font-size: var(--text-xs);
  line-height: 1.45;
}

.legend__note {
  margin: var(--spacing-sm) 0 0;
  color: var(--ink-2);
  font-size: var(--text-xs);
  line-height: 1.45;
}

.legend__dismiss {
  margin: 0;
  color: var(--ink-2);
  font-size: var(--text-xs);
}

.legend__dismiss kbd {
  padding: 1px 5px;
  border: 1px solid var(--edge-line);
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
}

.legend-enter-active,
.legend-leave-active {
  transition: opacity var(--dur-2) var(--ease-out);
}

.legend-enter-from,
.legend-leave-to {
  opacity: 0;
}

@media (max-width: 767px) {
  .legend__key {
    top: auto;
    /* Sit above the phone helm strip so Legend stays readable and closable. */
    bottom: calc(var(--hit) + var(--spacing-lg) + env(safe-area-inset-bottom, 0px));
    inset-inline: var(--spacing-sm);
    width: auto;
    max-height: 56dvh;
    transform: none;
  }

  [dir='rtl'] .legend__key {
    /* inset-inline already mirrored; reset desktop safe-area override. */
    inset-inline-end: var(--spacing-sm);
  }
}
</style>
