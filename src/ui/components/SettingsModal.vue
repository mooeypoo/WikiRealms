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
            <label class="settings-modal__row">
              <span>
                <strong>Show portals</strong>
                <small>Display links to related articles.</small>
              </span>
              <input type="checkbox" :checked="preferences.showPortals" @change="update('showPortals', $event.target.checked)" />
            </label>

            <label class="settings-modal__row">
              <span>
                <strong>Peak flags</strong>
                <small>Control which section labels are visible.</small>
              </span>
              <select :value="preferences.showPeakFlags" @change="update('showPeakFlags', $event.target.value)">
                <option value="all">All peaks</option>
                <option value="main">Main peaks</option>
                <option value="none">None</option>
              </select>
            </label>

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

function update(key, value) {
  emit('update:preferences', { [key]: value })
}

function reset() {
  emit('update:preferences', {
    showPortals: true,
    showPeakFlags: 'main',
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
  border: 1px solid rgba(127, 223, 255, 0.24);
  border-radius: 8px;
  background: linear-gradient(145deg, rgba(27, 33, 60, 0.98), rgba(12, 15, 30, 0.98));
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.55);
  animation: settings-rise 0.25s ease-out;
}

.settings-modal__header,
.settings-modal__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  border-color: rgba(127, 223, 255, 0.12);
}

.settings-modal__header {
  border-bottom: 1px solid rgba(127, 223, 255, 0.12);
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
  width: 32px;
  height: 32px;
  font-size: 1.4rem;
}

.settings-modal__close:hover,
.settings-modal__reset:hover {
  border-color: var(--accent);
  background: rgba(127, 223, 255, 0.1);
}

.settings-modal__body {
  padding: 0.25rem 1.25rem;
}

.settings-modal__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem 0;
  border-bottom: 1px solid rgba(127, 223, 255, 0.1);
}

.settings-modal__row > span {
  display: grid;
  gap: 0.25rem;
}

.settings-modal__row strong {
  font-size: 0.95rem;
}

.settings-modal__row small {
  color: var(--text-muted);
  font-size: 0.8rem;
}

.settings-modal input[type='checkbox'] {
  width: 1.15rem;
  height: 1.15rem;
  accent-color: var(--accent);
}

.settings-modal select {
  min-width: 7rem;
  border: 1px solid rgba(127, 223, 255, 0.35);
  border-radius: 4px;
  padding: 0.4rem;
  background: var(--bg-deep);
  color: var(--text-primary);
}

.settings-modal__row--range {
  align-items: start;
}

.settings-modal input[type='range'] {
  width: 9rem;
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
  .settings-modal { width: 100%; border-radius: 8px 8px 0 0; }
}
</style>
