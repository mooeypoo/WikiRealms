<script setup>
import { watch } from 'vue'
import SearchBar from './ui/components/SearchBar.vue'
import WorldView from './ui/components/WorldView.vue'
import { useArticle } from './ui/composables/useArticle.js'
import { useWorld } from './ui/composables/useWorld.js'
import { useTraversal } from './ui/composables/useTraversal.js'

const { article, status, errorMessage, loadArticle } = useArticle()
const {
  world,
  status: worldStatus,
  errorMessage: worldErrorMessage,
  buildWorld,
  clear: clearWorld,
} = useWorld()
const { current, canGoBack, canGoForward, navigateTo, goBack, goForward } = useTraversal()

function onSelect(result) {
  navigateTo(result.title)
}

function onPortalClick(portal) {
  navigateTo(portal.targetArticleId)
}

watch(current, (title) => {
  if (title) loadArticle(title)
})

watch(article, (newArticle) => {
  if (newArticle) {
    buildWorld(newArticle)
  } else {
    clearWorld()
  }
})
</script>

<template>
  <main class="app">
    <header>
      <h1>WikiRealms</h1>
      <p>Search an English Wikipedia article to begin exploring its world.</p>
    </header>

    <SearchBar @select="onSelect" />

    <div v-if="current" class="app__nav-controls">
      <button type="button" :disabled="!canGoBack" @click="goBack">← Back</button>
      <button type="button" :disabled="!canGoForward" @click="goForward">Forward →</button>
    </div>

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

      <p v-if="worldStatus === 'error'" class="app__status app__status--error">{{ worldErrorMessage }}</p>
      <WorldView v-else-if="worldStatus === 'success' && world" :world="world" @portal-click="onPortalClick" />
    </section>
  </main>
</template>
