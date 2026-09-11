<script setup>
import { computed, ref, watch } from 'vue'
import Icon from '../design/Icon.vue'
import Spinner from './Spinner.vue'
import { getEdition, listEditions } from '../../core/i18n/wikipediaEditions.js'
import { useI18n } from '../i18n/banana.js'

/**
 * The search field and its results, and nothing else.
 *
 * Language lives here with the query: picking an edition is part of choosing
 * an article, not a global setting that leaves you staring at a mismatch.
 */
const props = defineProps({
  query: { type: String, default: '' },
  results: { type: Array, default: () => [] },
  /** idle | loading | success | error */
  status: { type: String, default: 'idle' },
  errorMessage: { type: String, default: null },
  /** Wikipedia edition code to search. */
  language: { type: String, default: 'en' },
  /** When true, the language select lists every open Wikipedia. */
  showAllWikipedias: { type: Boolean, default: false },
  /** Takes focus on mount — true in a palette, false in a page. */
  autofocus: { type: Boolean, default: false },
  size: { type: String, default: 'md', validator: (value) => ['md', 'lg'].includes(value) },
})

const emit = defineEmits(['update:query', 'update:language', 'select'])

const { t } = useI18n()
const field = ref(null)
const active = ref(-1)

const edition = computed(() => getEdition(props.language))
const editions = computed(() => listEditions({ featuredOnly: !props.showAllWikipedias }))
const placeholder = computed(() => t('wikirealms-search-placeholder', edition.value.name))

watch(
  () => props.results,
  () => {
    active.value = props.results.length > 0 ? 0 : -1
  },
  { immediate: true },
)

function onKeydown(event) {
  if (props.results.length === 0) return

  if (event.key === 'ArrowDown') {
    event.preventDefault()
    active.value = (active.value + 1) % props.results.length
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    active.value = (active.value - 1 + props.results.length) % props.results.length
  } else if (event.key === 'Enter' && active.value >= 0) {
    event.preventDefault()
    selectResult(props.results[active.value])
  }
}

function selectResult(result) {
  emit('select', { ...result, language: props.language })
}

function onLanguageChange(event) {
  emit('update:language', event.target.value)
}

function editionOptionLabel(item) {
  return `${item.code.toUpperCase()} · ${item.autonym}`
}

defineExpose({ focus: () => field.value?.focus() })
</script>

<template>
  <div class="search-bar" :class="`search-bar--${size}`">
    <div class="search-bar__field">
      <label class="search-bar__lang">
        <span class="visually-hidden">{{ t('wikirealms-search-language') }}</span>
        <select
          class="search-bar__lang-select"
          :value="language"
          :aria-label="t('wikirealms-search-language')"
          @change="onLanguageChange"
          @keydown.stop
        >
          <option v-for="item in editions" :key="item.code" :value="item.code">
            {{ editionOptionLabel(item) }}
          </option>
        </select>
      </label>
      <Icon name="search" :size="size === 'lg' ? 20 : 17" class="search-bar__icon" />
      <input
        ref="field"
        type="text"
        :value="query"
        :placeholder="placeholder"
        :data-autofocus="autofocus ? '' : undefined"
        :aria-label="t('wikirealms-search-articles')"
        role="combobox"
        aria-expanded="true"
        aria-controls="search-results"
        :aria-activedescendant="active >= 0 ? `search-result-${active}` : undefined"
        @input="$emit('update:query', $event.target.value)"
        @keydown="onKeydown"
      />
      <Spinner v-if="status === 'loading'" />
    </div>

    <p v-if="status === 'error'" class="search-bar__status search-bar__status--error">
      <Icon name="alert" :size="14" />
      {{ errorMessage }}
    </p>
    <p v-else-if="status === 'success' && results.length === 0" class="search-bar__status">
      {{ t('wikirealms-search-nothing-found', query) }}
    </p>

    <ul v-if="results.length > 0" id="search-results" class="search-bar__results" role="listbox">
      <li v-for="(result, index) in results" :key="`${language}:${result.title}`" role="presentation">
        <button
          :id="`search-result-${index}`"
          type="button"
          role="option"
          :aria-selected="index === active"
          :class="{ 'is-active': index === active }"
          @click="selectResult(result)"
          @mousemove="active = index"
        >
          <strong>
            <span class="search-bar__result-lang">{{ language.toUpperCase() }}</span>
            {{ result.title }}
          </strong>
          <span v-if="result.description">{{ result.description }}</span>
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.search-bar {
  display: flex;
  flex-direction: column;
  width: 100%;
}

.search-bar__field {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  min-height: var(--hit);
  padding: 0 var(--spacing-md) 0 var(--spacing-sm);
  border: 1px solid var(--edge-line);
  border-radius: var(--radius-md);
  background: rgba(var(--edge-rgb), 0.08);
}

.search-bar__field:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-wash);
}

.search-bar__lang {
  flex: none;
  display: flex;
  align-items: center;
}

.search-bar__lang-select {
  max-width: 7.5rem;
  min-height: calc(var(--hit) - 8px);
  padding: 0 var(--spacing-sm);
  border: 1px solid var(--edge-line);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--ink-1);
  font: inherit;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.search-bar--lg .search-bar__lang-select {
  max-width: 9rem;
  font-size: var(--text-sm);
}

.search-bar__icon {
  color: var(--ink-2);
}

.search-bar input {
  flex: 1;
  min-width: 0;
  padding: var(--spacing-sm) 0;
  border: none;
  background: none;
  color: var(--ink-1);
  font: inherit;
  font-size: var(--text-md);
}

.search-bar input:focus {
  outline: none;
  box-shadow: none;
}

.search-bar--lg input {
  padding: var(--spacing-md) 0;
  font-size: var(--text-lg);
}

.search-bar__status {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  margin: var(--spacing-sm) 0 0;
  color: var(--ink-2);
  font-size: var(--text-sm);
}

.search-bar__status--error {
  color: var(--danger);
}

.search-bar__results {
  display: grid;
  margin: var(--spacing-sm) 0 0;
  padding: 0;
  max-height: 46vh;
  overflow-y: auto;
  overscroll-behavior: contain;
  list-style: none;
}

.search-bar__results button {
  display: grid;
  gap: 2px;
  width: 100%;
  min-height: var(--hit);
  padding: var(--spacing-sm) var(--spacing-md);
  border: none;
  border-inline-start: 2px solid transparent;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--ink-1);
  font: inherit;
  text-align: start;
}

.search-bar__results button.is-active {
  border-inline-start-color: var(--accent);
  background: var(--accent-wash);
}

.search-bar__results strong {
  display: inline-flex;
  align-items: baseline;
  gap: var(--spacing-sm);
  font-size: var(--text-sm);
  font-weight: 500;
}

.search-bar__result-lang {
  flex: none;
  color: var(--ink-2);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  font-weight: 500;
  letter-spacing: 0.06em;
}

.search-bar__results span {
  color: var(--ink-2);
  font-size: var(--text-xs);
  line-height: 1.4;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
