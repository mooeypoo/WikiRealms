<script setup>
import Icon from '../design/Icon.vue'
import Sheet from '../design/Sheet.vue'

/**
 * Where you have been, and the way back to any of it.
 *
 * The collapsed form of the Trail (docs/ux-vision.md §4.1): a list of the
 * path from the start of this journey to here. The panel that draws the
 * whole branching tree comes later; this is the same data, read straight
 * down the current branch.
 *
 * It also fixes what the old breadcrumb did. That called navigateTo, which
 * pushed a new entry and cleared the forward stack — so clicking your own
 * history rewrote it. Returning to a node leaves the journey untouched.
 */
defineProps({
  show: Boolean,
  /** Root → current, from the visit graph. */
  path: { type: Array, required: true },
})

defineEmits(['select', 'close'])
</script>

<template>
  <Sheet id="trail" :open="show" label="Your trail" :snap-points="[0.4, 0.8]" :snap="0" @close="$emit('close')">
    <template #header>
      <div class="trail__bar">
        <h2 class="trail__title">Your trail</h2>
        <span class="trail__count tabular">{{ path.length }}</span>
      </div>
    </template>

    <ol class="trail__list">
      <li v-for="(node, index) in path" :key="node.id">
        <button
          class="trail__stop"
          :class="{ 'trail__stop--current': index === path.length - 1 }"
          type="button"
          :aria-current="index === path.length - 1 ? 'true' : undefined"
          @click="$emit('select', node.id)"
        >
          <span class="trail__mark" aria-hidden="true" />
          <span class="trail__name">{{ node.title }}</span>
          <Icon v-if="index === path.length - 1" name="crosshair" :size="13" />
        </button>
      </li>
    </ol>
  </Sheet>
</template>

<style scoped>
.trail__bar {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--spacing-md);
}

.trail__title {
  margin: 0;
  font-size: var(--text-lg);
}

.trail__count {
  color: var(--ink-3);
  font-size: var(--text-xs);
  letter-spacing: var(--tracking-label);
}

.trail__list {
  display: grid;
  margin: 0;
  padding: 0;
  list-style: none;
}

.trail__stop {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  width: 100%;
  min-height: var(--hit);
  padding: 0 var(--spacing-sm);
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--ink-2);
  font: inherit;
  font-size: var(--text-sm);
  text-align: left;
}

.trail__stop:hover {
  background: rgba(var(--edge-rgb), 0.06);
  color: var(--ink-1);
}

/* Gold is the trail's colour and nothing else's, so a glance reads as
   "this is me, and this is where I have been". */
.trail__mark {
  position: relative;
  flex: none;
  width: 9px;
  height: 9px;
  border: 1px solid var(--trail);
  border-radius: 50%;
}

/* The thread between stops, drawn upward from each mark but the first. */
.trail__list li + li .trail__mark::before {
  content: '';
  position: absolute;
  left: 50%;
  bottom: 100%;
  width: 1px;
  height: calc(var(--hit) - 9px);
  background: rgba(var(--trail-rgb), 0.4);
  transform: translateX(-50%);
}

.trail__stop--current {
  color: var(--ink-1);
}

.trail__stop--current .trail__mark {
  background: var(--trail);
  box-shadow: 0 0 0 3px var(--trail-wash);
}

.trail__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
