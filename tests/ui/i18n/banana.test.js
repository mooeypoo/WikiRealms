import { beforeEach, describe, expect, it } from 'vitest'
import de from '../../../i18n/de.json'
import en from '../../../i18n/en.json'
import es from '../../../i18n/es.json'
import fa from '../../../i18n/fa.json'
import fr from '../../../i18n/fr.json'
import he from '../../../i18n/he.json'
import { APP_NAME } from '../../../src/appInfo.js'
import { getEdition } from '../../../src/core/i18n/wikipediaEditions.js'
import { bdiHtml, setUiLocale, t, tBdiHtml } from '../../../src/ui/i18n/banana.js'

const LOCALES = { en, de, es, fa, fr, he }

describe('banana-i18n UI messages', () => {
  beforeEach(async () => {
    await setUiLocale('en')
  })

  it('resolves English chrome strings', () => {
    expect(APP_NAME).toBe('WikiRealms')
    expect(t('wikirealms-search-placeholder', 'German')).toBe('Search German Wikipedia')
    expect(t('wikirealms-scrim-trail-aria', 1)).toBe(
      'Your trail, 1 realm — path kept and shareable',
    )
    expect(t('wikirealms-scrim-trail-aria', 3)).toBe(
      'Your trail, 3 realms — path kept and shareable',
    )
  })

  it('loads Hebrew starter messages for featured RTL editions', async () => {
    await setUiLocale('he')
    expect(t('wikirealms-settings-title')).toBe('הגדרות')
    expect(t('wikirealms-scrim-search')).toBe('חיפוש')
    expect(t('wikirealms-legend-short')).toBe('מקרא')
    expect(t('wikirealms-search-placeholder', 'עברית')).toContain('עברית')
  })

  it('translates section and portal popup pills in Hebrew', async () => {
    await setUiLocale('he')
    expect(t('wikirealms-stat-words', '1', 1)).toBe('1 מילה')
    expect(t('wikirealms-stat-words', '1,200', 1200)).toBe('1,200 מילים')
    expect(t('wikirealms-stat-sources', 46, 38)).toBe('46 הפניות ב־38 משפטים')
    expect(t('wikirealms-stat-no-refs-in-sentences', 7)).toBe('ללא הפניות ב־7 משפטים')
    expect(t('wikirealms-stat-subsections', 3)).toBe('3 תת־פרקים')
    expect(t('wikirealms-stat-portals-leave', 1)).toBe('1 שער יוצא מכאן')
    expect(t('wikirealms-band-wooded')).toBe('מיוער')
    expect(t('wikirealms-portal-to')).toBe('שער אל')
    expect(t('wikirealms-portal-travel')).toBe('עברו')
    expect(t('wikirealms-portal-stay')).toBe('הישארו')
  })

  it('translates Field Guide long prose in Hebrew', async () => {
    await setUiLocale('he')
    expect(t('wikirealms-info-start-lead')).toContain('WikiRealms')
    expect(t('wikirealms-info-start-peaks')).toContain('פסגות')
    expect(t('wikirealms-info-how-summary')).toBe('איך נבנה עולם')
    expect(t('wikirealms-info-about-credits')).toBe('קרדיטים')
    expect(t('wikirealms-info-shortcuts-lead')).toContain('קיצור')
  })

  it('loads Persian starter messages for featured RTL editions', async () => {
    await setUiLocale('fa')
    expect(t('wikirealms-settings-title')).toBe('تنظیمات')
    expect(t('wikirealms-share')).toBe('اشتراک‌گذاری')
    expect(t('wikirealms-scrim-search')).toBe('جستجو')
  })

  it('loads German, French, and Spanish starter packs for featured LTR editions', async () => {
    await setUiLocale('de')
    expect(t('wikirealms-settings-title')).toBe('Einstellungen')
    expect(t('wikirealms-scrim-search')).toBe('Suche')
    expect(t('wikirealms-share')).toBe('Teilen')

    await setUiLocale('fr')
    expect(t('wikirealms-settings-title')).toBe('Paramètres')
    expect(t('wikirealms-scrim-search')).toBe('Recherche')
    expect(t('wikirealms-share')).toBe('Partager')

    await setUiLocale('es')
    expect(t('wikirealms-settings-title')).toBe('Ajustes')
    expect(t('wikirealms-scrim-search')).toBe('Buscar')
    expect(t('wikirealms-share')).toBe('Compartir')
  })

  it('falls back to English for locales without a message file yet', async () => {
    await setUiLocale('ar')
    expect(t('wikirealms-settings-title')).toBe('Settings')
    await setUiLocale('ja')
    expect(t('wikirealms-settings-title')).toBe('Settings')
  })

  it('wraps HTML fragments in bdi for mixed-direction safety', () => {
    expect(bdiHtml('Settings')).toBe('<bdi>Settings</bdi>')
    expect(bdiHtml('A <B>')).toBe('<bdi>A &lt;B&gt;</bdi>')
    expect(tBdiHtml('wikirealms-settings-title')).toBe('<bdi>Settings</bdi>')
  })

  it('does not expose author site or asset names as translation keys', () => {
    expect(en).not.toHaveProperty('wikirealms-info-about-site')
    expect(en).not.toHaveProperty('wikirealms-info-about-fish-pack')
    expect(en).not.toHaveProperty('wikirealms-info-about-quaternius')
    expect(en).not.toHaveProperty('wikirealms-info-about-town-kit')
    expect(en).not.toHaveProperty('wikirealms-info-about-kenney')
  })

  it('keeps wordmarks, badges, author names, license codes, and keys out of messages', () => {
    const locked = /Moriel Schottlender|מוריאל|موریل|<kbd>L<\/kbd>|\(CC0\)/
    for (const [code, messages] of Object.entries(LOCALES)) {
      expect(messages, code).not.toHaveProperty('wikirealms-app-name')
      expect(messages, code).not.toHaveProperty('wikirealms-launch-edition-badge')
      expect(messages['wikirealms-info-about-by'], code).toContain('$1')
      expect(messages['wikirealms-info-about-credits-body'], code).toContain('$5')
      expect(messages['wikirealms-legend-dismiss-desktop'], code).toContain('$1')
      expect(messages['wikirealms-info-start-callout'], code).toContain('$1')
      expect(messages['wikirealms-search-hint'], code).toContain('$1')
      expect(JSON.stringify(messages), code).not.toMatch(locked)
    }
  })
})

describe('document direction from Wikipedia editions', () => {
  it('marks Hebrew and Persian as RTL for the document dir attribute', () => {
    expect(getEdition('he').dir).toBe('rtl')
    expect(getEdition('fa').dir).toBe('rtl')
    expect(getEdition('ar').dir).toBe('rtl')
    expect(getEdition('en').dir).toBe('ltr')
    expect(getEdition('de').dir).toBe('ltr')
  })
})
