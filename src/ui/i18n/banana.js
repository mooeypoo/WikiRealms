/**
 * banana-i18n wiring for WikiRealms UI strings.
 *
 * Message files live in /i18n (one locale per file, plus qqq docs) so the
 * project can be registered on translatewiki.net later. English is always
 * loaded; other locales merge on demand and fall back through banana's
 * MediaWiki-style chains to English.
 */
import { computed, ref, shallowRef } from 'vue'
import Banana from 'banana-i18n'
import en from '../../../i18n/en.json'
import { DEFAULT_LANGUAGE, normalizeLanguage } from '../../core/i18n/wikipediaEditions.js'

const locale = ref(DEFAULT_LANGUAGE)
const banana = shallowRef(createBanana(DEFAULT_LANGUAGE))

/** Locale modules keyed for dynamic import (Vite needs static paths). */
const LOCALE_LOADERS = {
  en: () => Promise.resolve({ default: en }),
}

const loadedLocales = new Set(['en'])

function stripMetadata(messages) {
  const next = { ...messages }
  delete next['@metadata']
  return next
}

function createBanana(code) {
  return new Banana(normalizeLanguage(code), {
    messages: stripMetadata(en),
    finalFallback: 'en',
  })
}

/**
 * Translate a message key. Extra args are banana placeholders ($1, $2, …).
 * Reads `locale` so Vue templates re-render when the UI language changes.
 * @param {string} key
 * @param {...unknown} params
 */
export function t(key, ...params) {
  void locale.value
  return banana.value.i18n(key, ...params)
}

export function getUiLocale() {
  return locale.value
}

/**
 * Switch the UI message locale. Loads a message file when one exists;
 * otherwise banana falls back toward English.
 * @param {string} code
 */
export async function setUiLocale(code) {
  const next = normalizeLanguage(code)
  if (!loadedLocales.has(next) && LOCALE_LOADERS[next]) {
    const mod = await LOCALE_LOADERS[next]()
    banana.value.load(stripMetadata(mod.default), next)
    loadedLocales.add(next)
  }

  if (next !== locale.value) {
    banana.value.setLocale(next)
    locale.value = next
  }
}

/**
 * Vue binding: reactive `t` and the active UI locale.
 * UI locale should track the Wikipedia edition underfoot (or last searched).
 */
export function useI18n() {
  const uiLocale = computed(() => locale.value)
  return {
    t,
    uiLocale,
    setUiLocale,
  }
}
