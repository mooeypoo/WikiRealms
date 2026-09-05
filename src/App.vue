<script setup>
import { computed, defineAsyncComponent, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import Launch from './ui/components/Launch.vue'
import CommandPalette from './ui/components/CommandPalette.vue'
import PortalPreview from './ui/components/PortalPreview.vue'
import Legend from './ui/components/Legend.vue'
import WorldView from './ui/components/WorldView.vue'
import Spinner from './ui/components/Spinner.vue'
import Icon from './ui/design/Icon.vue'
import TopScrim from './ui/components/TopScrim.vue'
import Helm from './ui/components/Helm.vue'
import TrailMenu from './ui/components/TrailMenu.vue'
import ToolsMenu from './ui/components/ToolsMenu.vue'
import Ledger from './ui/components/Ledger.vue'
import { clearsLedger, ledgerClearance } from './ui/components/ledgerStates.js'
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
import { useTravel } from './ui/design/useTravel.js'
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
const travel = useTravel({
  prefersReducedMotion: () =>
    preferences.travelAnimation === false ||
    (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true),
})

const articleCache = ref({})
const isStale = ref(false)
const portalPreview = ref(null)  // { portal, anchor }
const worldViewRef = ref(null)
const showHudHidden = ref(false)
const isSearchOpen = ref(false)
const showTrail = ref(false)
const showTools = ref(false)
const showLaunch = ref(false)
const showLegend = ref(false)
const legendAnchors = ref({})
// Section anchor id currently focused via a map click (or null). Used to
// scroll the article panel's section list into view + flash the card.
const focusedSectionAnchor = ref(null)
/**
 * The one thing said aloud. Kept to arrivals and failures: a live region
 * that narrates every state change is noise, and the interesting event is
 * "there is a world now", not "there is a spinner".
 */
const announcement = computed(() => {
  if (status.value === 'error') return errorMessage.value ?? 'Could not load that article'
  if (worldStatus.value === 'error') return worldErrorMessage.value ?? 'Could not build that world'
  if (worldStatus.value === 'success' && article.value) {
    return `Arrived in ${article.value.title}`
  }
  return ''
})

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
  showLaunch.value = false
  // A search is not travel: it starts a journey rather than pretending the
  // result was reached from wherever the viewer happened to be standing.
  jumpTo(result.title)
}

function onPortalClick({ portal, anchor }) {
  // The preview IS the confirmation: naming the destination is most of what
  // a confirm step was ever for, and asking at the marker beats asking in
  // the middle of the screen, away from what was tapped.
  portalPreview.value = anchor ? { portal, anchor } : null
  // No anchor means the marker could not be placed on screen; travel
  // directly rather than silently doing nothing.
  if (!anchor) confirmTravel(portal)
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

/**
 * On a phone the Ledger's sheet and the helm share the bottom of the
 * screen, so the helm rises to clear it — and once the sheet is past peek
 * there is nowhere left to rise to, so the helm stands down rather than
 * perching on top of a panel the viewer is reading.
 *
 * Neither applies elsewhere: on a desktop the Ledger is docked bottom-LEFT
 * and the helm is bottom-right, and on a landscape phone the Ledger is a
 * right-hand drawer while the helm has already crossed to the left edge.
 */
const ledgerSharesTheCorner = computed(() => !viewport.atLeast('md') && !viewport.isShort.value)

const helmLift = computed(() =>
  ledgerSharesTheCorner.value ? ledgerClearance(ledgerState.value) : '0px',
)

const helmVisible = computed(
  () => !ledgerSharesTheCorner.value || clearsLedger(ledgerState.value),
)

function setLedgerState(state) {
  updatePreferences({ ledgerState: state })
}

function confirmTravel(portal) {
  portalPreview.value = null
  travel.travel(portal, {
    onDive: () => worldViewRef.value?.diveTo?.(portal),
    // Behind the wash: navigateTo triggers the fetch and the ~120ms
    // synchronous generate, which would stutter anything still moving.
    onArrive: () => navigateTo(portal.targetArticleId),
  })
}

function onCancelTravel() {
  travel.cancel()
  worldViewRef.value?.cancelDive?.()
}

function dismissPreview() {
  portalPreview.value = null
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

/**
 * The legend points at real features, so it asks the renderer where they
 * are at the moment it opens rather than tracking them continuously — it
 * is a held explanation, not a HUD.
 */
/**
 * Everywhere visited, not the depth of the branch you happen to be on: the
 * badge and the panel it opens should be counting the same thing.
 */
const trailSize = computed(() => Object.keys(graph.value.realms).length)

function toggleLegend() {
  if (showLegend.value) {
    showLegend.value = false
    return
  }
  legendAnchors.value = worldViewRef.value?.legendAnchors?.() ?? {}
  showLegend.value = true
}

/**
 * The menu is a way to the tools, not a place to be: choosing one closes
 * it. Deferred a tick so the overlay stack sees the close before the open
 * and does not treat the pair as a surface replacing itself.
 */
function fromTools(open) {
  showTools.value = false
  nextTick(open)
}

function onHomeClick() {
  showTrail.value = false
  showLaunch.value = true
}

function onTrailSelect(nodeId) {
  showTrail.value = false
  goToNode(nodeId)
}

function onShareClick() {
  if (article.value?.title) {
    shareArticle(article.value.title)
  }
}

// Every shortcut in the app is declared here, in one registry. The Field
// Guide renders this list rather than restating it, so a binding and its
// documentation cannot drift apart the way they had.
const { register } = useKeymap()

register({ keys: 'h', label: 'Hide the interface', group: 'View', run: toggleHideHud })
register({
  keys: 'l',
  label: 'What am I looking at?',
  group: 'View',
  enabled: () => Boolean(world.value),
  run: toggleLegend,
})
register({
  keys: 'escape',
  // Above the overlay stack's own Escape: a viewer cutting a transition
  // short means the transition, not whatever is behind it.
  priority: 2000,
  allowInField: true,
  enabled: () => travel.isTravelling.value,
  run: () => {
    travel.cancel()
    worldViewRef.value?.cancelDive?.()
  },
})
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

watch(
  () => preferences.chrome,
  (chrome) => {
    document.documentElement.dataset.chrome = chrome ?? 'translucent'
  },
  { immediate: true },
)

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
    if (state.nodeId && graph.value.realms[state.nodeId]) goToNode(state.nodeId)
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
    :style="{ '--citation-atmosphere': citationAtmosphere }"
  >
    <TopScrim
      v-if="!showHudHidden"
      :realm="article?.title"
      :trail-length="trailSize"
      :can-go-back="canGoBack"
      :can-go-forward="canGoForward"
      @back="goBack"
      @forward="goForward"
      @home="showLaunch = true"
      @trail="showTrail = true"
      @search="isSearchOpen = true"
      @tools="showTools = true"
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
      v-if="world && !showHudHidden && helmVisible"
      :lift="helmLift"
      :world-shape="preferences.worldShape"
      :disabled="worldStatus !== 'success'"
      :can-recenter="rendersInWebGL"
      @update:world-shape="setWorldShape"
      @recenter="recenterView"
      @legend="toggleLegend"
    />


    <!-- Everything that happens without being asked for, said out loud
         once. A world takes a visible moment to arrive and a spinner says
         nothing to a screen reader; announcing the ARRIVAL rather than the
         wait is what a sighted viewer gets from the world appearing. -->
    <p class="app__announce" role="status" aria-live="polite">{{ announcement }}</p>

    <p v-if="snapshotErrorMessage" class="app__alert app__alert--error hud hud--alert" role="alert">
      ⚠️ {{ snapshotErrorMessage }}
    </p>
    <p v-else-if="status === 'error'" class="app__alert app__alert--error hud hud--alert" role="alert">
      <Icon name="alert" :size="16" /> {{ errorMessage }}
    </p>
    <p v-else-if="worldStatus === 'error'" class="app__alert app__alert--error hud hud--alert" role="alert">
      <Icon name="alert" :size="16" /> {{ worldErrorMessage }}
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

    <PortalPreview
      :portal="portalPreview?.portal ?? null"
      :anchor="portalPreview?.anchor ?? null"
      @travel="confirmTravel"
      @dismiss="dismissPreview"
    />

    <!-- The static beat. generateWorld blocks for ~120ms on a laptop and
         more on a phone, so the work happens here, where a frozen frame and
         a held one look the same. Clicking cuts it short. -->
    <Transition name="wash">
      <div
        v-if="travel.isTravelling.value"
        class="app__wash"
        :class="`app__wash--${travel.phase.value}`"
        @click="onCancelTravel"
      >
        <p v-if="travel.target.value" class="app__wash-label">
          {{ travel.target.value.targetTitle }}
        </p>
      </div>
    </Transition>

    <Legend :show="showLegend" :anchors="legendAnchors" @close="showLegend = false" />

    <Launch
      v-if="!current || showLaunch"
      :dismissible="Boolean(current)"
      @select="onSelect"
      @guide="showInfoHub = true"
      @close="showLaunch = false"
    />

    <CommandPalette :show="isSearchOpen" @select="onSelect" @close="isSearchOpen = false" />

    <ToolsMenu
      :show="showTools"
      @search="fromTools(() => (isSearchOpen = true))"
      @guide="fromTools(() => (showInfoHub = true))"
      @settings="fromTools(() => (showSettings = true))"
      @close="showTools = false"
    />

    <TrailMenu
      :show="showTrail"
      :graph="graph"
      :can-share="Boolean(article)"
      @select="onTrailSelect"
      @home="onHomeClick"
      @share="onShareClick"
      @export="onExportClick"
      @import="onImportFile"
      @close="showTrail = false"
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
/* Announced, never shown: the visual equivalent is the world appearing. */
.app__announce {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  border: 0;
  clip-path: inset(50%);
  white-space: nowrap;
}

/* The wash: an opaque hold with the destination's name on it. Deliberately
   still — the world generation that runs behind it blocks the main thread,
   and a frozen frame is only invisible when nothing was moving. */
.app__wash {
  position: fixed;
  inset: 0;
  z-index: var(--z-overlays);
  display: grid;
  place-items: center;
  background: radial-gradient(
    ellipse at 50% 50%,
    rgba(var(--accent-rgb), 0.16) 0%,
    rgba(var(--surface-1-rgb), 0.97) 55%
  );
  cursor: pointer;
}

.app__wash-label {
  margin: 0;
  color: var(--accent-ink);
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  letter-spacing: var(--tracking-label);
  text-transform: uppercase;
}

/* Arriving fades in over the dive; leaving lifts off the new world. */
.wash-enter-active {
  transition: opacity var(--dur-2) var(--ease-out);
}

.wash-leave-active {
  transition: opacity var(--dur-3) var(--ease-out);
}

.wash-enter-from,
.wash-leave-to {
  opacity: 0;
}

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
  color: var(--ink-3);
  font-style: italic;
}

.hud {
  position: absolute;
  background: var(--surface-1);
  border: 1px solid var(--edge-hair);
  border-radius: var(--radius-lg);
  backdrop-filter: blur(10px);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  padding: var(--spacing-lg) var(--spacing-xl);
  z-index: 1;
  transition: opacity var(--dur-2) ease-out;
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
  color: var(--ink-3);
}

.app__status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.app__alert {
  padding: var(--spacing-md) var(--spacing-lg);
  border-radius: var(--radius-md);
  background: var(--danger-wash);
  color: var(--danger);
  border: 1px solid var(--danger-edge);
  font-weight: 600;
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
  color: var(--ink-1);
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
}</style>
