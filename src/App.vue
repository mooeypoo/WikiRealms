<script setup>
import { computed, defineAsyncComponent, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import SearchBar from './ui/components/SearchBar.vue'
import WorldView from './ui/components/WorldView.vue'
import Spinner from './ui/components/Spinner.vue'
import Taskbar from './ui/components/Taskbar.vue'
import InfoHub from './ui/components/InfoHub.vue'
import SettingsModal from './ui/components/SettingsModal.vue'
import { useArticle } from './ui/composables/useArticle.js'
import { useWorld } from './ui/composables/useWorld.js'
import { useTraversal } from './ui/composables/useTraversal.js'
import { useSnapshot } from './ui/composables/useSnapshot.js'
import { useShare } from './ui/composables/useShare.js'
import { useUIState } from './ui/composables/useUIState.js'
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
const { showInfoHub, showSettings, currentInfoTab, setInfoTab, preferences, updatePreferences } = useUIState()
const { shareArticle, toastMessage, toastVisible } = useShare()

const articleCache = ref({})
const isStale = ref(false)
const isSummaryExpanded = ref(false)
const portalConfirmation = ref(null)  // { targetArticleId, targetTitle }
const viewMode = ref('3d')
const showHudHidden = ref(false)
const isSearchOpen = ref(false)
const showNavigationTools = ref(false)
const isArticlePanelCollapsed = ref(false)
// Section anchor id currently focused via a map click (or null). Used to
// scroll the article panel's section list into view + flash the card.
const focusedSectionAnchor = ref(null)
const citationAtmosphere = computed(() => Math.min(0.7, Math.log1p(world.value?.citationCount ?? 0) / 10))

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
  isSearchOpen.value = false
  showNavigationTools.value = false
  navigateTo(result.title)
}

function onPortalClick(portal) {
  // First click shows confirmation, second click navigates
  portalConfirmation.value = { targetArticleId: portal.targetArticleId, targetTitle: portal.targetTitle }
}

function onSectionClick(target) {
  // sectionAnchor is already resolved to the owning top-level section —
  // the granularity the panel's section list renders. It's null for a
  // peak with no heading of its own (the folded "Miscellaneous" range),
  // in which case there's nothing to scroll to.
  const anchor = target?.sectionAnchor ?? target?.anchor
  if (!anchor) return
  isArticlePanelCollapsed.value = false
  focusedSectionAnchor.value = null
  // Force a change even if the same anchor is clicked twice — the watcher
  // that scrolls + highlights fires only on change.
  nextTick(() => {
    focusedSectionAnchor.value = anchor
  })
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

function toggleHideHud() {
  showHudHidden.value = !showHudHidden.value
}

function toggleNavigationTools() {
  showNavigationTools.value = !showNavigationTools.value
}

function onShareClick() {
  if (article.value?.title) {
    shareArticle(article.value.title)
  }
}

function handleAppKeyboard(event) {
  if (event.target.matches('input, textarea, select')) return

  if (event.key === 'h' || event.key === 'H') {
    event.preventDefault()
    toggleHideHud()
  } else if (event.key === 'ArrowLeft' && canGoBack.value) {
    event.preventDefault()
    goBack()
  } else if (event.key === 'ArrowRight' && canGoForward.value) {
    event.preventDefault()
    goForward()
  } else if (event.key === '1') {
    event.preventDefault()
    viewMode.value = '2d'
  } else if (event.key === '3') {
    event.preventDefault()
    viewMode.value = '3d'
  }
}

onMounted(() => {
  const restored = loadPersisted()
  if (restored) {
    restore(restored)
    articleCache.value = { ...restored.articleCache }
  }
  window.addEventListener('keydown', handleAppKeyboard)
})

onUnmounted(() => window.removeEventListener('keydown', handleAppKeyboard))

watch(current, (title) => {
  if (title) loadArticle(title)
})

watch(focusedSectionAnchor, async (anchor) => {
  if (!anchor) return
  // The panel un-collapses (v-show) in the flush before this one, so by
  // now the section cards are in the document and can be scrolled to.
  await nextTick()
  const el = document.getElementById(`app-section-${anchor}`)
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  flashSectionCard(el)
})

// Highlight lifecycle for the focused section card. Kept as one owner of
// the class + timer so a rapid re-click restarts the flash instead of
// inheriting the previous click's pending removal.
const SECTION_FLASH_CLASS = 'app__section-card--flash'
let flashedSectionEl = null
let flashTimeoutId = null

function flashSectionCard(el) {
  if (flashTimeoutId) clearTimeout(flashTimeoutId)
  flashedSectionEl?.classList.remove(SECTION_FLASH_CLASS)

  el.classList.remove(SECTION_FLASH_CLASS)
  void el.offsetWidth // reflow — restarts the CSS animation on a re-click
  el.classList.add(SECTION_FLASH_CLASS)
  flashedSectionEl = el

  flashTimeoutId = setTimeout(() => {
    el.classList.remove(SECTION_FLASH_CLASS)
    flashedSectionEl = null
    flashTimeoutId = null
  }, 1500)
}

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
  <div
    class="cosmos"
    :class="{ 'cosmos--hud-hidden': showHudHidden }"
    :style="{ '--hud-opacity': preferences.panelOpacity, '--citation-atmosphere': citationAtmosphere }"
  >
    <Taskbar
      :current-article-title="article?.title"
      :can-go-back="canGoBack"
      :can-go-forward="canGoForward"
      :has-world="Boolean(world)"
      :view-mode="viewMode"
      :search-open="isSearchOpen || !article"
      @toggle-info-hub="showInfoHub = !showInfoHub"
      @toggle-settings="showSettings = !showSettings"
      @toggle-search="isSearchOpen = !isSearchOpen"
      @go-back="goBack"
      @go-forward="goForward"
      @toggle-view-mode="toggleViewMode"
      @toggle-navigation-tools="toggleNavigationTools"
    >
      <template #search>
        <SearchBar @select="onSelect" />
      </template>
    </Taskbar>
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
        :show-portals="preferences.showPortals"
        :show-sections="preferences.showSections"
        :show-foliage="preferences.showFoliage"
        :world-shape="preferences.worldShape"
        class="cosmos__world"
        @portal-click="onPortalClick"
        @section-click="onSectionClick"
      />
      <WorldView
        v-else-if="worldStatus === 'success' && world"
        :world="world"
        :show-portals="preferences.showPortals"
        class="cosmos__world"
        @portal-click="onPortalClick"
      />
    </div>

    <div v-if="current" class="app__nav-controls hud hud--nav" :class="{ 'app__nav-controls--expanded': showNavigationTools }">
      <button type="button" @click="onExportClick">Export snapshot</button>
      <label class="app__import-label">
        Import snapshot
        <input type="file" accept="application/json" @change="onImportFile" />
      </label>
      <button type="button" class="app__nav-extra" @click="showInfoHub = !showInfoHub">Info</button>
      <button type="button" class="app__nav-extra" @click="showSettings = !showSettings">Settings</button>
      <button type="button" class="app__nav-extra" @click="onShareClick">Share</button>
    </div>

    <p v-if="snapshotErrorMessage" class="app__alert app__alert--error hud hud--alert">
      ⚠️ {{ snapshotErrorMessage }}
    </p>
    <p v-else-if="status === 'error'" class="app__alert app__alert--error hud hud--alert">⚠️ {{ errorMessage }}</p>
    <p v-else-if="worldStatus === 'error'" class="app__alert app__alert--error hud hud--alert">
      ⚠️ {{ worldErrorMessage }}
    </p>

    <Transition name="panel">
      <section
        v-if="status === 'success' && article"
        class="app__selected-article hud hud--article"
        :class="{ 'app__selected-article--collapsed': isArticlePanelCollapsed }"
      >
        <nav v-if="backstack.length > 0" class="app__breadcrumb" aria-label="Navigation history">
          <span class="app__breadcrumb-item">
            <button
              v-for="(item, index) in backstack.slice(-2)"
              :key="`back-${index}`"
              type="button"
              class="app__breadcrumb-link"
              :title="item"
              @click="navigateTo(item)"
            >
              {{ item }}
            </button>
          </span>
          <span class="app__breadcrumb-divider">/</span>
          <span class="app__breadcrumb-current">{{ current }}</span>
        </nav>
        <div class="app__article-heading">
          <h2>{{ article.title }}</h2>
          <span
            v-if="isStale"
            class="app__badge app__badge--stale"
            title="This article has a newer revision than when its world was first generated"
          >
            Updated since last visit
          </span>
          <button
            type="button"
            class="app__article-toggle"
            :aria-expanded="!isArticlePanelCollapsed"
            :aria-label="isArticlePanelCollapsed ? 'Expand article details' : 'Minimize article details'"
            @click="isArticlePanelCollapsed = !isArticlePanelCollapsed"
          >
            {{ isArticlePanelCollapsed ? '⌃' : '⌄' }}
          </button>
        </div>
        <div v-show="!isArticlePanelCollapsed" class="app__article-details">
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
            <div><dt>References</dt><dd>{{ article.sections?.citationCount ?? 0 }}</dd></div>
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
          <button type="button" class="app__share-button" @click="onShareClick">Share article</button>

          <section
            v-if="article.sections?.sections?.length"
            class="app__section-list"
            aria-label="Sections"
          >
            <h3 class="app__section-list-heading">Sections</h3>
            <article
              v-for="section in article.sections.sections"
              :id="section.anchor ? `app-section-${section.anchor}` : undefined"
              :key="section.anchor || section.title"
              class="app__section-card"
            >
              <header class="app__section-card__header">
                <h4>{{ section.title }}</h4>
                <a
                  v-if="article.url && section.anchor"
                  :href="`${article.url}#${section.anchor}`"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="app__section-card__link"
                  :aria-label="`View “${section.title}” on Wikipedia`"
                >↗</a>
              </header>
              <ul class="app__section-card__chips">
                <li v-if="section.children?.length" class="app__section-card__chip">
                  {{ section.children.length }} subsection<span v-if="section.children.length !== 1">s</span>
                </li>
                <li class="app__section-card__chip">
                  {{ Math.round((section.subtreeSize || section.ownSize || 0) / 5.5).toLocaleString('en-US') }} words
                </li>
                <li v-if="(section.subtreeCitationCount ?? section.citationCount ?? 0) > 0" class="app__section-card__chip">
                  {{ section.subtreeCitationCount ?? section.citationCount }} cite<span v-if="(section.subtreeCitationCount ?? section.citationCount) !== 1">s</span>
                </li>
              </ul>
            </article>
          </section>
        </div>
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
    <InfoHub
      :show="showInfoHub"
      :current-tab="currentInfoTab"
      @update:current-tab="setInfoTab"
      @close="showInfoHub = false"
    />
    <SettingsModal
      :show="showSettings"
      :preferences="preferences"
      @update:preferences="updatePreferences"
      @close="showSettings = false"
    />
    <Transition name="toast">
      <p v-if="toastVisible" class="app__toast">{{ toastMessage }}</p>
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

.cosmos__field::after {
  content: '';
  position: absolute;
  inset: 0;
  background-image:
    radial-gradient(1px 1px at 12% 38%, rgba(255, 223, 141, 0.9) 50%, transparent 50%),
    radial-gradient(1px 1px at 28% 78%, rgba(255, 223, 141, 0.8) 50%, transparent 50%),
    radial-gradient(1.5px 1.5px at 51% 18%, rgba(255, 223, 141, 0.9) 50%, transparent 50%),
    radial-gradient(1px 1px at 73% 32%, rgba(255, 223, 141, 0.8) 50%, transparent 50%),
    radial-gradient(1.5px 1.5px at 88% 76%, rgba(255, 223, 141, 0.9) 50%, transparent 50%);
  background-repeat: repeat;
  background-size: 320px 320px;
  opacity: calc(var(--citation-atmosphere, 0) * 0.42);
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
  background: var(--panel-secondary);
  border: 1px solid var(--panel-border);
  border-radius: var(--radius-lg);
  backdrop-filter: blur(10px);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  padding: var(--spacing-lg) var(--spacing-xl);
  z-index: 1;
  opacity: var(--hud-opacity, 1);
  transition: opacity var(--duration-normal) ease-out;
}

.hud--top {
  top: 4.75rem;
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
  top: 4.75rem;
  right: 1.25rem;
  display: none;
  gap: 0.5rem;
  flex-wrap: wrap;
  max-width: 220px;
}

.hud--nav.app__nav-controls--expanded {
  display: flex;
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
.app__import-label,
.app__nav-extra {
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

.app__nav-extra {
  display: none;
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
  padding: var(--spacing-md) var(--spacing-lg);
  border-radius: var(--radius-md);
  background: var(--danger-bg);
  color: var(--danger-text);
  border: 1px solid var(--danger-border);
  font-weight: 600;
}

.app__article-heading {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  flex-wrap: wrap;
  margin-bottom: var(--spacing-md);
}

.app__article-heading h2 {
  margin: 0;
  font-family: var(--font-display);
  letter-spacing: 0.02em;
  font-size: 1.5rem;
  color: var(--text-primary);
}

.app__breadcrumb {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  margin-bottom: var(--spacing-md);
  font-size: 0.85rem;
  flex-wrap: wrap;
}

.app__breadcrumb-item {
  display: flex;
  gap: var(--spacing-xs);
}

.app__breadcrumb-link {
  padding: 0;
  border: none;
  background: none;
  color: var(--accent);
  cursor: pointer;
  font-size: 0.85rem;
  transition: all var(--duration-fast) ease-out;
  text-decoration: underline;
}

.app__breadcrumb-link:hover {
  color: #9feeff;
  filter: var(--glow-subtle);
}

.app__breadcrumb-divider {
  color: var(--text-muted);
  margin: 0 var(--spacing-xs);
}

.app__breadcrumb-current {
  color: var(--text-secondary);
  font-weight: 600;
}

.app__badge {
  font-size: 0.75rem;
  padding: var(--spacing-xs) var(--spacing-sm);
  border-radius: 999px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.app__badge--stale {
  background: rgba(255, 210, 127, 0.15);
  color: var(--accent-warm);
  border: 1px solid rgba(255, 210, 127, 0.4);
}

.app__article-meta {
  display: flex;
  gap: var(--spacing-2xl);
  flex-wrap: wrap;
  margin: var(--spacing-lg) 0;
  padding: var(--spacing-lg) 0;
  border-top: 1px solid var(--panel-border);
  border-bottom: 1px solid var(--panel-border);
}

.app__article-meta div {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.app__article-meta dt {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
  font-weight: 600;
}

.app__article-meta dd {
  margin: 0;
  font-weight: 700;
  color: var(--text-primary);
  font-size: 1.1rem;
}

.app__external-link {
  display: inline-block;
  margin: var(--spacing-md) 0;
  padding: var(--spacing-sm) var(--spacing-md);
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--accent);
  border: 1px solid var(--panel-border-accent);
  border-radius: var(--radius-md);
  background: transparent;
  text-decoration: none;
  transition: all var(--duration-fast) ease-out;
}

.app__external-link:hover {
  background: rgba(127, 223, 255, 0.15);
  border-color: var(--accent);
  filter: var(--glow-subtle);
}

.app__share-button {
  display: inline-block;
  margin: var(--spacing-md) 0;
  padding: var(--spacing-sm) var(--spacing-md);
  border: 1px solid var(--accent-warm);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--accent-warm);
  cursor: pointer;
  font-size: 0.95rem;
  font-weight: 600;
  transition: all var(--duration-fast) ease-out;
}

.app__share-button:hover {
  background: rgba(255, 210, 127, 0.15);
  border-color: var(--accent-warm);
  filter: var(--glow-warm);
}

.app__share-button:active {
  background: rgba(255, 210, 127, 0.25);
  filter: none;
}

.app__section-list {
  margin-top: var(--spacing-md);
  padding-top: var(--spacing-md);
  border-top: 1px solid var(--panel-border);
  display: grid;
  gap: var(--spacing-sm);
}

.app__section-list-heading {
  font-family: var(--font-display);
  font-size: 0.85rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin: 0;
}

.app__section-card {
  padding: var(--spacing-sm) var(--spacing-md);
  border: 1px solid rgba(var(--panel-border-rgb), 0.3);
  border-radius: var(--radius-md);
  background: rgba(var(--panel-bg-rgb), 0.4);
  transition: border-color var(--duration-fast) ease-out, box-shadow var(--duration-fast) ease-out, background var(--duration-fast) ease-out;
}

/* Applied briefly after a map click scrolls this card into view. */
.app__section-card--flash {
  border-color: var(--accent);
  background: rgba(var(--accent-rgb), 0.14);
  box-shadow: 0 0 0 1px var(--accent), 0 6px 24px rgba(var(--accent-rgb), 0.25);
  animation: sectionCardFlash 1.5s ease-out;
}

@keyframes sectionCardFlash {
  0% { box-shadow: 0 0 0 4px rgba(var(--accent-rgb), 0.35), 0 6px 24px rgba(var(--accent-rgb), 0.3); }
  100% { box-shadow: 0 0 0 1px var(--accent), 0 6px 24px rgba(var(--accent-rgb), 0.25); }
}

.app__section-card__header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--spacing-sm);
}

.app__section-card__header h4 {
  font-family: var(--font-display);
  font-size: 0.95rem;
  color: var(--text-primary);
  margin: 0;
  letter-spacing: 0.02em;
}

.app__section-card__link {
  text-decoration: none;
  color: var(--text-link);
  font-size: 0.9rem;
  padding: 0.1rem 0.35rem;
  border-radius: var(--radius-sm);
  opacity: 0.7;
}

.app__section-card__link:hover {
  opacity: 1;
  background: rgba(var(--accent-rgb), 0.1);
}

.app__section-card__chips {
  list-style: none;
  margin: 0.35rem 0 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.app__section-card__chip {
  font-family: var(--font-body);
  font-size: 0.7rem;
  color: var(--text-secondary);
  background: rgba(var(--panel-border-rgb), 0.12);
  border: 1px solid rgba(var(--panel-border-rgb), 0.25);
  border-radius: var(--radius-sm);
  padding: 0.12rem 0.4rem;
}

.app__summary {
  position: relative;
  overflow: hidden;
  margin-bottom: var(--spacing-md);
}

.app__summary p {
  margin: 0 0 var(--spacing-sm) 0;
  color: var(--text-secondary);
  line-height: 1.6;
}

.app__summary--collapsed {
  max-height: 4.6em;
}

.app__summary--collapsed::after {
  content: '';
  position: absolute;
  inset: auto 0 0 0;
  height: 2.5em;
  background: linear-gradient(to bottom, transparent, var(--panel-secondary));
}

.app__summary-toggle {
  display: inline-block;
  margin: var(--spacing-md) 0;
  padding: 0;
  border: none;
  background: none;
  color: var(--accent);
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 600;
  transition: color var(--duration-fast) ease-out;
}

.app__summary-toggle:hover {
  color: #9feeff;
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
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(4px);
  z-index: 1000;
  animation: fadeIn var(--duration-normal) ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.app__portal-modal-content {
  background: linear-gradient(135deg, var(--panel-primary), rgba(18, 22, 40, 0.9));
  border: 1px solid var(--panel-border-accent);
  border-radius: var(--radius-lg);
  padding: var(--spacing-2xl);
  max-width: 420px;
  text-align: center;
  backdrop-filter: blur(10px);
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(127, 223, 255, 0.1);
  animation: slideUp var(--duration-normal) cubic-bezier(0.34, 1.56, 0.64, 1);
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

.app__article-toggle {
  display: grid;
  flex: none;
  width: 40px;
  height: 40px;
  margin-left: auto;
  place-items: center;
  border: 1px solid var(--panel-border-accent);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--accent);
  cursor: pointer;
  font-size: 1.25rem;
  transition: all var(--duration-fast) ease-out;
}

.app__article-toggle:hover {
  border-color: var(--accent);
  background: rgba(127, 223, 255, 0.15);
  filter: var(--glow-subtle);
}

.app__article-toggle:active {
  background: var(--accent-subtle);
  filter: none;
}

.app__portal-modal-label {
  color: var(--text-muted);
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin: 0 0 var(--spacing-md) 0;
  font-weight: 600;
}

.app__portal-modal-title {
  color: var(--text-primary);
  font-family: var(--font-display);
  font-size: 1.75rem;
  margin: 0 0 var(--spacing-2xl) 0;
  background: linear-gradient(135deg, var(--accent), var(--accent-warm));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.app__portal-modal-actions {
  display: flex;
  gap: var(--spacing-lg);
  justify-content: center;
  flex-wrap: wrap;
}

.app__portal-modal-cancel,
.app__portal-modal-confirm {
  padding: var(--spacing-sm) var(--spacing-lg);
  border-radius: var(--radius-md);
  border: 1px solid var(--panel-border);
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--duration-fast) ease-out;
  min-height: var(--size-touch);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.app__portal-modal-cancel {
  background: transparent;
  color: var(--text-secondary);
  border-color: var(--panel-border);
}

.app__portal-modal-cancel:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-primary);
  border-color: var(--panel-border-accent);
}

.app__portal-modal-cancel:active {
  background: rgba(255, 255, 255, 0.12);
}

.app__portal-modal-confirm {
  background: linear-gradient(135deg, var(--accent), #5ec9ff);
  color: var(--bg-deep);
  border-color: var(--accent);
  font-weight: 700;
}

.app__portal-modal-confirm:hover {
  background: linear-gradient(135deg, #9feeff, #7fd9ff);
  filter: var(--glow-accent);
  border-color: #9feeff;
}

.app__portal-modal-confirm:active {
  background: linear-gradient(135deg, #5ec9ff, #3dbfff);
  filter: none;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.cosmos--hud-hidden .hud {
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s ease;
}

.app__toast {
  position: fixed;
  z-index: 2100;
  left: 50%;
  bottom: 1.5rem;
  margin: 0;
  padding: 0.7rem 1rem;
  transform: translateX(-50%);
  border: 1px solid rgba(127, 223, 255, 0.5);
  border-radius: 6px;
  background: rgba(18, 22, 40, 0.95);
  box-shadow: 0 0 14px rgba(127, 223, 255, 0.25);
  color: var(--text-primary);
}

.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translate(-50%, 12px);
}

@media (max-width: 1023px) {
  .hud--nav {
    top: 4.75rem;
  }

  .app__nav-extra {
    display: inline-block;
  }
}

@media (max-width: 767px) {
  .hud--nav {
    top: 4.75rem;
    right: 1rem;
    bottom: auto;
    display: none;
    width: min(15rem, calc(100vw - 2rem));
    max-width: none;
    padding: var(--spacing-sm);
    gap: var(--spacing-xs);
  }

  .hud--nav.app__nav-controls--expanded {
    display: flex;
  }

  .app__nav-controls button,
  .app__nav-controls .app__import-label {
    width: 100%;
    min-height: var(--size-touch);
    box-sizing: border-box;
    text-align: left;
  }

  .app__nav-controls button {
    justify-content: flex-start;
  }

  .hud--article {
    bottom: 1rem;
  }

  .hud--status,
  .hud--alert {
    top: 6.5rem;
  }

  .app__toast {
    bottom: 1.5rem;
  }

  .app__selected-article--collapsed {
    width: min(420px, calc(100vw - 2rem));
    max-height: none;
    padding: 0.65rem 0.8rem;
    overflow: hidden;
  }

  .app__selected-article--collapsed .app__article-heading {
    flex-wrap: nowrap;
  }

  .app__selected-article--collapsed h2 {
    overflow: hidden;
    font-size: 1rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

@media (max-width: 640px) {
  .hud--article {
    left: 0.5rem;
    right: 0.5rem;
    width: auto;
    max-width: none;
    bottom: 0.5rem;
    max-height: 50vh;
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  }

  .app__article-heading {
    margin-bottom: var(--spacing-sm);
  }

  .app__article-heading h2 {
    font-size: 1.25rem;
  }

  .app__article-meta {
    gap: var(--spacing-lg);
    padding: var(--spacing-md) 0;
    margin: var(--spacing-md) 0;
  }

  .app__article-meta dt {
    font-size: 0.65rem;
  }

  .app__article-meta dd {
    font-size: 1rem;
  }

  .app__external-link,
  .app__share-button {
    display: block;
    width: 100%;
    box-sizing: border-box;
    text-align: center;
    margin: var(--spacing-sm) 0;
  }

  .app__breadcrumb,
  .app__breadcrumb-link {
    font-size: 0.75rem;
  }

  .app__portal-modal-content {
    width: calc(100vw - 2rem);
    box-sizing: border-box;
    padding: var(--spacing-lg);
  }

  .app__portal-modal-title {
    font-size: 1.5rem;
  }

  .app__portal-modal-actions {
    flex-direction: column;
    gap: var(--spacing-sm);
  }

  .app__portal-modal-cancel,
  .app__portal-modal-confirm {
    width: 100%;
  }
}
</style>
