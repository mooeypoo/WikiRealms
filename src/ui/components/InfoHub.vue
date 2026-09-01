<template>
  <Teleport to="body">
    <Transition name="modal-fade">
      <div v-if="show" class="info-hub-overlay" @click.self="$emit('close')">
        <div class="info-hub" role="dialog" aria-modal="true" aria-labelledby="info-hub-title">
          <!-- Header -->
          <div class="info-hub__header">
            <h2 id="info-hub-title" class="info-hub__title">✨ WikiRealms Info</h2>
            <button class="info-hub__close" @click="$emit('close')" aria-label="Close">×</button>
          </div>

          <!-- Tabs -->
          <div class="info-hub__tabs">
            <button
              v-for="tab in tabs"
              :key="tab.id"
              class="info-hub__tab"
              :class="{ 'info-hub__tab--active': currentTab === tab.id }"
              @click="$emit('update:currentTab', tab.id)"
            >
              <span class="info-hub__tab-icon">{{ tab.icon }}</span>
              <span class="info-hub__tab-label">{{ tab.title }}</span>
            </button>
          </div>

          <!-- Content -->
          <div class="info-hub__content">
            <div
              v-for="tab in tabs"
              :key="tab.id"
              v-show="currentTab === tab.id"
              class="info-hub__content-pane"
            >
              <div v-html="tab.content" class="info-hub__content-text"></div>
            </div>
          </div>

          <!-- Footer -->
          <div class="info-hub__footer">
            <p class="info-hub__footer-text">Press <kbd>?</kbd> or <kbd>I</kbd> to close</p>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed } from 'vue'
import { infoTabs } from '../content/infoHub.js'

defineProps({
  show: Boolean,
  currentTab: {
    type: String,
    default: 'what-is-this',
  },
})

defineEmits(['update:currentTab', 'close'])

const tabs = computed(() => infoTabs)
</script>

<style scoped>
.info-hub-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  animation: fadeIn 0.3s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.info-hub {
  background: linear-gradient(135deg, rgba(18, 22, 40, 0.95), rgba(30, 35, 60, 0.95));
  border: 1px solid rgba(127, 223, 255, 0.2);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  max-height: 85vh;
  width: 90%;
  max-width: 600px;
  backdrop-filter: blur(8px);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(127, 223, 255, 0.1);
  animation: slideUp 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 767px) {
  .info-hub {
    width: 95%;
    max-height: 90vh;
    border-radius: 12px 12px 0 0;
  }
}

/* Header */
.info-hub__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.5rem;
  border-bottom: 1px solid rgba(127, 223, 255, 0.1);
  gap: 1rem;
}

.info-hub__title {
  margin: 0;
  color: var(--text-primary);
  font-size: 1.3rem;
  font-family: 'Cinzel', serif;
}

.info-hub__close {
  background: transparent;
  border: 1px solid rgba(127, 223, 255, 0.3);
  color: var(--text-primary);
  cursor: pointer;
  font-size: 1.5rem;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  transition: all 0.2s ease;
}

.info-hub__close:hover {
  background: rgba(127, 223, 255, 0.1);
  border-color: rgba(127, 223, 255, 0.6);
}

/* Tabs */
.info-hub__tabs {
  display: flex;
  gap: 0;
  border-bottom: 1px solid rgba(127, 223, 255, 0.1);
  padding: 0 1rem;
  background: rgba(5, 6, 15, 0.3);
}

.info-hub__tab {
  flex: 1;
  padding: 1rem 0.75rem;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 0.9rem;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  transition: all 0.3s ease;
  white-space: nowrap;
}

.info-hub__tab:hover {
  color: var(--text-primary);
  background: rgba(127, 223, 255, 0.05);
}

.info-hub__tab--active {
  color: var(--accent);
  border-bottom-color: var(--accent);
  background: rgba(127, 223, 255, 0.08);
}

.info-hub__tab-icon {
  font-size: 1.1rem;
}

.info-hub__tab-label {
  display: none;
  font-family: 'Cinzel', serif;
}

@media (min-width: 480px) {
  .info-hub__tab-label {
    display: inline;
  }
}

/* Content */
.info-hub__content {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem;
}

.info-hub__content-pane {
  animation: fadeInSlideUp 0.4s ease-out;
}

@keyframes fadeInSlideUp {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.info-hub__content-text {
  color: var(--text-primary);
  line-height: 1.7;
  font-size: 0.95rem;
}

.info-hub__content-text h3 {
  color: var(--accent);
  font-family: 'Cinzel', serif;
  font-size: 1.15rem;
  margin: 1.5rem 0 0.75rem 0;
}

.info-hub__content-text h3:first-child {
  margin-top: 0;
}

.info-hub__content-text p {
  margin: 0.75rem 0;
}

.info-hub__content-text ol,
.info-hub__content-text ul {
  margin: 0.75rem 0;
  padding-left: 1.5rem;
  color: var(--text-primary);
}

.info-hub__content-text li {
  margin: 0.5rem 0;
}

.info-hub__content-text strong {
  color: var(--accent);
}

.info-hub__content-text a {
  color: var(--accent);
  text-decoration: none;
  transition: opacity 0.2s ease;
}

.info-hub__content-text a:hover {
  opacity: 0.8;
  text-decoration: underline;
}

.info-hub__features {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin: 1rem 0;
}

.info-hub__feature {
  background: rgba(127, 223, 255, 0.08);
  border-left: 2px solid var(--accent);
  padding: 0.75rem 1rem;
  border-radius: 4px;
  color: var(--text-primary);
}

.info-hub__content-text :deep(.info-hub__shortcuts) {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.75rem;
  margin: 1rem 0;
}

@media (min-width: 480px) {
  .info-hub__content-text :deep(.info-hub__shortcuts) {
    grid-template-columns: 1fr 1fr;
  }
}

.info-hub__content-text :deep(.info-hub__shortcut) {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  font-size: 0.9rem;
  padding: 0.5rem;
  border-radius: 4px;
  background: rgba(127, 223, 255, 0.05);
}

.info-hub__content-text :deep(.info-hub__shortcut kbd) {
  background: rgba(120, 140, 255, 0.2);
  border: 1px solid rgba(127, 223, 255, 0.3);
  border-radius: 3px;
  padding: 0.25rem 0.5rem;
  font-family: monospace;
  font-size: 0.85rem;
  color: var(--accent);
  display: inline-block;
  white-space: nowrap;
}

/* Footer */
.info-hub__footer {
  padding: 1rem 1.5rem;
  border-top: 1px solid rgba(127, 223, 255, 0.1);
  background: rgba(5, 6, 15, 0.3);
  text-align: center;
}

.info-hub__footer-text {
  margin: 0;
  color: var(--text-muted);
  font-size: 0.85rem;
}

.info-hub__footer-text kbd {
  background: rgba(120, 140, 255, 0.15);
  border: 1px solid rgba(127, 223, 255, 0.25);
  border-radius: 3px;
  padding: 0.2rem 0.4rem;
  font-family: monospace;
  color: var(--accent);
  font-size: 0.8rem;
  display: inline-block;
}

/* Scrollbar styling */
.info-hub__content::-webkit-scrollbar {
  width: 6px;
}

.info-hub__content::-webkit-scrollbar-track {
  background: transparent;
}

.info-hub__content::-webkit-scrollbar-thumb {
  background: rgba(127, 223, 255, 0.2);
  border-radius: 3px;
}

.info-hub__content::-webkit-scrollbar-thumb:hover {
  background: rgba(127, 223, 255, 0.4);
}

.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.3s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}
</style>
