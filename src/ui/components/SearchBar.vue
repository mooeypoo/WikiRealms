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
.search-bar input {
  width: 100%;
  padding: 0.6rem 0.8rem;
  font-size: 1rem;
  border: 1px solid #ccc;
  border-radius: 6px;
  box-sizing: border-box;
}

.search-bar__status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: #555;
  margin: 0.5rem 0;
}

.search-bar__status--error {
  color: #7a1f16;
}

.search-bar__results {
  list-style: none;
  margin: 0.25rem 0 0;
  padding: 0;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  max-height: 260px;
  overflow-y: auto;
}

.search-bar__results li + li {
  border-top: 1px solid #eee;
}

.search-bar__results button {
  display: flex;
  flex-direction: column;
  width: 100%;
  text-align: left;
  padding: 0.5rem 0.8rem;
  border: none;
  background: none;
  cursor: pointer;
  font: inherit;
}

.search-bar__results button:hover {
  background: #f5f5f5;
}

.search-bar__results button span {
  font-size: 0.85rem;
  color: #666;
}
</style>
