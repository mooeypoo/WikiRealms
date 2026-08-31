import { ref } from 'vue'
import { fetchWikipediaArticle } from '../../adapters/wikipediaArticleAdapter.js'

/**
 * Reactive article-loading state backed by a fetch function (defaults to
 * the Wikipedia article adapter). Tracks loading/error status and the
 * most recently loaded article.
 *
 * @param {{ fetchFn?: typeof fetchWikipediaArticle }} [options]
 */
export function useArticle({ fetchFn = fetchWikipediaArticle } = {}) {
  const article = ref(null)
  const status = ref('idle') // 'idle' | 'loading' | 'success' | 'error'
  const errorMessage = ref(null)

  let requestToken = 0

  async function loadArticle(title) {
    const token = ++requestToken
    status.value = 'loading'
    errorMessage.value = null

    try {
      const found = await fetchFn(title)
      if (token !== requestToken) return // a newer load superseded this one
      article.value = found
      status.value = 'success'
    } catch (error) {
      if (token !== requestToken) return
      article.value = null
      status.value = 'error'
      errorMessage.value = error?.message ?? 'Failed to load article'
    }
  }

  function clear() {
    requestToken++
    article.value = null
    status.value = 'idle'
    errorMessage.value = null
  }

  return { article, status, errorMessage, loadArticle, clear }
}
