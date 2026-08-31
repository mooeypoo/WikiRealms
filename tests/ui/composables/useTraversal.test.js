import { describe, expect, it } from 'vitest'
import { useTraversal } from '../../../src/ui/composables/useTraversal.js'

describe('useTraversal', () => {
  it('starts with no current article and empty stacks', () => {
    const { current, backstack, forwardstack, canGoBack, canGoForward } = useTraversal()

    expect(current.value).toBeNull()
    expect(backstack.value).toEqual([])
    expect(forwardstack.value).toEqual([])
    expect(canGoBack.value).toBe(false)
    expect(canGoForward.value).toBe(false)
  })

  it('sets current on the first navigation without touching the backstack', () => {
    const { current, backstack, navigateTo } = useTraversal()

    navigateTo('A')

    expect(current.value).toBe('A')
    expect(backstack.value).toEqual([])
  })

  it('pushes the previous article onto the backstack on subsequent navigation', () => {
    const { current, backstack, navigateTo } = useTraversal()

    navigateTo('A')
    navigateTo('B')
    navigateTo('C')

    expect(current.value).toBe('C')
    expect(backstack.value).toEqual(['A', 'B'])
  })

  it('ignores navigating to the same title already current', () => {
    const { current, backstack, navigateTo } = useTraversal()

    navigateTo('A')
    navigateTo('A')

    expect(current.value).toBe('A')
    expect(backstack.value).toEqual([])
  })

  it('goBack moves the current article onto the forward stack and restores the previous one', () => {
    const { current, backstack, forwardstack, goBack, navigateTo } = useTraversal()

    navigateTo('A')
    navigateTo('B')
    goBack()

    expect(current.value).toBe('A')
    expect(backstack.value).toEqual([])
    expect(forwardstack.value).toEqual(['B'])
  })

  it('goBack is a no-op when there is nothing to go back to', () => {
    const { current, backstack, forwardstack, canGoBack, goBack, navigateTo } = useTraversal()

    navigateTo('A')
    goBack()

    expect(canGoBack.value).toBe(false)
    expect(current.value).toBe('A')
    expect(backstack.value).toEqual([])
    expect(forwardstack.value).toEqual([])
  })

  it('goForward restores an article previously moved back from', () => {
    const { current, backstack, forwardstack, goBack, goForward, navigateTo } = useTraversal()

    navigateTo('A')
    navigateTo('B')
    goBack()
    goForward()

    expect(current.value).toBe('B')
    expect(backstack.value).toEqual(['A'])
    expect(forwardstack.value).toEqual([])
  })

  it('goForward is a no-op when there is nothing to go forward to', () => {
    const { current, forwardstack, canGoForward, goForward, navigateTo } = useTraversal()

    navigateTo('A')
    goForward()

    expect(canGoForward.value).toBe(false)
    expect(current.value).toBe('A')
    expect(forwardstack.value).toEqual([])
  })

  it('navigating to a new article after going back discards the forward stack', () => {
    const { current, backstack, forwardstack, goBack, navigateTo } = useTraversal()

    navigateTo('A')
    navigateTo('B')
    navigateTo('C')
    goBack() // current: B, forward: [C]
    navigateTo('D') // new branch

    expect(current.value).toBe('D')
    expect(backstack.value).toEqual(['A', 'B'])
    expect(forwardstack.value).toEqual([])
  })

  it('supports returning to an earlier article via history even without an explicit backlink', () => {
    // Simulates: A links to B (portal), but B has no portal back to A.
    // Traversal history (not portal duplication) is what lets the user return.
    const { current, navigateTo, goBack } = useTraversal()

    navigateTo('Article A')
    navigateTo('Article B') // via an outbound-only portal from A

    goBack()

    expect(current.value).toBe('Article A')
  })

  it('reset() clears all state', () => {
    const { current, backstack, forwardstack, navigateTo, goBack, reset } = useTraversal()

    navigateTo('A')
    navigateTo('B')
    goBack()
    reset()

    expect(current.value).toBeNull()
    expect(backstack.value).toEqual([])
    expect(forwardstack.value).toEqual([])
  })
})
