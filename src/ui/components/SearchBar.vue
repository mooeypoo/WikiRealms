<script setup>
import { useArticleSearch } from '../composables/useArticleSearch.js'
import Spinner from './Spinner.vue'

const emit = defineEmits(['select'])

const { query, results, status, errorMessage, setQuery, clear } = useArticleSearch()

function onInput(event) {
  setQuery(event.target.value)
}

function selectResult(result) {
  emit('select', result)
  clear()
}
</script>

<template>
  <div class="search-bar">
    <input
      type="text"
      :value="query"
      placeholder="Search English Wikipedia articles…"
      aria-label="Search Wikipedia articles"
      @input="onInput"
    />

    <p v-if="status === 'loading'" class="search-bar__status"><Spinner /> Searching…</p>
    <p v-else-if="status === 'error'" class="search-bar__status search-bar__status--error">
      ⚠️ {{ errorMessage }}
    </p>
    <p v-else-if="status === 'success' && results.length === 0" class="search-bar__status">
      No matching articles found.
    </p>

    <ul v-if="results.length > 0" class="search-bar__results">
      <li v-for="result in results" :key="result.title">
        <button type="button" @click="selectResult(result)">
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

.search-bar input {
  width: 100%;
  padding: var(--spacing-sm) var(--spacing-md);
  font-size: 1rem;
  border: 1px solid var(--panel-border);
  border-radius: var(--radius-md);
  box-sizing: border-box;
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-primary);
  transition: all var(--duration-fast) ease-out;
}

.search-bar input::placeholder {
  color: var(--text-muted);
}

.search-bar input:focus {
  outline: none;
  border-color: var(--accent);
  background: rgba(255, 255, 255, 0.11);
  box-shadow: 0 0 0 3px rgba(127, 223, 255, 0.15);
}

.search-bar__status {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  color: var(--text-secondary);
  margin: var(--spacing-sm) 0 0 0;
  font-size: 0.9rem;
}

.search-bar__status--error {
  color: var(--danger-text);
}

.search-bar__results {
  list-style: none;
  margin: var(--spacing-sm) 0 0 0;
  padding: 0;
  border: 1px solid var(--panel-border-accent);
  border-radius: var(--radius-md);
  max-height: 260px;
  overflow-y: auto;
  background: var(--panel-secondary);
  text-align: left;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
}

.search-bar__results li + li {
  border-top: 1px solid var(--panel-border);
}

.search-bar__results button {
  display: flex;
  flex-direction: column;
  width: 100%;
  text-align: left;
  padding: var(--spacing-md);
  border: none;
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;
  font: inherit;
  transition: all var(--duration-fast) ease-out;
}

.search-bar__results button:hover {
  background: rgba(127, 223, 255, 0.15);
  border-left: 3px solid var(--accent);
  padding-left: calc(var(--spacing-md) - 3px);
}

.search-bar__results button:focus-visible {
  outline: none;
  background: rgba(127, 223, 255, 0.15);
}

.search-bar__results button strong {
  color: var(--accent);
  font-weight: 600;
  margin-bottom: var(--spacing-xs);
}

.search-bar__results button span {
  font-size: 0.85rem;
  color: var(--text-secondary);
  line-height: 1.3;
}
</style>
