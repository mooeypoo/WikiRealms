<script setup>
/**
 * A stewardship invite framed as a field task — eyebrow, diegetic notice,
 * then the outbound Wikipedia action. Presentation only; resolveWikipediaCta
 * decides whether one exists.
 */
import WikipediaCtaLink from './WikipediaCtaLink.vue'
import { useI18n } from '../i18n/banana.js'

defineProps({
  eyebrow: { type: String, default: '' },
  notice: { type: String, default: '' },
  href: { type: String, required: true },
  label: { type: String, required: true },
})

const { t } = useI18n()
</script>

<template>
  <aside class="field-task" :aria-label="t('wikirealms-field-task-eyebrow')">
    <p v-if="eyebrow" class="field-task__eyebrow tabular"><bdi>{{ eyebrow }}</bdi></p>
    <p v-if="notice" class="field-task__notice"><bdi>{{ notice }}</bdi></p>
    <WikipediaCtaLink class="field-task__action" :href="href" :label="label" />
  </aside>
</template>

<style scoped>
.field-task {
  display: grid;
  gap: var(--spacing-xs);
  margin-top: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-md);
  border-radius: var(--radius-md);
  background: rgba(var(--accent-rgb), 0.22);
  border: 1px solid rgba(var(--accent-rgb), 0.35);
}

.field-task__eyebrow {
  margin: 0;
  color: var(--accent);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: var(--tracking-label);
  text-transform: uppercase;
}

.field-task__notice {
  margin: 0;
  color: var(--ink-2);
  font-size: var(--text-sm);
  line-height: 1.45;
}

.field-task__action {
  display: flex;
  max-width: 100%;
  line-height: 1.4;
  white-space: normal;
  font-size: var(--text-sm);
}
</style>
