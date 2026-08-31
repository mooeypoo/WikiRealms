<script setup>
import { onMounted, ref, watch } from 'vue'
import SearchBar from './ui/components/SearchBar.vue'
import WorldView from './ui/components/WorldView.vue'
import Spinner from './ui/components/Spinner.vue'
import { useArticle } from './ui/composables/useArticle.js'
import { useWorld } from './ui/composables/useWorld.js'
import { useTraversal } from './ui/composables/useTraversal.js'
import { useSnapshot } from './ui/composables/useSnapshot.js'
import { CURRENT_ENGINE_VERSION } from './engine/generation/engineVersion.js'
import { isWorldStale } from './core/article/staleness.js'

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
const isStale = ref(false)
const isSummaryExpanded = ref(false)

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
    const previous = articleCache.value[newArticle.title]
    isStale.value = previous ? isWorldStale(previous.latestRevisionId, newArticle.latestRevisionId) : false
    isSummaryExpanded.value = false
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
    <header class="app__header">
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

    <p v-if="snapshotErrorMessage" class="app__alert app__alert--error">⚠️ {{ snapshotErrorMessage }}</p>

    <p v-if="!current && status === 'idle'" class="app__empty-state">
      No world yet — search for an article above to generate one.
    </p>

    <p v-if="status === 'loading'" class="app__status"><Spinner /> Loading article…</p>
    <p v-else-if="status === 'error'" class="app__alert app__alert--error">⚠️ {{ errorMessage }}</p>

    <section v-if="status === 'success' && article" class="app__selected-article">
      <div class="app__article-heading">
        <h2>{{ article.title }}</h2>
        <span v-if="isStale" class="app__badge app__badge--stale" title="This article has a newer revision than when its world was first generated">
          Updated since last visit
        </span>
      </div>
      <div v-if="article.summary" class="app__summary" :class="{ 'app__summary--collapsed': !isSummaryExpanded }">
        <p>{{ article.summary }}</p>
      </div>
      <button v-if="article.summary" type="button" class="app__summary-toggle" @click="isSummaryExpanded = !isSummaryExpanded">
        {{ isSummaryExpanded ? 'Show less ▲' : 'Show more ▼' }}
      </button>
      <p v-else class="app__empty-state">No summary available for this article.</p>
      <dl class="app__article-meta">
        <div><dt>Revision</dt><dd>{{ article.latestRevisionId }}</dd></div>
        <div><dt>Categories</dt><dd>{{ article.categories.length }}</dd></div>
        <div><dt>Outbound links</dt><dd>{{ article.links.length }}</dd></div>
      </dl>
      <a v-if="article.url" :href="article.url" target="_blank" rel="noopener noreferrer" class="app__external-link">
        View on Wikipedia ↗
      </a>

      <p v-if="worldStatus === 'loading'" class="app__status"><Spinner /> Generating world…</p>
      <p v-else-if="worldStatus === 'error'" class="app__alert app__alert--error">⚠️ {{ worldErrorMessage }}</p>
      <WorldView v-else-if="worldStatus === 'success' && world" :world="world" @portal-click="onPortalClick" />
    </section>
  </main>
</template>

<style scoped>
.app {
  max-width: 960px;
  margin: 0 auto;
  padding: 1.5rem;
  font-family: system-ui, sans-serif;
}

.app__header p {
  color: #555;
  margin-top: 0.25rem;
}

.app__nav-controls {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 1rem 0;
  flex-wrap: wrap;
}

.app__nav-controls button,
.app__import-label {
  padding: 0.4rem 0.8rem;
  border: 1px solid #ccc;
  border-radius: 6px;
  background: #f7f7f7;
  cursor: pointer;
  font-size: 0.9rem;
}

.app__nav-controls button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.app__import-label {
  position: relative;
  overflow: hidden;
}

.app__import-label input[type='file'] {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.app__empty-state {
  color: #777;
  font-style: italic;
  padding: 1rem 0;
}

.app__status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: #555;
}

.app__alert {
  padding: 0.6rem 0.9rem;
  border-radius: 6px;
  background: #fdecea;
  color: #7a1f16;
  border: 1px solid #f3c1bb;
}

.app__selected-article {
  margin-top: 1rem;
  padding: 1rem 1.25rem;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  background: #fff;
}

.app__article-heading {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
}

.app__article-heading h2 {
  margin: 0;
}

.app__badge {
  font-size: 0.75rem;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
}

.app__badge--stale {
  background: #fff4ce;
  color: #7a5c00;
  border: 1px solid #eddb90;
}

.app__article-meta {
  display: flex;
  gap: 1.5rem;
  flex-wrap: wrap;
  margin: 0.75rem 0;
}

.app__article-meta div {
  display: flex;
  flex-direction: column;
}

.app__article-meta dt {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: #888;
}

.app__article-meta dd {
  margin: 0;
  font-weight: 600;
}

.app__external-link {
  display: inline-block;
  margin-bottom: 0.75rem;
  font-size: 0.9rem;
}

.app__summary {
  position: relative;
  overflow: hidden;
}

.app__summary p {
  margin: 0 0 0.5rem;
}

.app__summary--collapsed {
  max-height: 4.6em;
}

.app__summary--collapsed::after {
  content: '';
  position: absolute;
  inset: auto 0 0 0;
  height: 2.5em;
  background: linear-gradient(to bottom, rgba(255, 255, 255, 0), #fff);
}

.app__summary-toggle {
  display: block;
  margin: 0 0 0.75rem;
  padding: 0;
  border: none;
  background: none;
  color: #2657a3;
  cursor: pointer;
  font-size: 0.85rem;
}
</style>
