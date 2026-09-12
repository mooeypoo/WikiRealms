<script setup>
import { computed } from 'vue'
import { describeBand } from '../content/lushnessBands.js'
import {
  WIKIPEDIA_CTA_SURFACES,
  resolveWikipediaCta,
} from '../content/wikipediaCtas.js'
import { formatSubsections } from '../rendering/sectionStats.js'

const props = defineProps({
  /** @type {{ title: string, subsectionCount: number, wordsLabel: string, densityBand: number | null, sourcesLabel: string } | null} */
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

const subsectionLabel = computed(() => formatSubsections(props.model?.subsectionCount ?? 0))

/** Diegetic hint only — tooltip stays non-interactive. */
const ctaNotice = computed(
  () =>
    resolveWikipediaCta(WIKIPEDIA_CTA_SURFACES.TOOLTIP_HINT, {
      densityBand: props.model?.densityBand ?? null,
    })?.notice ?? null,
)
</script>

<template>
  <div
    v-if="visible && model"
    class="section-tooltip"
    :style="{ transform: `translate(${screenX}px, ${screenY}px)` }"
    role="tooltip"
    aria-live="polite"
  >
    <div class="section-tooltip__body" :class="{ 'has-cta': Boolean(ctaNotice) }">
      <div class="section-tooltip__main">
        <h3 class="section-tooltip__title"><bdi>{{ model.title }}</bdi></h3>
        <ul class="section-tooltip__meta">
          <li v-if="subsectionLabel" class="section-tooltip__chip">
            <bdi>{{ subsectionLabel }}</bdi>
          </li>
          <li class="section-tooltip__chip"><bdi>{{ model.wordsLabel }}</bdi></li>
          <li v-if="band" class="section-tooltip__chip section-tooltip__chip--density">
            <!-- Colour comes from the terrain renderer's own biomeColor, so
                 the dot is literally the shade of the ground below. -->
            <span
              class="section-tooltip__dot"
              :style="{ background: band.swatch, color: band.swatch }"
              aria-hidden="true"
            ></span>
            <span class="section-tooltip__density-label"><bdi>{{ band.name }}</bdi></span>
          </li>
          <li v-if="model.sourcesLabel" class="section-tooltip__chip">
            <bdi>{{ model.sourcesLabel }}</bdi>
          </li>
        </ul>
      </div>
      <p v-if="ctaNotice" class="section-tooltip__cta"><bdi>{{ ctaNotice }}</bdi></p>
    </div>
  </div>
</template>
<style scoped>
.section-tooltip {
  /* Screen-space placement from JS (exception 2): top-left is the summit
     anchor in canvas pixels; margins nudge the card up/center over it. */
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
  z-index: var(--z-stage-label);
  /* Nudge up + center so the summit sits just below the tooltip's bottom edge.
     Extra height when the citation footer is present. */
  margin-top: -6.5rem;
  margin-left: -8.5rem;
  min-width: 12rem;
  max-width: 18rem;
}

.section-tooltip:has(.section-tooltip__cta) {
  margin-top: -8.25rem;
}

.section-tooltip__body {
  background: var(--surface-1);
  border: 1px solid var(--edge-line);
  border-radius: var(--radius-md);
  padding: 0;
  overflow: hidden;
  backdrop-filter: blur(8px);
  color: var(--ink-1);
  box-shadow: var(--shadow-float);
  /* Little caret pointing down toward the summit anchor. */
  position: relative;
}

.section-tooltip__body::after {
  content: '';
  position: absolute;
  bottom: -6px;
  /* Physical center of the tooltip box — exception (1); not reading-order. */
  left: 50%;
  transform: translateX(-50%) rotate(45deg);
  width: 10px;
  height: 10px;
  background: var(--surface-1);
  border-right: 1px solid var(--edge-line);
  border-bottom: 1px solid var(--edge-line);
}

/* Caret matches the accent footer when the citation strip is showing. */
.section-tooltip__body.has-cta::after {
  background: var(--accent-wash);
  border-right-color: rgba(var(--accent-rgb), 0.28);
  border-bottom-color: rgba(var(--accent-rgb), 0.28);
}

.section-tooltip__main {
  padding: 0.55rem 0.75rem 0.65rem;
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
  font-size: var(--text-xs);
  color: var(--ink-2);
  background: rgba(var(--edge-rgb), 0.12);
  border: 1px solid rgba(var(--edge-rgb), 0.35);
  border-radius: var(--radius-sm);
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

/**
 * Citation invite — same accent-wash footer grammar as the Field Guide
 * contribute strip. Still non-interactive (pointer-events stay off).
 */
.section-tooltip__cta {
  margin: 0;
  padding: 0.5rem 0.75rem 0.55rem;
  background: var(--accent-wash);
  border-top: 1px solid rgba(var(--accent-rgb), 0.28);
  color: var(--ink-1);
  font-family: var(--font-body);
  font-size: var(--text-xs);
  line-height: 1.4;
}
</style>
