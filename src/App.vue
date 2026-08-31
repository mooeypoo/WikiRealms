<script setup>
import { onMounted, ref, watch } from 'vue'
import SearchBar from './ui/components/SearchBar.vue'
import WorldView from './ui/components/WorldView.vue'
import { useArticle } from './ui/composables/useArticle.js'
import { useWorld } from './ui/composables/useWorld.js'
import { useTraversal } from './ui/composables/useTraversal.js'
import { useSnapshot } from './ui/composables/useSnapshot.js'
import { CURRENT_ENGINE_VERSION } from './engine/generation/engineVersion.js'

const { article, status, errorMessage, loadArticle } = useArticle()
const {
  world,
  status: worldStatus,
  errorMessage: worldErrorMessage,
  buildWorld,
  clear: clearWorld,
} = useWorld()
const { current, backstack, forwardstack, canGoBack, canGoForward, navigateTo, goBack, goForward, restore } =
  useTraversal()
const { errorMessage: snapshotErrorMessage, exportSnapshot, importSnapshot, persist, loadPersisted } = useSnapshot()

const articleCache = ref({})

function onSelect(result) {
  navigateTo(result.title)
}

function onPortalClick(portal) {
  navigateTo(portal.targetArticleId)
}

function onExportClick() {
  const snapshot = exportSnapshot({
    current: current.value,
    backstack: backstack.value,
    forwardstack: forwardstack.value,
    articleCache: articleCache.value,
    engineVersion: CURRENT_ENGINE_VERSION,
  })

  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'wikirealms-snapshot.json'
  link.click()
  URL.revokeObjectURL(url)
}

function onImportFile(event) {
  const file = event.target.files?.[0]
  event.target.value = '' // allow re-importing the same file later
  if (!file) return

  const reader = new FileReader()
  reader.onload = () => {
    try {
      const restored = importSnapshot(String(reader.result))
      restore(restored)
      articleCache.value = { ...restored.articleCache }
    } catch {
      // errorMessage is already set by importSnapshot; nothing further to do here
    }
  }
  reader.readAsText(file)
}

onMounted(() => {
  const restored = loadPersisted()
  if (restored) {
    restore(restored)
    articleCache.value = { ...restored.articleCache }
  }
})

watch(current, (title) => {
  if (title) loadArticle(title)
})

watch(article, (newArticle) => {
  if (newArticle) {
    articleCache.value = { ...articleCache.value, [newArticle.title]: newArticle }
    buildWorld(newArticle)
  } else {
    clearWorld()
  }
})

watch([current, backstack, forwardstack, articleCache], () => {
  persist(
    exportSnapshot({
      current: current.value,
      backstack: backstack.value,
      forwardstack: forwardstack.value,
      articleCache: articleCache.value,
      engineVersion: CURRENT_ENGINE_VERSION,
    }),
  )
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
      <button type="button" @click="onExportClick">Export snapshot</button>
      <label class="app__import-label">
        Import snapshot
        <input type="file" accept="application/json" @change="onImportFile" />
      </label>
    </div>

    <p v-if="snapshotErrorMessage" class="app__status app__status--error">{{ snapshotErrorMessage }}</p>

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
