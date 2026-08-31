import { describe, expect, it, vi } from 'vitest'
import { useArticle } from '../../../src/ui/composables/useArticle.js'

describe('useArticle', () => {
  it('starts idle with no article', () => {
    const { article, status } = useArticle({ fetchFn: vi.fn() })

    expect(article.value).toBeNull()
    expect(status.value).toBe('idle')
  })

  it('loads an article successfully', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ title: 'Einstein' })
    const { article, status, loadArticle } = useArticle({ fetchFn })

    await loadArticle('Einstein')

    expect(fetchFn).toHaveBeenCalledWith('Einstein')
    expect(status.value).toBe('success')
    expect(article.value).toEqual({ title: 'Einstein' })
  })

  it('exposes an error message when the fetch rejects', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('boom'))
    const { article, status, errorMessage, loadArticle } = useArticle({ fetchFn })

    await loadArticle('Einstein')

    expect(status.value).toBe('error')
    expect(errorMessage.value).toBe('boom')
    expect(article.value).toBeNull()
  })

  it('ignores a stale response when a newer load supersedes an older one', async () => {
    let resolveFirst
    const firstPromise = new Promise((resolve) => {
      resolveFirst = resolve
    })
    const fetchFn = vi
      .fn()
      .mockImplementationOnce(() => firstPromise)
      .mockImplementationOnce(() => Promise.resolve({ title: 'Second' }))

    const { article, status, loadArticle } = useArticle({ fetchFn })

    const firstLoad = loadArticle('First')
    const secondLoad = loadArticle('Second')

    await secondLoad
    expect(status.value).toBe('success')
    expect(article.value).toEqual({ title: 'Second' })

    resolveFirst({ title: 'First' })
    await firstLoad

    expect(article.value).toEqual({ title: 'Second' })
  })

  it('clear() resets state', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ title: 'Einstein' })
    const { article, status, loadArticle, clear } = useArticle({ fetchFn })

    await loadArticle('Einstein')
    clear()

    expect(article.value).toBeNull()
    expect(status.value).toBe('idle')
  })
})
