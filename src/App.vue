<script setup>
import { computed, defineAsyncComponent, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import Launch from './ui/components/Launch.vue'
import CommandPalette from './ui/components/CommandPalette.vue'
import WorldView from './ui/components/WorldView.vue'
import Spinner from './ui/components/Spinner.vue'
import Icon from './ui/design/Icon.vue'
import TopScrim from './ui/components/TopScrim.vue'
import Helm from './ui/components/Helm.vue'
import TrailMenu from './ui/components/TrailMenu.vue'
import JourneyMenu from './ui/components/JourneyMenu.vue'
import Ledger from './ui/components/Ledger.vue'
import InfoHub from './ui/components/InfoHub.vue'
import SettingsModal from './ui/components/SettingsModal.vue'
import { useArticle } from './ui/composables/useArticle.js'
import { useWorld } from './ui/composables/useWorld.js'
import { useTraversal } from './ui/composables/useTraversal.js'
import { useSnapshot } from './ui/composables/useSnapshot.js'
import { useShare } from './ui/composables/useShare.js'
import { useUIState } from './ui/composables/useUIState.js'
import { useKeymap } from './ui/design/useKeymap.js'
import { onHistoryPop, pushRealm, readRealm } from './adapters/urlState.js'
import { supportsWebGL } from './ui/rendering/webglSupport.js'
import { useViewport } from './ui/design/useViewport.js'
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
const {
  graph,
  current,
  currentNodeId,
  path,
  canGoBack,
  canGoForward,
  navigateTo,
  jumpTo,
  goToNode,
  goBack,
  goForward,
  restore,
} = useTraversal()
const { errorMessage: snapshotErrorMessage, exportSnapshot, importSnapshot, persist, loadPersisted } = useSnapshot()
const { showInfoHub, showSettings, currentInfoTab, setInfoTab, preferences, updatePreferences } = useUIState()
const { shareArticle, toastMessage, toastVisible } = useShare()
const viewport = useViewport()

const articleCache = ref({})
const isStale = ref(false)
const portalConfirmation = ref(null)  // { targetArticleId, targetTitle }
const worldViewRef = ref(null)
const showHudHidden = ref(false)
const isSearchOpen = ref(false)
const showTrail = ref(false)
const showJourney = ref(false)
// Section anchor id currently focused via a map click (or null). Used to
// scroll the article panel's section list into view + flash the card.
const focusedSectionAnchor = ref(null)
const citationAtmosphere = computed(() => Math.min(0.7, Math.log1p(world.value?.citationCount ?? 0) / 10))

/**
 * ONE view axis (docs/ux-vision.md D1). Planet and Flat are two renderings
 * of the identical world; switching never re-rolls terrain.
 *
 * The 2D canvas is no longer a peer of these — it is the fallback, chosen
 * by capability or explicitly in settings. Before this, "Flat" named both
 * it and the flat 3D map, from two unrelated controls.
 */
function setWorldShape(shape) {
  updatePreferences({ worldShape: shape })
}

function toggleWorldShape() {
  setWorldShape(preferences.worldShape === 'sphere' ? 'flat' : 'sphere')
}

function recenterView() {
  worldViewRef.value?.recenter?.()
}

const rendersInWebGL = computed(() => {
  const quality = preferences.rendering ?? 'auto'
  if (quality === 'low') return false
  if (quality === 'high') return true
  return supportsWebGL()
})

function onSelect(result) {
  isSearchOpen.value = false
  // A search is not travel: it starts a journey rather than pretending the
  // result was reached from wherever the viewer happened to be standing.
  jumpTo(result.title)
}

function onPortalClick(portal) {
  // First click shows confirmation, second click navigates
  portalConfirmation.value = { targetArticleId: portal.targetArticleId, targetTitle: portal.targetTitle }
}

function onSectionClick(target) {
  // sectionAnchor is already resolved to the owning top-level section —
  // the granularity the Ledger's list renders. It's null for a peak with no
  // heading of its own (the folded "Miscellaneous" range), so there is
  // nothing to scroll to.
  const anchor = target?.sectionAnchor ?? target?.anchor
  if (!anchor) return
  focusedSectionAnchor.value = null
  // Force a change even when the same anchor is clicked twice: the Ledger
  // reacts to the value changing.
  nextTick(() => {
    focusedSectionAnchor.value = anchor
  })
}

/**
 * How much of the Ledger is showing. Remembered once chosen; until then a
 * phone opens at peek and a desktop at open, since the smaller the screen
 * the more the world is the point.
 */
const ledgerState = computed(
  () => preferences.ledgerState ?? (viewport.atLeast('md') ? 'open' : 'peek'),
)

function setLedgerState(state) {
  updatePreferences({ ledgerState: state })
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
    graph: graph.value,
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

function onImportFile(file) {
  showJourney.value = false
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

function onTrailSelect(nodeId) {
  showTrail.value = false
  goToNode(nodeId)
}

function onShareClick() {
  showJourney.value = false
  if (article.value?.title) {
    shareArticle(article.value.title)
  }
}

// Every shortcut in the app is declared here, in one registry. The Field
// Guide renders this list rather than restating it, so a binding and its
// documentation cannot drift apart the way they had.
const { register } = useKeymap()

register({ keys: 'h', label: 'Hide the interface', group: 'View', run: toggleHideHud })
register({ keys: ['?', 'i'], label: 'About WikiRealms', group: 'View', run: () => (showInfoHub.value = !showInfoHub.value) })
register({ keys: 's', label: 'Settings', group: 'View', run: () => (showSettings.value = !showSettings.value) })
register({
  keys: ['mod+k', '/'],
  label: 'Search for a realm',
  group: 'Travel',
  // Only once there is somewhere to leave: before that the launch screen
  // already has the field, focused.
  enabled: () => Boolean(current.value),
  run: () => (isSearchOpen.value = true),
})
register({ keys: 'v', label: 'Switch between planet and flat', group: 'View', run: toggleWorldShape })
register({ keys: 'c', label: 'Recentre the view', group: 'View', run: recenterView })
register({
  keys: 'ArrowLeft',
  label: 'Back through your trail',
  group: 'Travel',
  enabled: () => canGoBack.value,
  run: goBack,
})
register({
  keys: 'ArrowRight',
  label: 'Forward through your trail',
  group: 'Travel',
  enabled: () => canGoForward.value,
  run: goForward,
})

// The URL is the session's address. Set while replaying history so a move
// the browser initiated is not written straight back to it.
let replayingHistory = false
let stopHistoryListener = null

onMounted(() => {
  const restored = loadPersisted()
  if (restored) {
    restore(restored)
    articleCache.value = { ...restored.articleCache }
  }

  // A shared link wins over the restored session: someone following one
  // means to land where it points, not where they last were.
  const sharedRealm = readRealm()
  if (sharedRealm && sharedRealm !== current.value) jumpTo(sharedRealm)

  pushRealm(current.value, currentNodeId.value, { replace: true })

  stopHistoryListener = onHistoryPop((state, realm) => {
    replayingHistory = true
    if (state.nodeId && graph.value.nodes[state.nodeId]) goToNode(state.nodeId)
    else if (realm) jumpTo(realm)
    replayingHistory = false
  })
})

onUnmounted(() => stopHistoryListener?.())

// Every move the viewer makes becomes a history entry, so the browser's own
// back button retraces the journey instead of leaving the app.
watch(currentNodeId, (nodeId) => {
  if (replayingHistory) return
  pushRealm(current.value, nodeId)
})

watch(current, (title) => {
  if (title) loadArticle(title)
})

watch(article, (newArticle) => {
  if (newArticle) {
    const previous = articleCache.value[newArticle.title]
    isStale.value = previous ? isWorldStale(previous.latestRevisionId, newArticle.latestRevisionId) : false
    articleCache.value = { ...articleCache.value, [newArticle.title]: newArticle }
    buildWorld(newArticle)
  } else {
    clearWorld()
  }
})

watch([graph, articleCache], () => {
  persist(
    exportSnapshot({
      graph: graph.value,
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
    <TopScrim
      v-if="!showHudHidden"
      :realm="article?.title"
      :trail-length="path.length"
      :can-go-back="canGoBack"
      :can-go-forward="canGoForward"
      @back="goBack"
      @forward="goForward"
      @trail="showTrail = true"
      @search="isSearchOpen = true"
      @journey="showJourney = true"
      @guide="showInfoHub = true"
      @settings="showSettings = true"
    />
    <div class="cosmos__field" aria-hidden="true"></div>

    <div class="cosmos__stage">
      <p v-if="status === 'loading'" class="app__status hud hud--status"><Spinner /> Loading article…</p>
      <p v-else-if="worldStatus === 'loading' && article" class="app__status hud hud--status">
        <Spinner /> Generating world…
      </p>
      <WorldView3D
        v-if="worldStatus === 'success' && world && rendersInWebGL"
        ref="worldViewRef"
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

    <Helm
      v-if="world && !showHudHidden"
      :world-shape="preferences.worldShape"
      :disabled="worldStatus !== 'success'"
      :can-recenter="rendersInWebGL"
      @update:world-shape="setWorldShape"
      @recenter="recenterView"
    />


    <p v-if="snapshotErrorMessage" class="app__alert app__alert--error hud hud--alert">
      ⚠️ {{ snapshotErrorMessage }}
    </p>
    <p v-else-if="status === 'error'" class="app__alert app__alert--error hud hud--alert">⚠️ {{ errorMessage }}</p>
    <p v-else-if="worldStatus === 'error'" class="app__alert app__alert--error hud hud--alert">
      ⚠️ {{ worldErrorMessage }}
    </p>

    <Ledger
      v-if="status === 'success' && article && !showHudHidden"
      :article="article"
      :world="world"
      :state="ledgerState"
      :stale="isStale"
      :focused-section="focusedSectionAnchor"
      @update:state="setLedgerState"
      @share="onShareClick"
    />

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
    <Launch v-if="!current" @select="onSelect" @guide="showInfoHub = true" />

    <CommandPalette :show="isSearchOpen" @select="onSelect" @close="isSearchOpen = false" />

    <TrailMenu :show="showTrail" :path="path" @select="onTrailSelect" @close="showTrail = false" />

    <JourneyMenu
      :show="showJourney"
      :can-share="Boolean(article)"
      @share="onShareClick"
      @export="onExportClick"
      @import="onImportFile"
      @close="showJourney = false"
    />

    <button
      v-if="showHudHidden"
      class="app__reveal"
      type="button"
      aria-label="Show the interface"
      @click="showHudHidden = false"
    >
      <Icon name="eye" :size="18" />
    </button>

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
/* The one thing left on screen in immersive mode: without it, hiding the
   interface would hide its own way back. */
.app__reveal {
  position: fixed;
  top: max(var(--spacing-md), env(safe-area-inset-top, 0px));
  right: max(var(--spacing-md), env(safe-area-inset-right, 0px));
  z-index: var(--z-instruments);
  display: grid;
  place-items: center;
  width: var(--hit);
  height: var(--hit);
  border: 1px solid var(--edge-hair);
  border-radius: var(--radius-md);
  background: var(--surface-1);
  color: var(--ink-3);
  opacity: 0.5;
}

.app__reveal:hover {
  border-color: var(--edge-accent);
  color: var(--accent);
  opacity: 1;
}

.app__sheet-title {
  margin: 0;
  font-size: var(--text-lg);
}

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

@media (max-width: 767px) {

  .hud--status,
  .hud--alert {
    top: 6.5rem;
  }

  .app__toast {
    bottom: 1.5rem;
  }
}

@media (max-width: 640px) {

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
}</style>
