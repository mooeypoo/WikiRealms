<script setup>
import { ref } from 'vue'
import SearchBar from './ui/components/SearchBar.vue'

const selectedArticle = ref(null)

function onSelect(result) {
  selectedArticle.value = result
}
</script>

<template>
  <main class="app">
    <header>
      <h1>WikiRealms</h1>
      <p>Search an English Wikipedia article to begin exploring its world.</p>
    </header>

    <SearchBar @select="onSelect" />

    <section v-if="selectedArticle" class="app__selected-article">
      <h2>{{ selectedArticle.title }}</h2>
      <p v-if="selectedArticle.description">{{ selectedArticle.description }}</p>
      <p class="app__pending-note">World generation for this article is coming soon.</p>
    </section>
  </main>
</template>
