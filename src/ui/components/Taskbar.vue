<template>
  <header class="taskbar">
    <div class="taskbar__brand">
      <span class="taskbar__wordmark">WikiRealms</span>
      <span v-if="currentArticleTitle" class="taskbar__article-title">{{ currentArticleTitle }}</span>
    </div>

    <div class="taskbar__search" :class="{ 'taskbar__search--open': searchOpen }">
      <slot name="search" />
    </div>

    <nav class="taskbar__commands" aria-label="World controls">
      <button class="taskbar__button taskbar__button--search" type="button" aria-label="Search articles" title="Search articles" @click="$emit('toggle-search')">🔎</button>
      <span class="taskbar__divider" aria-hidden="true"></span>
      <button class="taskbar__button" type="button" aria-label="Go back" title="Go back" :disabled="!props.canGoBack" @click="$emit('go-back')">←</button>
      <button class="taskbar__button" type="button" aria-label="Go forward" title="Go forward" :disabled="!props.canGoForward" @click="$emit('go-forward')">→</button>
      <span v-if="props.hasWorld" class="taskbar__divider" aria-hidden="true"></span>
      <button
        v-if="props.hasWorld"
        class="taskbar__button taskbar__button--view"
        type="button"
        :aria-label="`Switch to ${props.viewMode === '3d' ? '2D' : '3D'} view`"
        @click="$emit('toggle-view-mode')"
      >{{ props.viewMode === '3d' ? '2D' : '3D' }}</button>
      <span class="taskbar__divider" aria-hidden="true"></span>
      <button class="taskbar__button" type="button" aria-label="More controls" title="More controls" @click="$emit('toggle-navigation-tools')">⋯</button>
    </nav>

    <div class="taskbar__utilities">
      <button class="taskbar__button" type="button" aria-label="Info Hub" title="Info and help" @click="$emit('toggle-info-hub')">📖</button>
      <button class="taskbar__button" type="button" aria-label="Settings" title="Settings" @click="$emit('toggle-settings')">⚙️</button>
    </div>
  </header>
</template>

<script setup>
const props = defineProps({
  currentArticleTitle: { type: String, default: null },
  canGoBack: { type: Boolean, default: false },
  canGoForward: { type: Boolean, default: false },
  hasWorld: { type: Boolean, default: false },
  viewMode: { type: String, default: '3d' },
  searchOpen: { type: Boolean, default: false },
})

defineEmits([
  'toggle-info-hub',
  'toggle-settings',
  'toggle-search',
  'go-back',
  'go-forward',
  'toggle-view-mode',
  'toggle-navigation-tools',
])
</script>

<style scoped>
.taskbar {
  position: fixed;
  z-index: 100;
  top: 0;
  left: 0;
  right: 0;
  display: grid;
  grid-template-columns: minmax(11rem, 1fr) minmax(16rem, 30rem) auto auto;
  align-items: center;
  min-height: 60px;
  padding: 0 1rem;
  box-sizing: border-box;
  border-bottom: 1px solid var(--panel-border);
  background: linear-gradient(180deg, var(--panel-primary), rgba(18, 22, 40, 0.75));
  backdrop-filter: blur(10px);
}

.taskbar__brand,
.taskbar__commands,
.taskbar__utilities {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  min-width: 0;
}

.taskbar__wordmark {
  flex: none;
  color: var(--text-primary);
  font-family: var(--font-display);
  font-size: 1rem;
  font-weight: 600;
  letter-spacing: 0.04em;
}

.taskbar__article-title {
  overflow: hidden;
  color: var(--text-secondary);
  font-size: 0.82rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.taskbar__search {
  width: 100%;
}

.taskbar__commands {
  justify-content: flex-end;
}

.taskbar__utilities {
  justify-content: flex-end;
}

.taskbar__button {
  display: grid;
  width: 36px;
  height: 36px;
  padding: 0;
  place-items: center;
  border: 1px solid var(--panel-border);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 1.05rem;
  transition: all var(--duration-fast) ease-out;
}

.taskbar__button:hover:not(:disabled) {
  border-color: var(--panel-border-accent);
  background: rgba(127, 223, 255, 0.15);
  color: var(--accent);
  filter: var(--glow-subtle);
  transform: translateY(-1px);
}

.taskbar__button:active:not(:disabled) {
  background: var(--accent-subtle);
  color: var(--accent);
  filter: none;
  transform: translateY(0);
}

.taskbar__button:disabled {
  cursor: not-allowed;
  opacity: 0.35;
}

.taskbar__button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.taskbar__button--view {
  font-size: 0.72rem;
  font-weight: 700;
}

.taskbar__divider {
  width: 1px;
  height: 24px;
  margin: 0 0.25rem;
  background: var(--panel-border);
}

@media (max-width: 1023px) {
  .taskbar {
    grid-template-columns: minmax(9rem, 1fr) auto;
  }

  .taskbar__search {
    position: fixed;
    top: 4.25rem;
    left: 50%;
    width: min(32rem, calc(100vw - 2rem));
    padding: var(--spacing-md);
    border: 1px solid var(--panel-border-accent);
    border-radius: var(--radius-lg);
    background: var(--panel-primary);
    backdrop-filter: blur(10px);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.42);
    opacity: 0;
    pointer-events: none;
    transform: translate(-50%, -0.5rem);
    transition: opacity var(--duration-normal) ease, transform var(--duration-normal) ease;
  }

  .taskbar__search--open {
    opacity: 1;
    pointer-events: auto;
    transform: translate(-50%, 0);
  }

  .taskbar__utilities {
    display: none;
  }
}

@media (max-width: 767px) {
  .taskbar {
    grid-template-columns: minmax(5.5rem, 1fr) auto;
    min-height: 56px;
    padding: 0 0.5rem;
  }

  .taskbar__article-title,
  .taskbar__divider:nth-of-type(1) {
    display: none;
  }

  .taskbar__commands {
    gap: 0.25rem;
  }

  .taskbar__button {
    width: 36px;
    height: 36px;
  }

  .taskbar__divider {
    height: 20px;
    margin: 0 0.1rem;
  }

  .taskbar__search {
    top: 3.75rem;
    width: calc(100vw - 1rem);
  }
}
</style>
