/**
 * Excluded section headings used when measuring article prose for terrain.
 *
 * English titles are always checked. Language-specific aliases cover the
 * MVP featured editions; other editions fall back to English matches only
 * until aliases are expanded (or siteinfo magic words are wired in).
 */
import { EXCLUDED_SECTION_TITLES } from '../../engine/generation/config.js'
import { normalizeLanguage } from '../i18n/wikipediaEditions.js'

/** @type {Record<string, string[]>} */
const ALIASES = {
  de: [
    'einzelnachweise',
    'weblinks',
    'siehe auch',
    'literatur',
    'anmerkungen',
    'belege',
    'quellen',
    'referenzen',
  ],
  fr: [
    'références',
    'liens externes',
    'voir aussi',
    'notes',
    'bibliographie',
    'notes et références',
    'annexes',
  ],
  es: [
    'referencias',
    'enlaces externos',
    'véase también',
    'notas',
    'bibliografía',
    'notas y referencias',
  ],
  he: ['הערות שוליים', 'קישורים חיצוניים', 'ראו גם', 'לקריאה נוספת', 'ביבליוגרפיה', 'הערות'],
  ar: ['مراجع', 'وصلات خارجية', 'انظر أيضًا', 'انظر ايضا', 'مصادر', 'مراجع ومصادر', 'روابط خارجية'],
  fa: ['منابع', 'پیوند به بیرون', 'جستارهای وابسته', 'پانویس', 'یادداشت‌ها', 'کتابشناسی'],
}

/**
 * @param {string} title
 * @param {string} [language]
 * @returns {boolean}
 */
export function isExcludedSectionTitle(title, language) {
  const normalized = title.trim().toLowerCase()
  if (!normalized) return false
  if (EXCLUDED_SECTION_TITLES.includes(normalized)) return true
  const aliases = ALIASES[normalizeLanguage(language)]
  return Boolean(aliases?.includes(normalized))
}
