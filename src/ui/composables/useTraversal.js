import { computed, ref } from 'vue'
import * as trail from '../../core/traversal/visitGraph.js'

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
  const currentNodeId = computed(() => graph.value.currentId)
  const backstack = computed(() => trail.backTitles(graph.value))
  const forwardstack = computed(() => trail.forwardTitles(graph.value))
  const canGoBack = computed(() => trail.canGoBack(graph.value))
  const canGoForward = computed(() => trail.canGoForward(graph.value))
  const path = computed(() => trail.pathToCurrent(graph.value))

  /** Arriving somewhere from where you are — portal travel. */
  function navigateTo(title) {
    graph.value = trail.visit(graph.value, title)
  }

  /** Starting somewhere unconnected — a search, a shared link, a random realm. */
  function jumpTo(title) {
    graph.value = trail.jump(graph.value, title)
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
   * Hydrates from a restored session. Accepts either a graph or the flat
   * history older snapshots stored.
   */
  function restore(state = {}) {
    graph.value = trail.isVisitGraph(state?.graph)
      ? state.graph
      : trail.fromLinearHistory(state)
  }

  return {
    graph,
    path,
    current,
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
    restore,
  }
}
