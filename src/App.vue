<script setup>
import SearchBar from './ui/components/SearchBar.vue'
import { useArticle } from './ui/composables/useArticle.js'

const { article, status, errorMessage, loadArticle } = useArticle()

function onSelect(result) {
  loadArticle(result.title)
}
</script>

<template>
  <main class="app">
    <header>
      <h1>WikiRealms</h1>
      <p>Search an English Wikipedia article to begin exploring its world.</p>
    </header>

    <SearchBar @select="onSelect" />

    <p v-if="status === 'loading'" class="app__status">Loading article…</p>
    <p v-else-if="status === 'error'" class="app__status app__status--error">{{ errorMessage }}</p>

    <section v-if="status === 'success' && article" class="app__selected-article">
      <h2>{{ article.title }}</h2>
      <p v-if="article.summary">{{ article.summary }}</p>
      <ul class="app__article-meta">
        <li>Revision: {{ article.latestRevisionId }}</li>
        <li>Categories: {{ article.categories.length }}</li>
        <li>Outbound links: {{ article.links.length }}</li>
      </ul>
      <p class="app__pending-note">World generation for this article is coming soon.</p>
    </section>
  </main>
</template>
