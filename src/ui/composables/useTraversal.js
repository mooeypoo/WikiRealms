import { computed, ref } from 'vue'
import * as trail from '../../core/traversal/visitGraph.js'
import { DEFAULT_LANGUAGE } from '../../core/i18n/wikipediaEditions.js'

/**
 * Vue-reactive adapter over the visit graph.
 *
 * The traversal SEMANTICS moved to core/traversal/visitGraph.js: they are
 * article-graph domain logic, which docs/architecture.md keeps out of the
 * presentation layer, and they are far easier to reason about as pure
 * functions than as a composable holding refs. What is left here is the
 * binding — a ref, and the projections the UI reads.
 *
 * `backstack` and `forwardstack` are kept as flat title lists so the rest of
 * the app can carry on speaking in those terms while the tree does the
 * remembering underneath.
 */
export function useTraversal() {
  const graph = ref(trail.createVisitGraph())

  const current = computed(() => trail.currentTitle(graph.value))
  const currentLanguage = computed(() => trail.currentLanguage(graph.value))
  const currentNodeId = computed(() => trail.currentId(graph.value))
  const backstack = computed(() => trail.backTitles(graph.value))
  const forwardstack = computed(() => trail.forwardTitles(graph.value))
  const canGoBack = computed(() => trail.canGoBack(graph.value))
  const canGoForward = computed(() => trail.canGoForward(graph.value))

  /** Arriving somewhere from where you are — portal travel. */
  function navigateTo(title, { language } = {}) {
    graph.value = trail.visit(graph.value, title, {
      language: language ?? trail.currentLanguage(graph.value) ?? DEFAULT_LANGUAGE,
    })
  }

  /** Starting somewhere unconnected — a search, a shared link, a random realm. */
  function jumpTo(title, { language } = {}) {
    graph.value = trail.jump(graph.value, title, {
      language: language ?? trail.currentLanguage(graph.value) ?? DEFAULT_LANGUAGE,
    })
  }

  /** Returning to a node already in the journey, without rewriting it. */
  function goToNode(nodeId) {
    graph.value = trail.goTo(graph.value, nodeId)
  }

  function goBack() {
    graph.value = trail.goBack(graph.value)
  }

  function goForward() {
    graph.value = trail.goForward(graph.value)
  }

  function reset() {
    graph.value = trail.createVisitGraph()
  }

  /**
   * Drop the map of where you have been, but stay standing where you are.
   * A full reset would unload the realm underfoot for a tick; this keeps
   * the current title as a fresh search-jump with no edges behind it.
   */
  function clearTrail() {
    const title = current.value
    const language = currentLanguage.value ?? DEFAULT_LANGUAGE
    graph.value = title
      ? trail.jump(trail.createVisitGraph(), title, { language })
      : trail.createVisitGraph()
  }

  /**
   * Hydrates from a restored session. Accepts either a graph or the flat
   * history older snapshots stored.
   */
  function restore(state = {}) {
    if (trail.isVisitGraph(state?.graph)) graph.value = state.graph
    else if (state?.graph?.nodes) graph.value = trail.fromVisitTree(state.graph)
    else graph.value = trail.fromLinearHistory(state)
  }

  return {
    graph,
    current,
    currentLanguage,
    currentNodeId,
    backstack,
    forwardstack,
    canGoBack,
    canGoForward,
    navigateTo,
    jumpTo,
    goToNode,
    goBack,
    goForward,
    reset,
    clearTrail,
    restore,
  }
}
