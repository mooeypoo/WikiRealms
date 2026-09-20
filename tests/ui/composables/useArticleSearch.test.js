import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { useArticleSearch } from '../../../src/ui/composables/useArticleSearch.js'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useArticleSearch', () => {
  it('starts idle with no results', () => {
    const { query, results, status } = useArticleSearch({ searchFn: vi.fn() })

    expect(query.value).toBe('')
    expect(results.value).toEqual([])
    expect(status.value).toBe('idle')
  })

  it('debounces the search call while the user is typing', async () => {
    const searchFn = vi.fn().mockResolvedValue([{ title: 'Einstein', description: '', url: '' }])
    const { setQuery, status } = useArticleSearch({ searchFn, debounceMs: 200 })

    setQuery('E')
    setQuery('Ei')
    setQuery('Ein')

    expect(searchFn).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(200)

    expect(searchFn).toHaveBeenCalledTimes(1)
    expect(searchFn).toHaveBeenCalledWith('Ein', { language: 'en' })
    expect(status.value).toBe('success')
  })

  it('resets to idle when the query is cleared', async () => {
    const searchFn = vi.fn().mockResolvedValue([])
    const { setQuery, results, status } = useArticleSearch({ searchFn, debounceMs: 100 })

    setQuery('Ein')
    await vi.advanceTimersByTimeAsync(100)

    setQuery('')
    await vi.advanceTimersByTimeAsync(100)

    expect(status.value).toBe('idle')
    expect(results.value).toEqual([])
  })

  it('exposes an error message when the search rejects', async () => {
    const searchFn = vi.fn().mockRejectedValue(new Error('boom'))
    const { setQuery, status, errorMessage, results } = useArticleSearch({ searchFn, debounceMs: 50 })

    setQuery('Ein')
    await vi.advanceTimersByTimeAsync(50)

    expect(status.value).toBe('error')
    expect(errorMessage.value).toBe('boom')
    expect(results.value).toEqual([])
  })

  it('ignores stale responses when a newer search supersedes an older one', async () => {
    let resolveFirst
    const firstPromise = new Promise((resolve) => {
      resolveFirst = resolve
    })
    const searchFn = vi
      .fn()
      .mockImplementationOnce(() => firstPromise)
      .mockImplementationOnce(() => Promise.resolve([{ title: 'Second', description: '', url: '' }]))

    const { setQuery, results, status } = useArticleSearch({ searchFn, debounceMs: 10 })

    setQuery('First')
    await vi.advanceTimersByTimeAsync(10)

    setQuery('Second')
    await vi.advanceTimersByTimeAsync(10)

    // second search resolves first
    expect(status.value).toBe('success')
    expect(results.value).toEqual([{ title: 'Second', description: '', url: '' }])

    // stale first search resolves after
    resolveFirst([{ title: 'First', description: '', url: '' }])
    await Promise.resolve()
    await Promise.resolve()

    expect(results.value).toEqual([{ title: 'Second', description: '', url: '' }])
  })

  it('clear() cancels pending debounce and resets state', async () => {
    const searchFn = vi.fn().mockResolvedValue([{ title: 'Einstein', description: '', url: '' }])
    const { setQuery, clear, results, status, query } = useArticleSearch({ searchFn, debounceMs: 100 })

    setQuery('Ein')
    clear()
    await vi.advanceTimersByTimeAsync(200)

    expect(searchFn).not.toHaveBeenCalled()
    expect(query.value).toBe('')
    expect(results.value).toEqual([])
    expect(status.value).toBe('idle')
  })
})
