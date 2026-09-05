<script setup>
import Icon from '../design/Icon.vue'
import Sheet from '../design/Sheet.vue'

/**
 * What you can do WITH a journey, as opposed to in one: share where you
 * are, save the session, load one back.
 *
 * These were three loose buttons floating over the terrain in a panel that
 * only appeared below 1024px. Gathering them answers "where did the export
 * button go" before it is asked, and gives the top scrim one utility icon
 * instead of three.
 */
defineProps({
  show: Boolean,
  canShare: { type: Boolean, default: false },
})

const emit = defineEmits(['home', 'share', 'export', 'import', 'close'])

function onFile(event) {
  const file = event.target.files?.[0]
  event.target.value = '' // let the same file be chosen again later
  if (file) emit('import', file)
}
</script>

<template>
  <Sheet id="journey" :open="show" label="Journey" :snap-points="[0.4, 0.8]" :snap="0" @close="$emit('close')">
    <template #header>
      <h2 class="journey__title">Journey</h2>
    </template>

    <div class="journey__actions">
      <button class="journey__action" type="button" @click="$emit('home')">
        <Icon name="mark" :size="18" />
        <span>
          <strong>Somewhere new</strong>
          <small>The opening screen, with suggestions and what all this is.</small>
        </span>
      </button>

      <button class="journey__action" type="button" :disabled="!canShare" @click="$emit('share')">
        <Icon name="share" :size="18" />
        <span>
          <strong>Share this realm</strong>
          <small>A link that opens the world you are standing in.</small>
        </span>
      </button>

      <button class="journey__action" type="button" @click="$emit('export')">
        <Icon name="download" :size="18" />
        <span>
          <strong>Save this journey</strong>
          <small>Everywhere you have been, as a file you keep.</small>
        </span>
      </button>

      <label class="journey__action">
        <Icon name="upload" :size="18" />
        <span>
          <strong>Load a journey</strong>
          <small>Pick up a saved file where it left off.</small>
        </span>
        <input type="file" accept="application/json" @change="onFile" />
      </label>
    </div>
  </Sheet>
</template>

<style scoped>
.journey__title {
  margin: 0;
  font-size: var(--text-lg);
}

.journey__actions {
  display: grid;
  gap: var(--spacing-sm);
}

.journey__action {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  width: 100%;
  min-height: var(--hit);
  padding: var(--spacing-md);
  border: 1px solid var(--edge-hair);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--ink-2);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.journey__action:hover:not(:disabled) {
  border-color: var(--edge-accent);
  color: var(--accent);
}

.journey__action:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.journey__action span {
  display: grid;
  gap: 2px;
}

.journey__action strong {
  color: var(--ink-1);
  font-size: var(--text-sm);
  font-weight: 500;
}

.journey__action small {
  color: var(--ink-3);
  font-size: var(--text-xs);
  line-height: 1.45;
}

/* The file input covers its label so the whole row is the target, rather
   than a small button beside a description of one. */
.journey__action input[type='file'] {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}
</style>
