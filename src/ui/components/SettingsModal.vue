<script setup>
import Icon from '../design/Icon.vue'
import Sheet from '../design/Sheet.vue'

/**
 * Ported onto <Sheet>. The settings themselves are untouched here; they get
 * split into a quick popover and a full sheet, and the panel-opacity control
 * retired, later in the overhaul.
 */
defineProps({
  show: Boolean,
  preferences: { type: Object, required: true },
})

const emit = defineEmits(['update:preferences', 'close'])

const VIEW_MODES = [
  { value: 'sphere', label: 'Planet', icon: 'globe' },
  { value: 'flat', label: 'Flat', icon: 'map' },
]

function update(key, value) {
  emit('update:preferences', { [key]: value })
}

function reset() {
  emit('update:preferences', {
    worldShape: 'sphere',
    showSections: true,
    showPortals: true,
    showFoliage: true,
    panelOpacity: 0.9,
    autoHideHUD: false,
  })
}
</script>

<template>
  <Sheet id="settings" :open="show" label="Settings" :snap-points="[0.5, 0.92]" :snap="1" @close="$emit('close')">
    <template #header>
      <div class="settings__bar">
        <h2 class="settings__title">Settings</h2>
        <button class="settings__close" type="button" aria-label="Close settings" @click="$emit('close')">
          <Icon name="close" :size="18" />
        </button>
      </div>
    </template>

    <fieldset class="settings__group">
      <legend>World shape</legend>
      <div class="settings__row settings__row--stacked">
        <span>
          <strong>{{ preferences.worldShape === 'sphere' ? 'Planet' : 'Flat map' }}</strong>
          <small>Two views of the same generated world — switching never re-rolls the terrain.</small>
        </span>
        <div class="settings__segmented" role="radiogroup" aria-label="World shape">
          <button
            v-for="option in VIEW_MODES"
            :key="option.value"
            type="button"
            role="radio"
            :aria-checked="preferences.worldShape === option.value"
            :class="['settings__segment', { 'is-active': preferences.worldShape === option.value }]"
            @click="update('worldShape', option.value)"
          >
            <Icon :name="option.icon" :size="16" />
            {{ option.label }}
          </button>
        </div>
      </div>
    </fieldset>

    <fieldset class="settings__group">
      <legend>Map layers</legend>
      <label class="settings__row">
        <span>
          <strong>Sections</strong>
          <small>Section halos and energy walls. Subsections reveal on hover.</small>
        </span>
        <input type="checkbox" :checked="preferences.showSections" @change="update('showSections', $event.target.checked)" />
      </label>

      <label class="settings__row">
        <span>
          <strong>Portals</strong>
          <small>Links to related Wikipedia articles.</small>
        </span>
        <input type="checkbox" :checked="preferences.showPortals" @change="update('showPortals', $event.target.checked)" />
      </label>

      <label class="settings__row">
        <span>
          <strong>Foliage</strong>
          <small>Trees, grass, and scrub matching each biome.</small>
        </span>
        <input type="checkbox" :checked="preferences.showFoliage" @change="update('showFoliage', $event.target.checked)" />
      </label>
    </fieldset>

    <label class="settings__row settings__row--range">
      <span>
        <strong>Panel opacity</strong>
        <small>{{ Math.round(preferences.panelOpacity * 100) }}%</small>
      </span>
      <input
        type="range"
        min="0.5"
        max="1"
        step="0.05"
        :value="preferences.panelOpacity"
        @input="update('panelOpacity', Number($event.target.value))"
      />
    </label>

    <template #footer>
      <button type="button" class="settings__reset" @click="reset">Reset defaults</button>
    </template>
  </Sheet>
</template>

<style scoped>
.settings__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-md);
}

.settings__title {
  margin: 0;
  font-size: var(--text-lg);
}

.settings__close {
  display: grid;
  place-items: center;
  width: var(--hit);
  height: var(--hit);
  border: 1px solid var(--edge-hair);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--ink-2);
}

.settings__close:hover {
  border-color: var(--edge-accent);
  color: var(--accent);
}

.settings__group {
  margin: 0 0 var(--spacing-md);
  padding: 0;
  border: none;
}

.settings__group legend {
  padding: 0 0 var(--spacing-xs);
  color: var(--ink-3);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: var(--tracking-label);
  text-transform: uppercase;
}

.settings__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-md);
  min-height: var(--hit);
  padding: var(--spacing-sm) 0;
  border-bottom: 1px solid var(--edge-hair);
}

.settings__row > span {
  display: grid;
  gap: 2px;
}

.settings__row strong {
  color: var(--ink-1);
  font-size: var(--text-sm);
  font-weight: 500;
}

.settings__row small {
  color: var(--ink-3);
  font-size: var(--text-xs);
  line-height: 1.45;
}

.settings__row--stacked {
  flex-direction: column;
  align-items: stretch;
  gap: var(--spacing-sm);
}

.settings__row--range {
  align-items: start;
}

.settings__segmented {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  gap: 3px;
  padding: 3px;
  border: 1px solid var(--edge-hair);
  border-radius: var(--radius-lg);
  background: rgba(0, 0, 0, 0.25);
}

.settings__segment {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-sm);
  min-height: var(--hit);
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--ink-3);
  font: inherit;
  font-size: var(--text-sm);
}

.settings__segment:hover {
  color: var(--ink-1);
}

.settings__segment.is-active {
  border-color: var(--edge-accent);
  background: var(--accent-wash);
  color: var(--accent-ink);
}

.settings__reset {
  min-height: var(--hit);
  padding: 0 var(--spacing-md);
  border: 1px solid var(--edge-hair);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--ink-2);
  font-size: var(--text-sm);
}

.settings__reset:hover {
  border-color: var(--edge-accent);
  color: var(--accent);
}

input[type='checkbox'] {
  width: 1.4rem;
  height: 1.4rem;
  accent-color: var(--accent);
}

input[type='range'] {
  width: min(9rem, 42vw);
  accent-color: var(--accent);
}
</style>
