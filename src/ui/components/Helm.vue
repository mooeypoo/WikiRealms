<script setup>
import Icon from '../design/Icon.vue'
import { useI18n } from '../i18n/banana.js'

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
  /**
   * First-session nudge toward Legend. Dismissed once the viewer opens it
   * (or dismisses the tip), then remembered in preferences.
   */
  showHint: { type: Boolean, default: false },
})

defineEmits(['update:worldShape', 'recenter', 'legend', 'dismiss-hint'])

const { t } = useI18n()

const SHAPES = [
  { value: 'sphere', labelKey: 'wikirealms-helm-planet', icon: 'globe' },
  { value: 'flat', labelKey: 'wikirealms-helm-flat', icon: 'map' },
]
</script>

<template>
  <div class="helm" :style="{ '--helm-lift': lift }">
    <div class="helm__shapes" role="radiogroup" :aria-label="t('wikirealms-helm-shape')">
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
        <span class="helm__label">{{ t(shape.labelKey) }}</span>
      </button>
    </div>

    <button
      v-if="canRecenter"
      class="helm__action"
      type="button"
      :aria-label="t('wikirealms-helm-recenter')"
      :title="t('wikirealms-helm-recenter')"
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
    <div class="helm__legend-wrap">
      <p v-if="showHint" class="helm__hint" role="status">
        <span>{{ t('wikirealms-helm-legend-hint') }}</span>
        <button
          type="button"
          class="helm__hint-dismiss"
          :aria-label="t('wikirealms-dismiss-hint')"
          @click="$emit('dismiss-hint')"
        >
          <Icon name="close" :size="14" />
        </button>
      </p>
      <button
        class="helm__action helm__legend"
        :class="{ 'helm__legend--hint': showHint }"
        type="button"
        :aria-label="t('wikirealms-helm-legend-aria')"
        :title="t('wikirealms-helm-legend-aria')"
        :disabled="disabled"
        @click="$emit('legend')"
      >
        <Icon name="legend" :size="18" />
        <span class="helm__label">{{ t('wikirealms-legend-short') }}</span>
      </button>
    </div>
  </div>
</template>
<style scoped>
.helm {
  position: fixed;
  inset-inline-end: max(var(--spacing-md), env(safe-area-inset-right, 0px));
  bottom: calc(max(var(--spacing-md), env(safe-area-inset-bottom, 0px)) + var(--helm-lift, 0px));
  transition: bottom var(--dur-2) var(--ease-out);
  z-index: var(--z-instruments);
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

[dir='rtl'] .helm {
  inset-inline-end: max(var(--spacing-md), env(safe-area-inset-left, 0px));
}

.helm__shapes {
  display: flex;
  gap: 3px;
  padding: 3px;
  border: 1px solid var(--edge-line);
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
  color: var(--ink-2);
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
  background: rgba(var(--accent-rgb), 0.28);
  color: var(--accent-ink);
  box-shadow: inset 0 0 0 1px rgba(var(--accent-rgb), 0.35);
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
  border: 1px solid var(--edge-line);
  border-radius: var(--radius-lg);
  background: var(--surface-1);
  backdrop-filter: blur(14px);
  box-shadow: var(--shadow-float);
  color: var(--ink-1);
}

.helm__legend {
  padding: 0 var(--spacing-md);
}

.helm__legend-wrap {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--spacing-xs);
}

.helm__hint {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  margin: 0;
  max-width: 14rem;
  padding: var(--spacing-xs) var(--spacing-sm);
  border: 1px solid var(--edge-accent);
  border-radius: var(--radius-md);
  background: var(--surface-1);
  box-shadow: var(--shadow-float);
  backdrop-filter: blur(14px);
  color: var(--ink-1);
  font-family: var(--font-body);
  font-size: var(--text-xs);
  line-height: 1.35;
}

.helm__hint-dismiss {
  display: grid;
  place-items: center;
  flex: none;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--ink-2);
}

.helm__hint-dismiss:hover {
  color: var(--accent);
}

.helm__legend--hint {
  border-color: var(--edge-accent);
  color: var(--accent);
  animation: helm-hint-pulse 1.8s var(--ease-out) infinite;
}

@keyframes helm-hint-pulse {
  0%,
  100% {
    box-shadow: var(--shadow-float), 0 0 0 0 rgba(var(--accent-rgb), 0.35);
  }
  50% {
    box-shadow: var(--shadow-float), 0 0 0 6px rgba(var(--accent-rgb), 0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .helm__legend--hint {
    animation: none;
  }
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
   two shapes are the only choice there is. Sit above the sheet in paint
   order so the strip stays hittable when the ledger is open or full. */
@media (max-width: 767px) {
  .helm {
    z-index: var(--z-instruments-raised);
  }

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

/* The `short` case: the Ledger becomes a start-side drawer, so the helm
   moves to the opposite edge rather than sitting underneath it. */
@media (max-height: 520px) {
  .helm {
    inset-inline-end: auto;
    inset-inline-start: max(var(--spacing-md), env(safe-area-inset-left, 0px));
  }

  [dir='rtl'] .helm {
    inset-inline-start: max(var(--spacing-md), env(safe-area-inset-right, 0px));
  }
}
</style>
