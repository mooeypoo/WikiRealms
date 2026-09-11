<script setup>
import { ref, watch } from 'vue'
import Icon from '../design/Icon.vue'
import Spinner from './Spinner.vue'

/**
 * The search field and its results, and nothing else.
 *
 * It used to call useArticleSearch itself, which meant it could not be
 * rendered anywhere — a story or a second caller — without the network
 * coming with it. Both places search now appears (the launch screen and the
 * command palette) own the composable and hand the state down, which is the
 * discipline docs/ux-vision.md §9 asks of every feature component.
 */
const props = defineProps({
  query: { type: String, default: '' },
  results: { type: Array, default: () => [] },
  /** idle | loading | success | error */
  status: { type: String, default: 'idle' },
  errorMessage: { type: String, default: null },
  placeholder: { type: String, default: 'Search English Wikipedia' },
  /** Takes focus on mount — true in a palette, false in a page. */
  autofocus: { type: Boolean, default: false },
  size: { type: String, default: 'md', validator: (value) => ['md', 'lg'].includes(value) },
})

const emit = defineEmits(['update:query', 'select'])

const field = ref(null)
const active = ref(-1)

// immediate, or a list that is already present at mount has nothing marked
// and Enter does nothing until the viewer touches an arrow key.
watch(
  () => props.results,
  () => {
    active.value = props.results.length > 0 ? 0 : -1
  },
  { immediate: true },
)

/**
 * Arrow keys move through results and Enter takes the marked one, so the
 * whole flow works without the pointer ever being involved.
 */
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
    emit('select', props.results[active.value])
  }
}

defineExpose({ focus: () => field.value?.focus() })
</script>

<template>
  <div class="search-bar" :class="`search-bar--${size}`">
    <div class="search-bar__field">
      <Icon name="search" :size="size === 'lg' ? 20 : 17" class="search-bar__icon" />
      <input
        ref="field"
        type="text"
        :value="query"
        :placeholder="placeholder"
        :data-autofocus="autofocus ? '' : undefined"
        aria-label="Search Wikipedia articles"
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
      Nothing found for “{{ query }}”.
    </p>

    <ul v-if="results.length > 0" id="search-results" class="search-bar__results" role="listbox">
      <li v-for="(result, index) in results" :key="result.title" role="presentation">
        <button
          :id="`search-result-${index}`"
          type="button"
          role="option"
          :aria-selected="index === active"
          :class="{ 'is-active': index === active }"
          @click="$emit('select', result)"
          @mousemove="active = index"
        >
          <strong>{{ result.title }}</strong>
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
  padding: 0 var(--spacing-md);
  border: 1px solid var(--edge-line);
  border-radius: var(--radius-md);
  background: rgba(var(--edge-rgb), 0.08);
}

.search-bar__field:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-wash);
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
  border-left: 2px solid transparent;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--ink-1);
  font: inherit;
  text-align: left;
}

.search-bar__results button.is-active {
  border-left-color: var(--accent);
  background: var(--accent-wash);
}

.search-bar__results strong {
  font-size: var(--text-sm);
  font-weight: 500;
}

.search-bar__results span {
  color: var(--ink-2);
  font-size: var(--text-xs);
  line-height: 1.4;
}
</style>
