import { describe, expect, it } from 'vitest'
import { setUiLocale, t } from '../../../src/ui/i18n/banana.js'

describe('banana-i18n UI messages', () => {
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

  it('falls back to English for locales without a message file yet', async () => {
    await setUiLocale('he')
    expect(t('wikirealms-settings-title')).toBe('Settings')
    await setUiLocale('en')
  })
})
