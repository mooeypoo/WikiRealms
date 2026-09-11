<script setup>
import { computed } from 'vue'
import Icon from '../design/Icon.vue'
import Sheet from '../design/Sheet.vue'
import { useI18n } from '../i18n/banana.js'

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
const { t } = useI18n()

const CHROME = computed(() => [
  { value: 'solid', label: t('wikirealms-settings-chrome-solid') },
  { value: 'translucent', label: t('wikirealms-settings-chrome-translucent') },
  { value: 'minimal', label: t('wikirealms-settings-chrome-minimal') },
])

const RENDERING = computed(() => [
  { value: 'high', label: t('wikirealms-settings-rendering-high') },
  { value: 'auto', label: t('wikirealms-settings-rendering-auto') },
  { value: 'low', label: t('wikirealms-settings-rendering-low') },
])

function update(key, value) {
  emit('update:preferences', { [key]: value })
}

function reset() {
  emit('update:preferences', {
    language: 'en',
    showAllWikipedias: false,
    worldShape: 'flat',
    rendering: 'auto',
    travelAnimation: true,
    showSections: true,
    showPortals: true,
    showFoliage: true,
    chrome: 'translucent',
    autoHideHUD: false,
  })
}

function chromeLabel(preferences) {
  return CHROME.value.find((option) => option.value === (preferences.chrome ?? 'translucent')).label
}

function renderingLabel(preferences) {
  return RENDERING.value.find((option) => option.value === (preferences.rendering ?? 'auto')).label
}
</script>

<template>
  <Sheet
    id="settings"
    :open="show"
    :label="t('wikirealms-settings-title')"
    :snap-points="[0.5, 0.92]"
    :snap="1"
    @close="$emit('close')"
  >
    <template #header>
      <div class="settings__bar">
        <h2 class="settings__title">{{ t('wikirealms-settings-title') }}</h2>
        <button
          class="settings__close"
          type="button"
          :aria-label="t('wikirealms-settings-close')"
          @click="$emit('close')"
        >
          <Icon name="close" :size="18" />
        </button>
      </div>
    </template>

    <fieldset class="settings__group">
      <legend>{{ t('wikirealms-settings-wikipedia') }}</legend>
      <label class="settings__row">
        <span>
          <strong>{{ t('wikirealms-settings-show-all-wikipedias') }}</strong>
          <small>{{ t('wikirealms-settings-show-all-wikipedias-help') }}</small>
        </span>
        <input
          type="checkbox"
          :checked="preferences.showAllWikipedias === true"
          @change="update('showAllWikipedias', $event.target.checked)"
        />
      </label>
    </fieldset>

    <fieldset class="settings__group">
      <legend>{{ t('wikirealms-settings-rendering') }}</legend>
      <div class="settings__row settings__row--stacked">
        <span>
          <strong>{{ renderingLabel(preferences) }}</strong>
          <small>{{ t('wikirealms-settings-rendering-help') }}</small>
        </span>
        <div class="settings__segmented" role="radiogroup" :aria-label="t('wikirealms-settings-rendering-aria')">
          <button
            v-for="option in RENDERING"
            :key="option.value"
            type="button"
            role="radio"
            :aria-checked="(preferences.rendering ?? 'auto') === option.value"
            :class="['settings__segment', { 'is-active': (preferences.rendering ?? 'auto') === option.value }]"
            @click="update('rendering', option.value)"
          >
            {{ option.label }}
          </button>
        </div>
      </div>
    </fieldset>

    <fieldset class="settings__group">
      <legend>{{ t('wikirealms-settings-motion') }}</legend>
      <label class="settings__row">
        <span>
          <strong>{{ t('wikirealms-settings-travel-animation') }}</strong>
          <small>{{ t('wikirealms-settings-travel-animation-help') }}</small>
        </span>
        <input
          type="checkbox"
          :checked="preferences.travelAnimation !== false"
          @change="update('travelAnimation', $event.target.checked)"
        />
      </label>
    </fieldset>

    <fieldset class="settings__group">
      <legend>{{ t('wikirealms-settings-map-layers') }}</legend>
      <label class="settings__row">
        <span>
          <strong>{{ t('wikirealms-settings-sections') }}</strong>
          <small>{{ t('wikirealms-settings-sections-help') }}</small>
        </span>
        <input type="checkbox" :checked="preferences.showSections" @change="update('showSections', $event.target.checked)" />
      </label>

      <label class="settings__row">
        <span>
          <strong>{{ t('wikirealms-settings-portals') }}</strong>
          <small>{{ t('wikirealms-settings-portals-help') }}</small>
        </span>
        <input type="checkbox" :checked="preferences.showPortals" @change="update('showPortals', $event.target.checked)" />
      </label>

      <label class="settings__row">
        <span>
          <strong>{{ t('wikirealms-settings-foliage') }}</strong>
          <small>{{ t('wikirealms-settings-foliage-help') }}</small>
        </span>
        <input type="checkbox" :checked="preferences.showFoliage" @change="update('showFoliage', $event.target.checked)" />
      </label>
    </fieldset>

    <fieldset class="settings__group">
      <legend>{{ t('wikirealms-settings-panels') }}</legend>
      <div class="settings__row settings__row--stacked">
        <span>
          <strong>{{ chromeLabel(preferences) }}</strong>
          <small>{{ t('wikirealms-settings-chrome-help') }}</small>
        </span>
        <div class="settings__segmented" role="radiogroup" :aria-label="t('wikirealms-settings-chrome-aria')">
          <button
            v-for="option in CHROME"
            :key="option.value"
            type="button"
            role="radio"
            :aria-checked="(preferences.chrome ?? 'translucent') === option.value"
            :class="['settings__segment', { 'is-active': (preferences.chrome ?? 'translucent') === option.value }]"
            @click="update('chrome', option.value)"
          >
            {{ option.label }}
          </button>
        </div>
      </div>
    </fieldset>

    <template #footer>
      <button type="button" class="settings__reset" @click="reset">{{ t('wikirealms-settings-reset') }}</button>
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
  border: 1px solid var(--edge-line);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--ink-1);
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
  color: var(--ink-2);
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
  border-bottom: 1px solid var(--edge-line);
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
  color: var(--ink-2);
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
  border: 1px solid var(--edge-line);
  border-radius: var(--radius-lg);
  background: var(--surface-2);
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
  color: var(--ink-2);
  font: inherit;
  font-size: var(--text-sm);
}

.settings__segment:hover {
  color: var(--ink-1);
}

.settings__segment.is-active {
  border-color: var(--edge-accent);
  background: rgba(var(--accent-rgb), 0.28);
  color: var(--accent-ink);
  box-shadow: inset 0 0 0 1px rgba(var(--accent-rgb), 0.35);
}

.settings__select {
  width: 100%;
  min-height: var(--hit);
  padding: 0 var(--spacing-md);
  border: 1px solid var(--edge-line);
  border-radius: var(--radius-md);
  background: var(--surface-2);
  color: var(--ink-1);
  font: inherit;
  font-size: var(--text-sm);
}

.settings__reset {
  min-height: var(--hit);
  padding: 0 var(--spacing-md);
  border: 1px solid var(--edge-line);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--ink-1);
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
