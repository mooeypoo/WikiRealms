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
})

defineEmits(['update:worldShape', 'recenter'])

const SHAPES = [
  { value: 'sphere', label: 'Planet', icon: 'globe' },
  { value: 'flat', label: 'Flat', icon: 'map' },
]
</script>

<template>
  <div class="helm">
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
      class="helm__recenter"
      type="button"
      aria-label="Recentre the view"
      title="Recentre the view"
      :disabled="disabled"
      @click="$emit('recenter')"
    >
      <Icon name="crosshair" :size="18" />
    </button>
  </div>
</template>

<style scoped>
.helm {
  position: fixed;
  right: max(var(--spacing-md), env(safe-area-inset-right, 0px));
  bottom: max(var(--spacing-md), env(safe-area-inset-bottom, 0px));
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
.helm__recenter:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.helm__recenter {
  display: grid;
  place-items: center;
  width: var(--hit);
  height: var(--hit);
  border: 1px solid var(--edge-hair);
  border-radius: var(--radius-lg);
  background: var(--surface-1);
  backdrop-filter: blur(14px);
  box-shadow: var(--shadow-float);
  color: var(--ink-2);
}

.helm__recenter:hover:not(:disabled) {
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
