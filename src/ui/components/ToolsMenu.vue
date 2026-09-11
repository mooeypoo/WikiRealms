<script setup>
import Icon from '../design/Icon.vue'
import Sheet from '../design/Sheet.vue'

/**
 * The scrim's utilities, on a screen too narrow to hold them.
 *
 * The utility icons plus the realm name plus the trail chevron do not fit
 * across a phone, and shrinking them below 48 is the wrong trade — they
 * are the smallest things anyone has to hit. So below md they collapse to
 * one control, and open here with room for a label beside each icon.
 *
 * Share joins them on phone so realm/trail sharing is not only behind a
 * Ledger footer that peek may not show. Journey end-of-session actions
 * (clear / save / load) still live on the trail panel.
 *
 * This is NOT the floating panel the old shell had. That one duplicated a
 * taskbar that was still on screen, in a different visual language, so the
 * same command existed twice. This is the only place these live at this
 * width, which is the difference between an overflow menu and a second
 * shell.
 */
defineProps({
  show: Boolean,
  /** Share needs a realm underfoot. */
  canShare: { type: Boolean, default: false },
})

defineEmits(['search', 'guide', 'settings', 'share', 'close'])

const TOOLS = [
  { event: 'search', icon: 'search', label: 'Search realms', hint: 'Leave for a different world' },
  {
    event: 'share',
    icon: 'share',
    label: 'Share',
    hint: 'This realm, or the trail you walked',
    needsShare: true,
  },
  { event: 'guide', icon: 'guide', label: 'About WikiRealms', hint: 'What this is and how it works' },
  { event: 'settings', icon: 'settings', label: 'Settings', hint: 'Layers, rendering, motion' },
]
</script>

<template>
  <Sheet id="tools" :open="show" label="Tools" :snap-points="[0.5, 0.8]" :snap="0" @close="$emit('close')">
    <template #header>
      <h2 class="tools__title">Tools</h2>
    </template>

    <ul class="tools__list">
      <li v-for="tool in TOOLS" :key="tool.event">
        <button
          type="button"
          :disabled="tool.needsShare && !canShare"
          @click="$emit(tool.event)"
        >
          <Icon :name="tool.icon" :size="18" />
          <span>
            <strong>{{ tool.label }}</strong>
            <small>
              {{
                tool.needsShare && !canShare
                  ? 'Open a realm first'
                  : tool.hint
              }}
            </small>
          </span>
        </button>
      </li>
    </ul>
  </Sheet>
</template>

<style scoped>
.tools__title {
  margin: 0;
  font-size: var(--text-lg);
}

.tools__list {
  display: grid;
  gap: var(--spacing-sm);
  margin: 0;
  padding: 0;
  list-style: none;
}

.tools__list button {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  width: 100%;
  min-height: var(--hit);
  padding: var(--spacing-md);
  border: 1px solid var(--edge-line);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--ink-2);
  font: inherit;
  text-align: left;
}

.tools__list button:hover:not(:disabled) {
  border-color: var(--edge-accent);
  color: var(--accent);
}

.tools__list button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.tools__list span {
  display: grid;
  gap: 2px;
}

.tools__list strong {
  color: var(--ink-1);
  font-size: var(--text-sm);
  font-weight: 500;
}

.tools__list small {
  color: var(--ink-3);
  font-size: var(--text-xs);
}
</style>
