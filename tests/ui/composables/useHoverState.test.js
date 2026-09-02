import { describe, expect, it, vi } from 'vitest'
import { useHoverState } from '../../../src/ui/composables/useHoverState.js'

// Injectable synchronous timer factory so tests don't depend on real setTimeout.
function makeFakeTimer() {
  const callbacks = new Map()
  let nextId = 1
  return {
    setTimeout(fn) {
      const id = nextId++
      callbacks.set(id, fn)
      return id
    },
    clearTimeout(id) {
      callbacks.delete(id)
    },
    flush() {
      for (const fn of callbacks.values()) fn()
      callbacks.clear()
    },
    pendingCount() {
      return callbacks.size
    },
  }
}

describe('useHoverState', () => {
  it('starts with no section hovered', () => {
    const { sectionIndex, source, isHovered } = useHoverState()

    expect(sectionIndex.value).toBeNull()
    expect(source.value).toBeNull()
    expect(isHovered.value).toBe(false)
  })

  it('setHovered updates both sectionIndex and source', () => {
    const { sectionIndex, source, isHovered, setHovered } = useHoverState()

    setHovered(3, 'terrain')

    expect(sectionIndex.value).toBe(3)
    expect(source.value).toBe('terrain')
    expect(isHovered.value).toBe(true)
  })

  it('setHovered with the same index refreshes source without flicker', () => {
    const { source, setHovered } = useHoverState()

    setHovered(3, 'terrain')
    setHovered(3, 'label')

    expect(source.value).toBe('label')
  })

  it('clearNow immediately resets both fields', () => {
    const { sectionIndex, source, setHovered, clearNow } = useHoverState()

    setHovered(1, 'terrain')
    clearNow()

    expect(sectionIndex.value).toBeNull()
    expect(source.value).toBeNull()
  })

  it('clear() schedules a debounced clear that fires after the delay', () => {
    const timer = makeFakeTimer()
    const { sectionIndex, setHovered, clear } = useHoverState({ debounceMs: 200, timerFactory: timer })

    setHovered(2, 'terrain')
    clear()

    // Not cleared yet — debounce is pending.
    expect(sectionIndex.value).toBe(2)
    expect(timer.pendingCount()).toBe(1)

    timer.flush()
    expect(sectionIndex.value).toBeNull()
  })

  it('setHovered cancels a pending debounced clear', () => {
    const timer = makeFakeTimer()
    const { sectionIndex, setHovered, clear } = useHoverState({ debounceMs: 200, timerFactory: timer })

    setHovered(2, 'terrain')
    clear()
    setHovered(5, 'label')

    expect(timer.pendingCount()).toBe(0)
    timer.flush() // should be a no-op since setHovered cleared the pending timer

    expect(sectionIndex.value).toBe(5)
  })

  it('calling clear() twice does not stack multiple pending timers', () => {
    const timer = makeFakeTimer()
    const { setHovered, clear } = useHoverState({ debounceMs: 200, timerFactory: timer })

    setHovered(2, 'terrain')
    clear()
    clear()

    expect(timer.pendingCount()).toBe(1)
  })

  it('uses globalThis.setTimeout by default when no timerFactory is injected', () => {
    vi.useFakeTimers()
    try {
      const { sectionIndex, setHovered, clear } = useHoverState({ debounceMs: 50 })

      setHovered(7, 'terrain')
      clear()
      expect(sectionIndex.value).toBe(7)

      vi.advanceTimersByTime(50)
      expect(sectionIndex.value).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})
