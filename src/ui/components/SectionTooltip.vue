<script setup>
import { computed } from 'vue'
import { describeBand } from '../content/lushnessBands.js'

const props = defineProps({
  /** @type {{ title: string, subsectionCount: number, wordsLabel: string, densityBand: number | null } | null} */
  model: { type: Object, default: null },
  /** Anchor position in canvas-local pixels (left/top). */
  screenX: { type: Number, default: 0 },
  screenY: { type: Number, default: 0 },
  visible: { type: Boolean, default: false },
})

/**
 * The band's words and colour, resolved here rather than in the render
 * model: the words are copy (ui/content/) and the colour is the terrain
 * renderer's own, and this component is the layer allowed to see both.
 */
const band = computed(() => describeBand(props.model?.densityBand))
</script>

<template>
  <div
    v-if="visible && model"
    class="section-tooltip"
    :style="{ transform: `translate(${screenX}px, ${screenY}px)` }"
    role="tooltip"
    aria-live="polite"
  >
    <div class="section-tooltip__body">
      <h3 class="section-tooltip__title">{{ model.title }}</h3>
      <ul class="section-tooltip__meta">
        <li v-if="model.subsectionCount > 0" class="section-tooltip__chip">
          {{ model.subsectionCount }} subsection<span v-if="model.subsectionCount !== 1">s</span>
        </li>
        <li class="section-tooltip__chip">{{ model.wordsLabel }}</li>
        <li v-if="band" class="section-tooltip__chip section-tooltip__chip--density">
          <!-- Colour comes from the terrain renderer's own biomeColor, so
               the dot is literally the shade of the ground below. -->
          <span
            class="section-tooltip__dot"
            :style="{ background: band.swatch, color: band.swatch }"
            aria-hidden="true"
          ></span>
          <span class="section-tooltip__density-label">{{ band.chip }}</span>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.section-tooltip {
  /* translate() from the reactive props positions the top-left anchor of
     the tooltip; the caret sits below it via the ::before pseudo-element. */
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
  z-index: var(--z-stage-label);
  /* Nudge up + center so the summit sits just below the tooltip's bottom edge. */
  margin-top: -6.5rem;
  margin-left: -8.5rem;
  min-width: 12rem;
  max-width: 18rem;
}

.section-tooltip__body {
  background: var(--surface-1);
  border: 1px solid var(--edge-hair);
  border-radius: 0.65rem;
  padding: 0.55rem 0.75rem 0.65rem;
  backdrop-filter: blur(8px);
  color: var(--ink-1);
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.35);
  /* Little caret pointing down toward the summit anchor. */
  position: relative;
}

.section-tooltip__body::after {
  content: '';
  position: absolute;
  bottom: -6px;
  left: 50%;
  transform: translateX(-50%) rotate(45deg);
  width: 10px;
  height: 10px;
  background: var(--surface-1);
  border-right: 1px solid var(--edge-hair);
  border-bottom: 1px solid var(--edge-hair);
}

.section-tooltip__title {
  font-family: var(--font-display);
  font-size: 0.95rem;
  font-weight: 500;
  margin: 0 0 0.35rem;
  color: var(--accent);
  letter-spacing: 0.02em;
}

.section-tooltip__meta {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}

.section-tooltip__chip {
  font-family: var(--font-body);
  font-size: 0.72rem;
  color: var(--ink-2);
  background: rgba(var(--edge-rgb), 0.12);
  border: 1px solid rgba(var(--edge-rgb), 0.25);
  border-radius: 0.4rem;
  padding: 0.12rem 0.4rem;
  white-space: nowrap;
}

.section-tooltip__chip--density {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  text-transform: none;
}

.section-tooltip__dot {
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 50%;
  display: inline-block;
  box-shadow: 0 0 6px currentColor;
}
</style>
