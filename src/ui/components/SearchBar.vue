<script setup>
import { useArticleSearch } from '../composables/useArticleSearch.js'

const emit = defineEmits(['select'])

const { query, results, status, errorMessage, setQuery } = useArticleSearch()

function onInput(event) {
  setQuery(event.target.value)
}

function selectResult(result) {
  emit('select', result)
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

    <p v-if="status === 'loading'" class="search-bar__status">Searching…</p>
    <p v-else-if="status === 'error'" class="search-bar__status search-bar__status--error">
      {{ errorMessage }}
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
