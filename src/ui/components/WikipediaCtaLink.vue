<script setup>
/**
 * Outbound contribution link — same grammar as Ledger's Wikipedia links
 * (mono accent, external icon). Presentation only; which CTA to show is
 * decided by resolveWikipediaCta in ui/content.
 */
import Icon from '../design/Icon.vue'

defineProps({
  href: { type: String, required: true },
  label: { type: String, required: true },
})
</script>

<template>
  <a
    class="wikipedia-cta"
    :href="href"
    target="_blank"
    rel="noopener noreferrer"
  >
    {{ label }}
    <Icon name="external" :size="12" />
  </a>
</template>

<style scoped>
.wikipedia-cta {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: 0;
  border: none;
  background: none;
  color: var(--accent);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  text-decoration: none;
  text-align: left;
}

.wikipedia-cta:hover {
  text-decoration: underline;
}
</style>
