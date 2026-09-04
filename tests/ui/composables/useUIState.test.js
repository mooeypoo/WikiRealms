import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useUIState } from '../../../src/ui/composables/useUIState.js'

const STORAGE_KEY = 'wikirealms:preferences'

describe('useUIState — preference migration', () => {
  beforeEach(() => {
    localStorage.clear()
  })
  afterEach(() => {
    localStorage.clear()
  })

  it('defaults to all three map-layer toggles enabled', () => {
    const { preferences } = useUIState()

    expect(preferences.showSections).toBe(true)
    expect(preferences.showPortals).toBe(true)
    expect(preferences.showFoliage).toBe(true)
    // The citation-faerie layer was removed; citation density now reads
    // through the biome greenery.
    expect(preferences.showFaeries).toBeUndefined()
  })

  it('drops a stored showFaeries toggle from the removed faerie layer', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ showSections: false, showFaeries: false, panelOpacity: 0.9 }),
    )
    const { preferences, loadPreferences } = useUIState()
    loadPreferences()

    expect(preferences.showFaeries).toBeUndefined()
    // Unrelated stored preferences still load.
    expect(preferences.showSections).toBe(false)
  })

  it('migrates legacy showPeakFlags="none" to showSections=false', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ showPortals: true, showPeakFlags: 'none', panelOpacity: 0.9 }),
    )
    const { preferences, loadPreferences } = useUIState()
    loadPreferences()

    expect(preferences.showSections).toBe(false)
    expect(preferences.showPeakFlags).toBeUndefined()
  })

  it('migrates legacy showPeakFlags="main" and "all" to showSections=true', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ showPeakFlags: 'main' }))
    const { preferences: pMain, loadPreferences: loadMain } = useUIState()
    loadMain()
    expect(pMain.showSections).toBe(true)

    localStorage.setItem(STORAGE_KEY, JSON.stringify({ showPeakFlags: 'all' }))
    const { preferences: pAll, loadPreferences: loadAll } = useUIState()
    loadAll()
    expect(pAll.showSections).toBe(true)
  })

  it('does not overwrite an explicit showSections if both fields are stored', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ showSections: false, showPeakFlags: 'main' }),
    )
    const { preferences, loadPreferences } = useUIState()
    loadPreferences()

    // The explicit boolean wins — no migration should overwrite it.
    expect(preferences.showSections).toBe(false)
  })

  it('savePreferences round-trips the new boolean layer toggles', () => {
    const { preferences, savePreferences, loadPreferences } = useUIState()
    Object.assign(preferences, { showSections: false, showFoliage: false })
    savePreferences()

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY))
    expect(stored.showSections).toBe(false)
    expect(stored.showFoliage).toBe(false)

    // Reset the in-memory values and reload from storage to prove
    // the persisted booleans come back correctly.
    Object.assign(preferences, { showSections: true, showFoliage: true })
    loadPreferences()
    expect(preferences.showSections).toBe(false)
    expect(preferences.showFoliage).toBe(false)
  })
})
