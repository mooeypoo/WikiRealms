/**
 * Wikipedia language editions: the seeded catalog and helpers.
 *
 * The JSON lists every open content Wikipedia. The MVP picker may show only
 * `featured` ones by default; callers that need the full set use
 * `listEditions({ featuredOnly: false })`.
 */
import catalog from './wikipediaEditions.catalog.js'

export const DEFAULT_LANGUAGE = 'en'

/** @typedef {'latin-punct' | 'unicode-punct' | 'char-estimate'} SentenceModel */
/** @typedef {'full' | 'relative' | 'experimental'} LushnessSupport */

/**
 * @typedef {object} WikipediaEdition
 * @property {string} code
 * @property {string} bcp47
 * @property {string} name
 * @property {string} autonym
 * @property {'ltr' | 'rtl'} dir
 * @property {string[]} fallbacks
 * @property {string} sitename
 * @property {string} url
 * @property {string} dbname
 * @property {SentenceModel} sentenceModel
 * @property {LushnessSupport} lushnessSupport
 * @property {boolean} featured
 */

/** @type {Map<string, WikipediaEdition>} */
const byCode = new Map(catalog.editions.map((edition) => [edition.code, edition]))

/**
 * @param {string | null | undefined} code
 * @returns {boolean}
 */
export function isKnownEdition(code) {
  return typeof code === 'string' && byCode.has(code)
}

/**
 * @param {string | null | undefined} code
 * @returns {WikipediaEdition}
 */
export function getEdition(code) {
  if (isKnownEdition(code)) return byCode.get(code)
  return byCode.get(DEFAULT_LANGUAGE)
}

/**
 * @param {string | null | undefined} code
 * @returns {string}
 */
export function normalizeLanguage(code) {
  if (isKnownEdition(code)) return code
  return DEFAULT_LANGUAGE
}

/**
 * @param {{ featuredOnly?: boolean }} [options]
 * @returns {WikipediaEdition[]}
 */
export function listEditions({ featuredOnly = false } = {}) {
  const editions = catalog.editions
  if (!featuredOnly) return editions.slice()
  return editions.filter((edition) => edition.featured)
}

/**
 * Action / OpenSearch API root for a language Wikipedia.
 * @param {string} [language]
 */
export function wikipediaApiRoot(language = DEFAULT_LANGUAGE) {
  const code = normalizeLanguage(language)
  return `https://${code}.wikipedia.org/w/api.php`
}

/**
 * MediaWiki core REST base for a language Wikipedia (no trailing slash).
 * @param {string} [language]
 */
export function wikipediaRestRoot(language = DEFAULT_LANGUAGE) {
  const code = normalizeLanguage(language)
  return `https://${code}.wikipedia.org/w/rest.php/v1/page`
}

/**
 * Cache / map key for an article within an edition.
 * @param {string} language
 * @param {string} title
 */
export function articleCacheKey(language, title) {
  return `${normalizeLanguage(language)}:${title}`
}

/**
 * Language code for badges and pickers. Always Latin (EN, HE, DE) —
 * never a translation string, never an autonym.
 * @param {string} [code]
 */
export function editionCodeLabel(code) {
  return normalizeLanguage(code).toUpperCase()
}

/**
 * Full language name in the UI locale (English, Hebrew, Deutsch…).
 * Codes stay on `editionCodeLabel`; this is the part that may translate.
 * Falls back to the catalog's English name when Intl has no data.
 * @param {string} code Wikipedia edition code
 * @param {string} [uiLocale] UI / banana locale
 */
export function displayLanguageName(code, uiLocale = DEFAULT_LANGUAGE) {
  const edition = getEdition(code)
  const localeTag = getEdition(uiLocale).bcp47 || normalizeLanguage(uiLocale)
  try {
    const name = new Intl.DisplayNames([localeTag], { type: 'language' }).of(
      edition.bcp47 || edition.code,
    )
    if (name && name.toLowerCase() !== (edition.bcp47 || edition.code).toLowerCase()) {
      return name
    }
  } catch {
    // Intl.DisplayNames missing or locale unknown — use the catalog.
  }
  return edition.name
}

/**
 * One line for a language <option>: Latin code, then the translated name.
 * @param {string} code
 * @param {string} [uiLocale]
 */
export function formatEditionOption(code, uiLocale = DEFAULT_LANGUAGE) {
  return `${editionCodeLabel(code)} · ${displayLanguageName(code, uiLocale)}`
}

export function catalogMeta() {
  return {
    generatedAt: catalog.generatedAt,
    editionCount: catalog.editions.length,
  }
}
