<script setup>
defineProps({
  /** @type {{ title: string, subsectionCount: number, wordsLabel: string, densityBucket: string } | null} */
  model: { type: Object, default: null },
  /** Anchor position in canvas-local pixels (left/top). */
  screenX: { type: Number, default: 0 },
  screenY: { type: Number, default: 0 },
  visible: { type: Boolean, default: false },
})
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
        <li class="section-tooltip__chip section-tooltip__chip--density">
          <span class="section-tooltip__dot" :class="`section-tooltip__dot--${model.densityBucket}`" aria-hidden="true"></span>
          <span class="section-tooltip__density-label">{{ model.densityBucket }}</span>
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
  z-index: 15;
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
  text-transform: capitalize;
}

.section-tooltip__dot {
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 50%;
  display: inline-block;
  box-shadow: 0 0 6px currentColor;
}

/* Semantic dot colors mirror the biome gradient: sandy → verdant → dense. */
.section-tooltip__dot--barren { background: #d3ad6d; color: #d3ad6d; }
.section-tooltip__dot--light { background: #b6c88a; color: #b6c88a; }
.section-tooltip__dot--moderate { background: #86c07a; color: #86c07a; }
.section-tooltip__dot--dense { background: #4b8f6f; color: #4b8f6f; }
.section-tooltip__dot--lush { background: #2f6a4c; color: #2f6a4c; }
</style>
