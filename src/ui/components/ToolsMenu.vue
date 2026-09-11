<script setup>
import { computed } from 'vue'
import Icon from '../design/Icon.vue'
import Sheet from '../design/Sheet.vue'
import { useI18n } from '../i18n/banana.js'

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
const props = defineProps({
  show: Boolean,
  /** Share needs a realm underfoot. */
  canShare: { type: Boolean, default: false },
})

defineEmits(['search', 'guide', 'settings', 'share', 'close'])

const { t } = useI18n()

const tools = computed(() => [
  {
    event: 'search',
    icon: 'search',
    label: t('wikirealms-scrim-search-aria'),
    hint: t('wikirealms-tools-search-hint'),
  },
  {
    event: 'share',
    icon: 'share',
    label: t('wikirealms-share'),
    hint: t('wikirealms-tools-share-hint'),
    needsShare: true,
  },
  {
    event: 'guide',
    icon: 'guide',
    label: t('wikirealms-scrim-about-aria'),
    hint: t('wikirealms-tools-about-hint'),
  },
  {
    event: 'settings',
    icon: 'settings',
    label: t('wikirealms-settings-title'),
    hint: t('wikirealms-tools-settings-hint'),
  },
])
</script>

<template>
  <Sheet
    id="tools"
    :open="show"
    :label="t('wikirealms-scrim-tools')"
    :snap-points="[0.5, 0.8]"
    :snap="0"
    @close="$emit('close')"
  >
    <template #header>
      <h2 class="tools__title">{{ t('wikirealms-scrim-tools') }}</h2>
    </template>

    <ul class="tools__list">
      <li v-for="tool in tools" :key="tool.event">
        <button
          type="button"
          :disabled="tool.needsShare && !props.canShare"
          @click="$emit(tool.event)"
        >
          <Icon :name="tool.icon" :size="18" />
          <span>
            <strong>{{ tool.label }}</strong>
            <small>
              {{
                tool.needsShare && !props.canShare
                  ? t('wikirealms-share-need-realm')
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
