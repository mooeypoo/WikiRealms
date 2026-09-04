<template>
  <Teleport to="body">
    <Transition name="settings-fade">
      <div v-if="show" class="settings-overlay" @click.self="$emit('close')">
        <section class="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
          <header class="settings-modal__header">
            <h2 id="settings-title">Settings</h2>
            <button class="settings-modal__close" type="button" aria-label="Close settings" @click="$emit('close')">×</button>
          </header>

          <div class="settings-modal__body">
            <fieldset class="settings-modal__fieldset">
              <legend>World shape</legend>
              <div class="settings-modal__row settings-modal__row--stacked">
                <span>
                  <strong>{{ preferences.worldShape === 'sphere' ? '🪐 Planet' : '🗺️ Flat map' }}</strong>
                  <small>Two views of the same generated world — switching never re-rolls the terrain.</small>
                </span>
                <div class="settings-modal__segmented" role="radiogroup" aria-label="World shape">
                  <button
                    v-for="option in VIEW_MODES"
                    :key="option.value"
                    type="button"
                    role="radio"
                    :aria-checked="preferences.worldShape === option.value"
                    :class="['settings-modal__segment', { 'is-active': preferences.worldShape === option.value }]"
                    @click="update('worldShape', option.value)"
                  >
                    {{ option.label }}
                  </button>
                </div>
              </div>
            </fieldset>

            <fieldset class="settings-modal__fieldset">
              <legend>Map layers</legend>
              <label class="settings-modal__row">
                <span>
                  <strong>🏔️ Sections</strong>
                  <small>Section halos + energy walls. Subsections reveal on hover.</small>
                </span>
                <input type="checkbox" :checked="preferences.showSections" @change="update('showSections', $event.target.checked)" />
              </label>

              <label class="settings-modal__row">
                <span>
                  <strong>🌀 Portals</strong>
                  <small>Links to related Wikipedia articles.</small>
                </span>
                <input type="checkbox" :checked="preferences.showPortals" @change="update('showPortals', $event.target.checked)" />
              </label>

              <label class="settings-modal__row">
                <span>
                  <strong>🌲 Foliage</strong>
                  <small>Trees, grass, and scrub matching each biome.</small>
                </span>
                <input type="checkbox" :checked="preferences.showFoliage" @change="update('showFoliage', $event.target.checked)" />
              </label>
            </fieldset>

            <label class="settings-modal__row settings-modal__row--range">
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
          </div>

          <footer class="settings-modal__footer">
            <button type="button" class="settings-modal__reset" @click="reset">Reset defaults</button>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
const props = defineProps({
  show: Boolean,
  preferences: {
    type: Object,
    required: true,
  },
})

const emit = defineEmits(['update:preferences', 'close'])

const VIEW_MODES = [
  { value: 'sphere', label: '🪐 Planet' },
  { value: 'flat', label: '🗺️ Flat' },
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

<style scoped>
.settings-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: rgba(5, 6, 15, 0.66);
  backdrop-filter: blur(3px);
}

.settings-modal {
  width: min(100%, 480px);
  overflow: hidden;
  border: 1px solid var(--panel-border-accent);
  border-radius: var(--radius-lg);
  background: linear-gradient(145deg, var(--panel-primary), rgba(12, 15, 30, 0.98));
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.55);
  animation: settings-rise 0.25s ease-out;
}

.settings-modal__header,
.settings-modal__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-md) var(--spacing-lg);
  border-color: var(--panel-border);
}

.settings-modal__header {
  border-bottom: 1px solid var(--panel-border);
}

.settings-modal__header h2 {
  margin: 0;
  color: var(--accent);
  font-family: var(--font-display);
  font-size: 1.15rem;
}

.settings-modal__close,
.settings-modal__reset {
  border: 1px solid rgba(127, 223, 255, 0.3);
  border-radius: 5px;
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;
}

.settings-modal__close {
  width: var(--size-touch);
  height: var(--size-touch);
  font-size: 1.4rem;
}

.settings-modal__close:hover,
.settings-modal__reset:hover {
  border-color: var(--accent);
  background: rgba(127, 223, 255, 0.1);
}

.settings-modal__body {
  padding: var(--spacing-xs) var(--spacing-lg);
}

.settings-modal__fieldset {
  border: none;
  padding: 0;
  margin: 0 0 var(--spacing-md);
}

.settings-modal__fieldset legend {
  font-family: var(--font-display);
  font-size: 0.9rem;
  color: var(--accent);
  letter-spacing: 0.03em;
  padding: 0 0 var(--spacing-xs);
}

.settings-modal__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  min-height: var(--size-touch);
  padding: var(--spacing-md) 0;
  border-bottom: 1px solid var(--panel-border);
}

.settings-modal__row > span {
  display: grid;
  gap: 0.25rem;
}

/* The segmented control needs the full row width, so it stacks under its
   label instead of sitting beside it like a checkbox. */
.settings-modal__row--stacked {
  flex-direction: column;
  align-items: stretch;
  gap: var(--spacing-md);
}

.settings-modal__segmented {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  gap: 0.25rem;
  padding: 0.25rem;
  border: 1px solid var(--panel-border);
  border-radius: var(--radius-lg);
  background: rgba(0, 0, 0, 0.25);
}

.settings-modal__segment {
  min-height: var(--size-touch);
  padding: var(--spacing-sm) var(--spacing-md);
  border: 0;
  border-radius: calc(var(--radius-lg) - 0.25rem);
  background: transparent;
  color: var(--text-muted);
  font: inherit;
  font-size: 0.9rem;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.settings-modal__segment:hover {
  color: var(--text-primary);
}

.settings-modal__segment.is-active {
  background: var(--panel-border-accent);
  color: var(--text-primary);
}

.settings-modal__row strong {
  font-size: 0.95rem;
}

.settings-modal__row small {
  color: var(--text-muted);
  font-size: 0.8rem;
}

.settings-modal input[type='checkbox'] {
  width: 1.5rem;
  height: 1.5rem;
  accent-color: var(--accent);
}

.settings-modal select {
  min-width: 7rem;
  border: 1px solid rgba(127, 223, 255, 0.35);
  border-radius: 4px;
  min-height: var(--size-touch);
  padding: var(--spacing-sm);
  background: var(--bg-deep);
  color: var(--text-primary);
}

.settings-modal__row--range {
  align-items: start;
}

.settings-modal input[type='range'] {
  width: min(9rem, 42vw);
  accent-color: var(--accent);
}

.settings-modal__footer {
  justify-content: flex-end;
}

.settings-modal__reset {
  padding: 0.5rem 0.75rem;
}

@keyframes settings-rise {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}

.settings-fade-enter-active,
.settings-fade-leave-active { transition: opacity 0.2s ease; }
.settings-fade-enter-from,
.settings-fade-leave-to { opacity: 0; }

@media (max-width: 767px) {
  .settings-overlay { align-items: end; padding: 0; }
  .settings-modal { width: 100%; border-radius: var(--radius-lg) var(--radius-lg) 0 0; }
}
</style>
