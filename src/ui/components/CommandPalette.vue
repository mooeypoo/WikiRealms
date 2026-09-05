<script setup>
import { watch } from 'vue'
import Sheet from '../design/Sheet.vue'
import SearchBar from './SearchBar.vue'
import { useArticleSearch } from '../composables/useArticleSearch.js'

/**
 * Search, once there is somewhere to be.
 *
 * The taskbar gave search a permanent 30rem of the top bar on desktop and
 * hid it behind an icon below 1024px — two different interactions for one
 * task, and prime real estate for the thing a viewer needs least once they
 * have arrived. From then on the way onward is portals; search is for
 * leaving the map entirely, which is a deliberate act and belongs behind a
 * deliberate gesture.
 */
const props = defineProps({
  show: Boolean,
})

const emit = defineEmits(['select', 'close'])

const { query, results, status, errorMessage, setQuery, clear } = useArticleSearch()

// A palette should never reopen holding the last search: it is a fresh
// question every time it is asked.
watch(
  () => props.show,
  (open) => {
    if (!open) clear()
  },
)

function onSelect(result) {
  emit('select', result)
  emit('close')
}
</script>

<template>
  <Sheet
    id="search"
    :open="show"
    label="Search Wikipedia"
    presentation="dialog"
    :snap-points="[0.5, 0.9]"
    :snap="0"
    @close="$emit('close')"
  >
    <template #header>
      <p class="palette__label">Travel to another realm</p>
    </template>

    <SearchBar
      autofocus
      placeholder="Name a realm…"
      :query="query"
      :results="results"
      :status="status"
      :error-message="errorMessage"
      @update:query="setQuery"
      @select="onSelect"
    />

    <p v-if="results.length === 0 && status === 'idle'" class="palette__hint">
      Searching leaves the world you are in and starts a new journey. To carry on
      from here, take a portal.
    </p>
  </Sheet>
</template>

<style scoped>
.palette__label {
  margin: 0;
  color: var(--ink-3);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: var(--tracking-label);
  text-transform: uppercase;
}

.palette__hint {
  margin: var(--spacing-md) 0 0;
  color: var(--ink-3);
  font-size: var(--text-xs);
  line-height: 1.55;
}
</style>
