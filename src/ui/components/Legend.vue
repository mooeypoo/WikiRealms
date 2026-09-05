<script setup>
import { computed } from 'vue'
import Icon from '../design/Icon.vue'
import {
  FEATURE_LEGEND,
  GROUND_LEGEND,
  SNOW_SWATCH,
  WATER_SWATCH,
  swatchFor,
} from '../content/legend.js'

/**
 * The world, annotated.
 *
 * Deliberately not a modal. What the markers mean is a question about the
 * thing on screen, and answering it in a dialog that covers the thing is
 * answering it badly. So the world dims and labels itself: features that
 * are actually visible get pointed at where they sit, and the colour
 * semantics — which are everywhere at once and cannot be pointed at — get
 * a key down the side.
 */
const props = defineProps({
  show: Boolean,
  /**
   * Screen anchors for features currently visible, from the renderer:
   * `{ range: {x, y, label}, portal: {x, y, label} }`. Absent entries
   * simply go unannotated — pointing at something off-screen is worse
   * than not pointing.
   */
  anchors: { type: Object, default: () => ({}) },
})

defineEmits(['close'])

const annotations = computed(() =>
  FEATURE_LEGEND.filter((entry) => props.anchors[entry.id]).map((entry) => ({
    ...entry,
    anchor: props.anchors[entry.id],
  })),
)

const keyed = computed(() => FEATURE_LEGEND.filter((entry) => !props.anchors[entry.id]))
</script>

<template>
  <Teleport to="body">
    <Transition name="legend">
      <div v-if="show" class="legend" role="dialog" aria-label="What you are looking at" @click="$emit('close')">
        <!-- Labels pinned to real features, with a line back to each. -->
        <svg class="legend__leaders" aria-hidden="true">
          <template v-for="item in annotations" :key="item.id">
            <line :x1="item.anchor.x" :y1="item.anchor.y" :x2="item.anchor.x" :y2="item.anchor.y - 26" />
            <circle :cx="item.anchor.x" :cy="item.anchor.y" r="3.5" />
          </template>
        </svg>

        <p
          v-for="item in annotations"
          :key="item.id"
          class="legend__pin"
          :style="{ transform: `translate(${item.anchor.x}px, ${item.anchor.y - 30}px)` }"
        >
          <strong>{{ item.anchor.label ?? item.label }}</strong>
          <span>{{ item.detail }}</span>
        </p>

        <aside class="legend__key" @click.stop>
          <header class="legend__head">
            <h2>What you are looking at</h2>
            <button type="button" aria-label="Close the legend" @click="$emit('close')">
              <Icon name="close" :size="16" />
            </button>
          </header>

          <section>
            <h3>The ground is citation density</h3>
            <ul class="legend__ground">
              <li v-for="entry in GROUND_LEGEND" :key="entry.biome">
                <span class="legend__swatch" :style="{ background: swatchFor(entry.biome) }" />
                <span class="legend__text">
                  <strong>{{ entry.label }}</strong>
                  <span>{{ entry.detail }}</span>
                </span>
              </li>
            </ul>
          </section>

          <section v-if="keyed.length">
            <h3>And the rest</h3>
            <ul class="legend__features">
              <li v-for="entry in keyed" :key="entry.id">
                <span
                  class="legend__swatch"
                  :style="{
                    background:
                      entry.id === 'water' ? WATER_SWATCH : entry.id === 'snow' ? SNOW_SWATCH : 'var(--accent)',
                  }"
                />
                <span class="legend__text">
                  <strong>{{ entry.label }}</strong>
                  <span>{{ entry.detail }}</span>
                </span>
              </li>
            </ul>
          </section>

          <p class="legend__dismiss">Press <kbd>L</kbd> or click the world to put this away.</p>
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
  stroke-width: 1;
}

.legend__leaders circle {
  fill: none;
  stroke: var(--accent);
  stroke-width: 1.5;
}

.legend__pin {
  position: absolute;
  top: 0;
  left: 0;
  display: grid;
  gap: 1px;
  margin: 0;
  max-width: 220px;
  padding: var(--spacing-sm) var(--spacing-md);
  border: 1px solid var(--edge-accent);
  border-radius: var(--radius-md);
  background: var(--surface-1-solid);
  transform-origin: bottom left;
  pointer-events: none;
}

.legend__pin strong {
  color: var(--ink-1);
  font-size: var(--text-sm);
  font-weight: 500;
}

.legend__pin span {
  color: var(--ink-2);
  font-size: var(--text-xs);
  line-height: 1.45;
}

.legend__key {
  position: absolute;
  top: 50%;
  right: max(var(--spacing-md), env(safe-area-inset-right, 0px));
  display: grid;
  gap: var(--spacing-md);
  width: min(320px, calc(100vw - 24px));
  max-height: 80dvh;
  padding: var(--spacing-md);
  overflow-y: auto;
  border: 1px solid var(--edge-hair);
  border-radius: var(--radius-lg);
  background: var(--surface-1-solid);
  box-shadow: var(--shadow-panel);
  transform: translateY(-50%);
  cursor: default;
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
  width: 32px;
  height: 32px;
  border: 1px solid var(--edge-hair);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--ink-2);
}

.legend__key h3 {
  margin: 0 0 var(--spacing-sm);
  color: var(--ink-3);
  font-family: var(--font-mono);
  font-size: 9px;
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

.legend__dismiss {
  margin: 0;
  color: var(--ink-3);
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
    right: var(--spacing-sm);
    bottom: max(var(--spacing-sm), env(safe-area-inset-bottom, 0px));
    left: var(--spacing-sm);
    width: auto;
    max-height: 62dvh;
    transform: none;
  }
}
</style>
