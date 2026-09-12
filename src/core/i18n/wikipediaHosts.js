/**
 * Shared helpers for building MediaWiki URLs against a language Wikipedia.
 * Kept tiny and pure so adapters and core URL builders stay testable.
 */
import { wikipediaApiRoot, wikipediaRestRoot, normalizeLanguage } from '../i18n/wikipediaEditions.js'

/**
 * @param {string} [language]
 * @returns {string}
 */
export function actionApiEndpoint(language) {
  return wikipediaApiRoot(normalizeLanguage(language))
}

/**
 * @param {string} title
 * @param {string} [language]
 * @returns {string}
 */
export function sectionsRestUrl(title, language) {
  const normalized = title.trim().replace(/ /g, '_')
  return `${wikipediaRestRoot(normalizeLanguage(language))}/${encodeURIComponent(normalized)}/with_html`
}
