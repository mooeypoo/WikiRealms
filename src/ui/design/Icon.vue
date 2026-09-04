<script setup>
import { computed } from 'vue'
import { ICONS } from './icons.js'

const props = defineProps({
  name: { type: String, required: true },
  /** Rendered size in px. The 24-unit viewBox scales to it. */
  size: { type: [Number, String], default: 20 },
  /**
   * Accessible name. Omit for decorative icons — the common case, since an
   * icon button carries its own label — and the icon is hidden from the
   * accessibility tree instead of being announced twice.
   */
  label: { type: String, default: null },
})

const markup = computed(() => ICONS[props.name] ?? '')

// A missing name would otherwise render an empty box that nobody notices
// until it ships. Fail loudly in dev, render nothing in production.
if (import.meta.env?.DEV && !ICONS[props.name]) {
  console.warn(`[Icon] unknown icon "${props.name}"`)
}
</script>

<template>
  <svg
    class="icon"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.6"
    stroke-linecap="round"
    stroke-linejoin="round"
    :role="label ? 'img' : undefined"
    :aria-label="label || undefined"
    :aria-hidden="label ? undefined : 'true'"
    v-html="markup"
  />
</template>

<style scoped>
.icon {
  display: block;
  flex: none;
}
</style>
