<script setup>
import Icon from '../design/Icon.vue'

/**
 * The helm: how you are looking at the world.
 *
 * Third on the priority ladder (docs/ux-vision.md §3) and the only
 * persistent control that changes the world rather than the app — which is
 * why it sits beside the stage in the thumb zone instead of joining the
 * utility icons in the top scrim. It was previously buried in Settings,
 * under a second control that confusingly also said "Flat".
 */
defineProps({
  worldShape: { type: String, required: true },
  /** No world, nothing to look at — the helm stays visible but inert. */
  disabled: { type: Boolean, default: false },
  /**
   * The 2D fallback draws a fixed chart with no camera, so there is nothing
   * to recentre. Offering a button that does nothing is worse than not
   * offering one.
   */
  canRecenter: { type: Boolean, default: true },
  /**
   * How far to rise so the Ledger's sheet does not cover this. Only ever
   * non-zero on a phone, where the sheet and the helm share a corner —
   * everywhere else they are on opposite sides of the screen.
   */
  lift: { type: String, default: '0px' },
})

defineEmits(['update:worldShape', 'recenter', 'legend'])

const SHAPES = [
  { value: 'sphere', label: 'Planet', icon: 'globe' },
  { value: 'flat', label: 'Flat', icon: 'map' },
]
</script>

<template>
  <div class="helm" :style="{ '--helm-lift': lift }">
    <div class="helm__shapes" role="radiogroup" aria-label="World shape">
      <button
        v-for="shape in SHAPES"
        :key="shape.value"
        class="helm__shape"
        :class="{ 'helm__shape--active': worldShape === shape.value }"
        type="button"
        role="radio"
        :aria-checked="worldShape === shape.value"
        :disabled="disabled"
        @click="$emit('update:worldShape', shape.value)"
      >
        <Icon :name="shape.icon" :size="16" />
        <span class="helm__label">{{ shape.label }}</span>
      </button>
    </div>

    <button
      v-if="canRecenter"
      class="helm__action"
      type="button"
      aria-label="Recentre the view"
      title="Recentre the view"
      :disabled="disabled"
      @click="$emit('recenter')"
    >
      <Icon name="crosshair" :size="18" />
    </button>

    <!-- The legend belongs beside the world rather than among the app's
         utility icons: it explains what you are looking AT, which is the
         same subject as the rest of this cluster. Without it the legend
         was a keyboard secret, which no other summoned surface is.

         Its icon is a map key rather than a question mark: "?" already
         opens the About dialog, and two different things behind the same
         glyph is worse than a shortcut nobody finds. On wide screens the
         Legend label makes the control scannable; phones stay icon-only. -->
    <button
      class="helm__action helm__legend"
      type="button"
      aria-label="What am I looking at?"
      title="What am I looking at?"
      :disabled="disabled"
      @click="$emit('legend')"
    >
      <Icon name="legend" :size="18" />
      <span class="helm__label">Legend</span>
    </button>
  </div>
</template>

<style scoped>
.helm {
  position: fixed;
  right: max(var(--spacing-md), env(safe-area-inset-right, 0px));
  bottom: calc(max(var(--spacing-md), env(safe-area-inset-bottom, 0px)) + var(--helm-lift, 0px));
  transition: bottom var(--dur-2) var(--ease-out);
  z-index: var(--z-instruments);
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.helm__shapes {
  display: flex;
  gap: 3px;
  padding: 3px;
  border: 1px solid var(--edge-hair);
  border-radius: var(--radius-lg);
  background: var(--surface-1);
  backdrop-filter: blur(14px);
  box-shadow: var(--shadow-float);
}

.helm__shape {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  min-height: 38px;
  padding: 0 var(--spacing-md);
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--ink-3);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: var(--tracking-label);
  text-transform: uppercase;
}

.helm__shape:hover:not(:disabled) {
  color: var(--ink-1);
}

.helm__shape--active {
  border-color: var(--edge-accent);
  background: var(--accent-wash);
  color: var(--accent-ink);
}

.helm__shape:disabled,
.helm__action:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.helm__action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-sm);
  min-width: var(--hit);
  height: var(--hit);
  padding: 0;
  border: 1px solid var(--edge-hair);
  border-radius: var(--radius-lg);
  background: var(--surface-1);
  backdrop-filter: blur(14px);
  box-shadow: var(--shadow-float);
  color: var(--ink-2);
}

.helm__legend {
  padding: 0 var(--spacing-md);
}

.helm__legend .helm__label {
  color: inherit;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: var(--tracking-label);
  text-transform: uppercase;
}

.helm__action:hover:not(:disabled) {
  border-color: var(--edge-accent);
  color: var(--accent);
}

/* Below md the labels go and the buttons square up: the control has to
   clear the Ledger sheet beside it, and an icon pair reads fine once the
   two shapes are the only choice there is. */
@media (max-width: 767px) {
  .helm__label {
    display: none;
  }

  .helm__shape {
    width: var(--hit);
    min-height: var(--hit);
    padding: 0;
    justify-content: center;
  }

  .helm__legend {
    padding: 0;
  }
}

/* The `short` case: the Ledger becomes a right-hand drawer, so the helm
   moves to the opposite edge rather than sitting underneath it. */
@media (max-height: 520px) {
  .helm {
    right: auto;
    left: max(var(--spacing-md), env(safe-area-inset-left, 0px));
  }
}
</style>
