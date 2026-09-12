import { beforeEach, describe, expect, it } from 'vitest'
import { getEdition } from '../../../src/core/i18n/wikipediaEditions.js'
import { bdiHtml, setUiLocale, t, tBdiHtml } from '../../../src/ui/i18n/banana.js'

describe('banana-i18n UI messages', () => {
  beforeEach(async () => {
    await setUiLocale('en')
  })

  it('resolves English chrome strings', () => {
    expect(t('wikirealms-app-name')).toBe('WikiRealms')
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

  it('loads Persian starter messages for featured RTL editions', async () => {
    await setUiLocale('fa')
    expect(t('wikirealms-settings-title')).toBe('تنظیمات')
    expect(t('wikirealms-share')).toBe('اشتراک‌گذاری')
    expect(t('wikirealms-scrim-search')).toBe('جستجو')
  })

  it('falls back to English for locales without a message file yet', async () => {
    await setUiLocale('de')
    expect(t('wikirealms-settings-title')).toBe('Settings')
    await setUiLocale('ar')
    expect(t('wikirealms-settings-title')).toBe('Settings')
  })

  it('wraps HTML fragments in bdi for mixed-direction safety', () => {
    expect(bdiHtml('Settings')).toBe('<bdi>Settings</bdi>')
    expect(bdiHtml('A <B>')).toBe('<bdi>A &lt;B&gt;</bdi>')
    expect(tBdiHtml('wikirealms-settings-title')).toBe('<bdi>Settings</bdi>')
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
