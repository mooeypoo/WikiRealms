<script setup>
import Icon from '../design/Icon.vue'
import Sheet from '../design/Sheet.vue'

/**
 * One share door, two intents.
 *
 * Realm link and trail postcard used to live in different corners with the
 * same "share" metaphor, so neither taught that the path is kept and can
 * travel with you. This menu is the single place that names both.
 */
defineProps({
  show: Boolean,
  /** Current realm title, for the realm-share hint. */
  realmTitle: { type: String, default: '' },
  /** Trail postcard needs an article underfoot. */
  canShareTrail: { type: Boolean, default: false },
  trailLength: { type: Number, default: 0 },
})

defineEmits(['share-realm', 'share-trail', 'close'])
</script>

<template>
  <Sheet id="share" :open="show" label="Share" :snap-points="[0.42, 0.72]" :snap="0" @close="$emit('close')">
    <template #header>
      <h2 class="share__title">Share</h2>
    </template>

    <ul class="share__list">
      <li>
        <button type="button" @click="$emit('share-realm')">
          <Icon name="share" :size="18" />
          <span>
            <strong>Share this realm</strong>
            <small>
              {{ realmTitle ? `A link to ${realmTitle} as a world` : 'A link to this world' }}
            </small>
          </span>
        </button>
      </li>
      <li>
        <button type="button" :disabled="!canShareTrail" @click="$emit('share-trail')">
          <Icon name="trail" :size="18" />
          <span>
            <strong>Share my trail</strong>
            <small>
              {{
                canShareTrail
                  ? `Your path through ${trailLength} realm${trailLength === 1 ? '' : 's'} as a postcard`
                  : 'Open a realm first, then share the path you walked'
              }}
            </small>
          </span>
        </button>
      </li>
    </ul>
  </Sheet>
</template>

<style scoped>
.share__title {
  margin: 0;
  font-size: var(--text-lg);
}

.share__list {
  display: grid;
  gap: var(--spacing-sm);
  margin: 0;
  padding: 0;
  list-style: none;
}

.share__list button {
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

.share__list button:hover:not(:disabled) {
  border-color: var(--edge-accent);
  color: var(--accent);
}

.share__list button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.share__list span {
  display: grid;
  gap: 2px;
}

.share__list strong {
  color: var(--ink-1);
  font-size: var(--text-sm);
  font-weight: 500;
}

.share__list small {
  color: var(--ink-3);
  font-size: var(--text-xs);
  line-height: 1.35;
}
</style>
