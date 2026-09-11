import { ref } from 'vue'
import { searchWikipediaTitles } from '../../adapters/wikipediaSearchAdapter.js'

/**
 * Reactive article search state backed by a search function (defaults to
 * the Wikipedia OpenSearch adapter). Debounces input changes before
 * triggering a search, and tracks loading/error status.
 *
 * @param {{
 *   searchFn?: typeof searchWikipediaTitles,
 *   debounceMs?: number,
 *   language?: string | (() => string),
 * }} [options]
 */
export function useArticleSearch({
  searchFn = searchWikipediaTitles,
  debounceMs = 250,
  language = 'en',
} = {}) {
  const query = ref('')
  const results = ref([])
  const status = ref('idle') // 'idle' | 'loading' | 'success' | 'error'
  const errorMessage = ref(null)

  let debounceTimer = null
  let requestToken = 0

  function resolveLanguage() {
    return typeof language === 'function' ? language() : language
  }

  async function runSearch(value) {
    const trimmed = value.trim()
    if (!trimmed) {
      status.value = 'idle'
      results.value = []
      errorMessage.value = null
      return
    }

    const token = ++requestToken
    status.value = 'loading'
    errorMessage.value = null

    try {
      const found = await searchFn(trimmed, { language: resolveLanguage() })
      if (token !== requestToken) return // a newer search superseded this one
      results.value = found
      status.value = 'success'
    } catch (error) {
      if (token !== requestToken) return
      results.value = []
      status.value = 'error'
      errorMessage.value = error?.message ?? 'Search failed'
    }
  }

  function setQuery(value) {
    query.value = value
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => runSearch(value), debounceMs)
  }

  function clear() {
    if (debounceTimer) clearTimeout(debounceTimer)
    query.value = ''
    results.value = []
    status.value = 'idle'
    errorMessage.value = null
  }

  return { query, results, status, errorMessage, setQuery, clear }
}
