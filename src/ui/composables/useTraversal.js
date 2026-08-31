import { computed, ref } from 'vue'

/**
 * Tracks the session's traversal history as a simple stack of article
 * titles (the identity we reload articles by). Decoupled from article
 * fetching/world generation — callers watch `current` and load whatever
 * it points to.
 *
 * Standard browser-style history semantics:
 * - navigating to a new title pushes the current title onto the
 *   backstack and discards the forward stack (a new branch invalidates
 *   the old "forward" path)
 * - going back/forward moves entries between the two stacks
 */
export function useTraversal() {
  const current = ref(null)
  const backstack = ref([])
  const forwardstack = ref([])

  const canGoBack = computed(() => backstack.value.length > 0)
  const canGoForward = computed(() => forwardstack.value.length > 0)

  function navigateTo(title) {
    if (!title || title === current.value) return

    if (current.value !== null) {
      backstack.value = [...backstack.value, current.value]
    }
    forwardstack.value = []
    current.value = title
  }

  function goBack() {
    if (!canGoBack.value) return

    const previous = backstack.value[backstack.value.length - 1]
    backstack.value = backstack.value.slice(0, -1)
    if (current.value !== null) {
      forwardstack.value = [current.value, ...forwardstack.value]
    }
    current.value = previous
  }

  function goForward() {
    if (!canGoForward.value) return

    const next = forwardstack.value[0]
    forwardstack.value = forwardstack.value.slice(1)
    if (current.value !== null) {
      backstack.value = [...backstack.value, current.value]
    }
    current.value = next
  }

  function reset() {
    current.value = null
    backstack.value = []
    forwardstack.value = []
  }

  return { current, backstack, forwardstack, canGoBack, canGoForward, navigateTo, goBack, goForward, reset }
}
