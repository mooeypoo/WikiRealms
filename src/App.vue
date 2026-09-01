<script setup>
import { defineAsyncComponent, onMounted, ref, watch } from 'vue'
import SearchBar from './ui/components/SearchBar.vue'
import WorldView from './ui/components/WorldView.vue'
import Spinner from './ui/components/Spinner.vue'
import { useArticle } from './ui/composables/useArticle.js'
import { useWorld } from './ui/composables/useWorld.js'
import { useTraversal } from './ui/composables/useTraversal.js'
import { useSnapshot } from './ui/composables/useSnapshot.js'
import { CURRENT_ENGINE_VERSION } from './engine/generation/engineVersion.js'
import { isWorldStale } from './core/article/staleness.js'

// three.js is heavy; only load it once a 3D view is actually rendered.
const WorldView3D = defineAsyncComponent(() => import('./ui/components/WorldView3D.vue'))

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
const portalConfirmation = ref(null)  // { targetArticleId, targetTitle }
const viewMode = ref('3d')

function toggleViewMode() {
  viewMode.value = viewMode.value === '3d' ? '2d' : '3d'
}

function countSections(sectionTree) {
  if (!sectionTree || !sectionTree.sections) return 0
  let count = 0
  const traverse = (sections) => {
    for (const section of sections) {
      count++
      if (section.children && section.children.length > 0) {
        traverse(section.children)
      }
    }
  }
  traverse(sectionTree.sections)
  return count
}

function onSelect(result) {
  navigateTo(result.title)
}

function onPortalClick(portal) {
  // First click shows confirmation, second click navigates
  portalConfirmation.value = { targetArticleId: portal.targetArticleId, targetTitle: portal.targetTitle }
}

function confirmPortal() {
  if (portalConfirmation.value) {
    navigateTo(portalConfirmation.value.targetArticleId)
    portalConfirmation.value = null
  }
}

function cancelPortal() {
  portalConfirmation.value = null
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
  <div class="cosmos">
    <div class="cosmos__field" aria-hidden="true"></div>

    <div class="cosmos__stage">
      <p v-if="!current && status === 'idle'" class="app__empty-state cosmos__empty">
        No world yet — search for an article above to generate one.
      </p>
      <p v-if="status === 'loading'" class="app__status hud hud--status"><Spinner /> Loading article…</p>
      <p v-else-if="worldStatus === 'loading' && article" class="app__status hud hud--status">
        <Spinner /> Generating world…
      </p>
      <WorldView3D
        v-if="worldStatus === 'success' && world && viewMode === '3d'"
        :world="world"
        class="cosmos__world"
        @portal-click="onPortalClick"
      />
      <WorldView
        v-else-if="worldStatus === 'success' && world"
        :world="world"
        class="cosmos__world"
        @portal-click="onPortalClick"
      />
    </div>

    <header class="hud hud--top">
      <h1 class="hud__title">WikiRealms</h1>
      <SearchBar @select="onSelect" />
    </header>

    <div v-if="current" class="app__nav-controls hud hud--nav">
      <button type="button" :disabled="!canGoBack" @click="goBack">← Back</button>
      <button type="button" :disabled="!canGoForward" @click="goForward">Forward →</button>
      <button v-if="world" type="button" @click="toggleViewMode">{{ viewMode === '3d' ? '2D view' : '3D view' }}</button>
      <button type="button" @click="onExportClick">Export snapshot</button>
      <label class="app__import-label">
        Import snapshot
        <input type="file" accept="application/json" @change="onImportFile" />
      </label>
    </div>

    <p v-if="snapshotErrorMessage" class="app__alert app__alert--error hud hud--alert">
      ⚠️ {{ snapshotErrorMessage }}
    </p>
    <p v-else-if="status === 'error'" class="app__alert app__alert--error hud hud--alert">⚠️ {{ errorMessage }}</p>
    <p v-else-if="worldStatus === 'error'" class="app__alert app__alert--error hud hud--alert">
      ⚠️ {{ worldErrorMessage }}
    </p>

    <Transition name="panel">
      <section v-if="status === 'success' && article" class="app__selected-article hud hud--article">
        <div class="app__article-heading">
          <h2>{{ article.title }}</h2>
          <span
            v-if="isStale"
            class="app__badge app__badge--stale"
            title="This article has a newer revision than when its world was first generated"
          >
            Updated since last visit
          </span>
        </div>
        <div v-if="article.summary" class="app__summary" :class="{ 'app__summary--collapsed': !isSummaryExpanded }">
          <p>{{ article.summary }}</p>
        </div>
        <button
          v-if="article.summary"
          type="button"
          class="app__summary-toggle"
          @click="isSummaryExpanded = !isSummaryExpanded"
        >
          {{ isSummaryExpanded ? 'Show less ▲' : 'Show more ▼' }}
        </button>
        <p v-else class="app__empty-state">No summary available for this article.</p>
        <dl class="app__article-meta">
          <div><dt>Revision</dt><dd>{{ article.latestRevisionId }}</dd></div>
          <div><dt>Categories</dt><dd>{{ article.categories.length }}</dd></div>
          <div><dt>Sections</dt><dd>{{ countSections(article.sections) }}</dd></div>
          <div><dt>Outbound links</dt><dd>{{ article.links.length }}</dd></div>
        </dl>
        <a
          v-if="article.url"
          :href="article.url"
          target="_blank"
          rel="noopener noreferrer"
          class="app__external-link"
        >
          View on Wikipedia ↗
        </a>
      </section>
    </Transition>
    <Transition name="fade">
      <div v-if="portalConfirmation" class="app__portal-modal" @click="cancelPortal">
        <div class="app__portal-modal-content" @click.stop>
          <p class="app__portal-modal-label">Portal to</p>
          <h3 class="app__portal-modal-title">{{ portalConfirmation.targetTitle }}</h3>
          <div class="app__portal-modal-actions">
            <button class="app__portal-modal-cancel" @click="cancelPortal">Cancel</button>
            <button class="app__portal-modal-confirm" @click="confirmPortal">Go →</button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.cosmos {
  position: fixed;
  inset: 0;
  overflow: hidden;
}

.cosmos__field {
  position: absolute;
  inset: 0;
  background-image:
    radial-gradient(1px 1px at 10% 20%, rgba(255, 255, 255, 0.8) 50%, transparent 50%),
    radial-gradient(1px 1px at 80% 10%, rgba(255, 255, 255, 0.6) 50%, transparent 50%),
    radial-gradient(1.5px 1.5px at 40% 70%, rgba(255, 255, 255, 0.7) 50%, transparent 50%),
    radial-gradient(1px 1px at 65% 85%, rgba(255, 255, 255, 0.5) 50%, transparent 50%),
    radial-gradient(1px 1px at 90% 60%, rgba(255, 255, 255, 0.6) 50%, transparent 50%),
    radial-gradient(1.5px 1.5px at 25% 45%, rgba(255, 255, 255, 0.5) 50%, transparent 50%);
  background-repeat: repeat;
  background-size: 400px 400px;
  opacity: 0.6;
  pointer-events: none;
}

.cosmos__stage {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.cosmos__world {
  width: 100%;
  height: 100%;
}

.cosmos__empty {
  color: var(--text-muted);
  font-style: italic;
}

.hud {
  position: absolute;
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: 12px;
  backdrop-filter: blur(10px);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  padding: 1rem 1.25rem;
  z-index: 1;
}

.hud--top {
  top: 1.25rem;
  left: 50%;
  transform: translateX(-50%);
  width: min(480px, 90vw);
  text-align: center;
}

.hud__title {
  margin: 0 0 0.6rem;
  font-family: var(--font-display);
  font-weight: 600;
  letter-spacing: 0.05em;
  font-size: 1.5rem;
  background: linear-gradient(135deg, var(--accent), var(--accent-warm));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.hud--nav {
  top: 1.25rem;
  right: 1.25rem;
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  max-width: 220px;
}

.hud--article {
  left: 1.25rem;
  bottom: 1.25rem;
  width: min(420px, 90vw);
  max-height: 60vh;
  overflow-y: auto;
}

.hud--alert {
  top: 6.5rem;
  left: 50%;
  transform: translateX(-50%);
  width: min(480px, 90vw);
}

.hud--status {
  top: 6.5rem;
  left: 50%;
  transform: translateX(-50%);
  color: var(--text-muted);
}

.app__nav-controls button,
.app__import-label {
  padding: 0.4rem 0.8rem;
  border: 1px solid var(--panel-border);
  border-radius: 6px;
  background: rgba(120, 140, 255, 0.12);
  color: var(--text-primary);
  cursor: pointer;
  font-size: 0.9rem;
}

.app__nav-controls button:disabled {
  cursor: not-allowed;
  opacity: 0.4;
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

.app__status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.app__alert {
  padding: 0.6rem 0.9rem;
  border-radius: 6px;
  background: var(--danger-bg);
  color: var(--danger-text);
  border: 1px solid var(--danger-border);
}

.app__article-heading {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
}

.app__article-heading h2 {
  margin: 0;
  font-family: var(--font-display);
  letter-spacing: 0.02em;
}

.app__badge {
  font-size: 0.75rem;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
}

.app__badge--stale {
  background: rgba(255, 210, 127, 0.15);
  color: var(--accent-warm);
  border: 1px solid rgba(255, 210, 127, 0.4);
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
  color: var(--text-muted);
}

.app__article-meta dd {
  margin: 0;
  font-weight: 600;
}

.app__external-link {
  display: inline-block;
  margin-bottom: 0.75rem;
  font-size: 0.9rem;
  color: var(--accent);
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
  background: linear-gradient(to bottom, rgba(18, 22, 40, 0), var(--panel-bg));
}

.app__summary-toggle {
  display: block;
  margin: 0 0 0.75rem;
  padding: 0;
  border: none;
  background: none;
  color: var(--accent);
  cursor: pointer;
  font-size: 0.85rem;
}

.panel-enter-active,
.panel-leave-active {
  transition:
    opacity 0.35s ease,
    transform 0.35s ease;
}

.panel-enter-from,
.panel-leave-to {
  opacity: 0;
  transform: translateY(12px);
}

.app__portal-modal {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  z-index: 1000;
}

.app__portal-modal-content {
  background: var(--panel-bg, rgba(18, 22, 40, 0.95));
  border: 1px solid var(--panel-border, rgba(120, 140, 255, 0.28));
  border-radius: 8px;
  padding: 2rem;
  max-width: 400px;
  text-align: center;
  backdrop-filter: blur(8px);
  animation: slideUp 0.3s ease-out;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.app__portal-modal-label {
  color: var(--text-muted, #888);
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0 0 0.5rem 0;
}

.app__portal-modal-title {
  color: var(--text-primary, #eef0ff);
  font-size: 1.5rem;
  margin: 0 0 1.5rem 0;
}

.app__portal-modal-actions {
  display: flex;
  gap: 1rem;
  justify-content: center;
}

.app__portal-modal-cancel,
.app__portal-modal-confirm {
  padding: 0.6rem 1.2rem;
  border-radius: 4px;
  border: 1px solid var(--panel-border, rgba(120, 140, 255, 0.28));
  font-size: 0.95rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.app__portal-modal-cancel {
  background: transparent;
  color: var(--text-muted, #888);
}

.app__portal-modal-cancel:hover {
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-primary, #eef0ff);
}

.app__portal-modal-confirm {
  background: rgba(120, 140, 255, 0.2);
  color: var(--text-primary, #eef0ff);
}

.app__portal-modal-confirm:hover {
  background: rgba(120, 140, 255, 0.35);
  border-color: rgba(120, 140, 255, 0.5);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
