<script setup>
import { computed } from 'vue'
import Icon from '../design/Icon.vue'
import Sheet from '../design/Sheet.vue'
import { infoTabs } from '../content/infoHub.js'
import { useKeymap } from '../design/useKeymap.js'

/**
 * Ported onto <Sheet>: the overlay, backdrop, transitions, Escape handling
 * and focus behaviour it used to carry itself are all the primitive's now.
 * The content is unchanged — it gets rewritten as the Field Guide, with a
 * legend and a generated shortcut list, later in the overhaul.
 */
defineProps({
  show: Boolean,
  currentTab: { type: String, default: 'what-is-this' },
})

defineEmits(['update:currentTab', 'close'])

const tabs = computed(() => infoTabs)

// Generated, not written. The old list was typed out by hand and had
// already drifted — it still advertised keys 1 and 3 for a view toggle
// that no longer exists.
const { shortcuts } = useKeymap()
</script>

<template>
  <Sheet
    id="field-guide"
    :open="show"
    label="About WikiRealms"
    :snap-points="[0.5, 0.92]"
    :snap="1"
    @close="$emit('close')"
  >
    <template #header>
      <div class="guide__bar">
        <h2 class="guide__title">About WikiRealms</h2>
        <button class="guide__close" type="button" aria-label="Close" @click="$emit('close')">
          <Icon name="close" :size="18" />
        </button>
      </div>

      <div class="guide__tabs" role="tablist">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          class="guide__tab"
          :class="{ 'guide__tab--active': currentTab === tab.id }"
          type="button"
          role="tab"
          :aria-selected="currentTab === tab.id"
          @click="$emit('update:currentTab', tab.id)"
        >
          <Icon :name="tab.icon" :size="14" />
          <span class="guide__tab-label">{{ tab.title }}</span>
        </button>
      </div>
    </template>

    <div
      v-for="tab in tabs"
      v-show="currentTab === tab.id"
      :key="tab.id"
      class="guide__prose"
      role="tabpanel"
    >
      <div v-html="tab.content"></div>

      <dl v-if="tab.id === 'shortcuts'" class="guide__keys">
        <template v-for="group in shortcuts" :key="group.group">
          <dt>{{ group.group }}</dt>
          <dd v-for="item in group.items" :key="item.label">
            <span>{{ item.label }}</span>
            <span class="guide__combo">
              <kbd v-for="combo in item.keys" :key="combo">{{ combo }}</kbd>
            </span>
          </dd>
        </template>
      </dl>
    </div>
  </Sheet>
</template>

<style scoped>
.guide__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-md);
}

.guide__title {
  margin: 0;
  font-size: var(--text-lg);
}

.guide__close {
  display: grid;
  place-items: center;
  width: var(--hit);
  height: var(--hit);
  border: 1px solid var(--edge-hair);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--ink-2);
}

.guide__close:hover {
  border-color: var(--edge-accent);
  color: var(--accent);
}

.guide__tabs {
  display: flex;
  gap: var(--spacing-xs);
  margin-top: var(--spacing-md);
  border-bottom: 1px solid var(--edge-hair);
  overflow-x: auto;
}

.guide__tab {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  min-height: var(--hit);
  padding: 0 var(--spacing-md);
  border: none;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--ink-3);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: var(--tracking-label);
  text-transform: uppercase;
  white-space: nowrap;
}

.guide__tab:hover {
  color: var(--ink-1);
}

.guide__tab--active {
  color: var(--accent);
  border-bottom-color: var(--accent);
}

.guide__keys {
  display: grid;
  gap: var(--spacing-sm);
  margin: var(--spacing-md) 0 0;
}

.guide__keys dt {
  color: var(--ink-3);
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: var(--tracking-label);
  text-transform: uppercase;
}

.guide__keys dd {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-md);
  margin: 0;
  color: var(--ink-2);
  font-size: var(--text-sm);
}

.guide__combo {
  display: flex;
  gap: var(--spacing-xs);
}

.guide__keys kbd {
  padding: 2px 6px;
  border: 1px solid var(--edge-line);
  border-radius: var(--radius-sm);
  background: rgba(var(--edge-rgb), 0.08);
  color: var(--ink-1);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
}

/**
 * :deep throughout, because this content arrives through v-html and so
 * carries no scope attribute. Without it these rules compile to selectors
 * that can never match — which is why the guide's prose has been rendering
 * with nothing but the base element styles until now.
 */
.guide__prose :deep(h3) {
  margin: var(--spacing-lg) 0 var(--spacing-sm);
  font-size: var(--text-md);
  color: var(--ink-1);
}

.guide__prose :deep(h3:first-child) {
  margin-top: 0;
}

.guide__prose :deep(p),
.guide__prose :deep(li) {
  color: var(--ink-2);
  font-size: var(--text-sm);
  line-height: 1.6;
}

.guide__prose :deep(ol),
.guide__prose :deep(ul) {
  margin: 0 0 var(--spacing-md);
  padding-left: 1.2em;
  display: grid;
  gap: var(--spacing-sm);
}

.guide__prose :deep(strong) {
  color: var(--ink-1);
  font-weight: 500;
}

.guide__prose :deep(.info-hub__features) {
  display: grid;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-md);
}

.guide__prose :deep(.info-hub__feature) {
  padding: var(--spacing-sm) var(--spacing-md);
  border: 1px solid var(--edge-hair);
  border-radius: var(--radius-md);
  color: var(--ink-2);
  font-size: var(--text-sm);
  line-height: 1.55;
}

.guide__prose :deep(.info-hub__shortcuts) {
  display: grid;
  gap: var(--spacing-sm);
}

.guide__prose :deep(.info-hub__shortcut) {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  font-size: var(--text-sm);
  color: var(--ink-2);
}

.guide__prose :deep(kbd) {
  min-width: 1.6em;
  padding: 2px 6px;
  border: 1px solid var(--edge-line);
  border-radius: var(--radius-sm);
  background: rgba(var(--edge-rgb), 0.08);
  color: var(--ink-1);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  text-align: center;
}
</style>
