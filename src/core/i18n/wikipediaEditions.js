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

export function catalogMeta() {
  return {
    generatedAt: catalog.generatedAt,
    editionCount: catalog.editions.length,
  }
}
