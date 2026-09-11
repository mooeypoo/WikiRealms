<script setup>
import { ref, watch } from 'vue'
import Icon from '../design/Icon.vue'
import Sheet from '../design/Sheet.vue'
import SearchBar from './SearchBar.vue'
import { useArticleSearch } from '../composables/useArticleSearch.js'
import { DEFAULT_LANGUAGE } from '../../core/i18n/wikipediaEditions.js'
import { useI18n } from '../i18n/banana.js'

/**
 * Search, once there is somewhere to be.
 *
 * The taskbar gave search a permanent 30rem of the top bar on desktop and
 * hid it behind an icon below 1024px — two different interactions for one
 * task, and prime real estate for the thing a viewer needs least once they
 * have arrived. From then on the way onward is portals; search is for
 * leaving the map entirely, which is a deliberate act and belongs behind a
 * deliberate gesture.
 *
 * Language is chosen here with the query — the same control as on launch —
 * so switching editions is always choosing where to go next, not retitling
 * the world already underfoot.
 */
const props = defineProps({
  show: Boolean,
  language: { type: String, default: DEFAULT_LANGUAGE },
  showAllWikipedias: { type: Boolean, default: false },
})

const emit = defineEmits(['select', 'close', 'update:language'])

const { t } = useI18n()
const searchLanguage = ref(props.language || DEFAULT_LANGUAGE)

watch(
  () => props.language,
  (code) => {
    if (code && code !== searchLanguage.value) searchLanguage.value = code
  },
)

const { query, results, status, errorMessage, setQuery, clear } = useArticleSearch({
  language: () => searchLanguage.value,
})

watch(searchLanguage, () => {
  if (query.value.trim()) setQuery(query.value)
})

// A palette should never reopen holding the last search: it is a fresh
// question every time it is asked.
watch(
  () => props.show,
  (open) => {
    if (!open) clear()
  },
)

function onLanguage(code) {
  searchLanguage.value = code
  emit('update:language', code)
}

function onSelect(result) {
  emit('select', result)
  emit('close')
}
</script>

<template>
  <Sheet
    id="search"
    :open="show"
    :label="t('wikirealms-search-sheet-label')"
    presentation="dialog"
    :snap-points="[0.5, 0.9]"
    :snap="0"
    @close="$emit('close')"
  >
    <template #header>
      <div class="palette__bar">
        <p class="palette__label">{{ t('wikirealms-search-travel-label') }}</p>
        <button class="palette__close" type="button" :aria-label="t('wikirealms-search-close')" @click="$emit('close')">
          <Icon name="close" :size="18" />
        </button>
      </div>
    </template>

    <SearchBar
      autofocus
      :language="searchLanguage"
      :show-all-wikipedias="showAllWikipedias"
      :query="query"
      :results="results"
      :status="status"
      :error-message="errorMessage"
      @update:query="setQuery"
      @update:language="onLanguage"
      @select="onSelect"
    />

    <p v-if="results.length === 0 && status === 'idle'" class="palette__hint">
      {{ t('wikirealms-search-hint', 'Esc') }}
    </p>
  </Sheet>
</template>

<style scoped>
.palette__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-md);
}

.palette__label {
  margin: 0;
  color: var(--ink-2);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: var(--tracking-label);
  text-transform: uppercase;
}

.palette__close {
  display: grid;
  place-items: center;
  width: var(--hit);
  height: var(--hit);
  border: 1px solid var(--edge-line);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--ink-2);
}

.palette__close:hover {
  border-color: var(--edge-accent);
  color: var(--accent);
}

.palette__hint {
  margin: var(--spacing-md) 0 0;
  color: var(--ink-2);
  font-size: var(--text-sm);
  line-height: 1.5;
}

.palette__hint kbd {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
}
</style>
