import { reactive, ref } from 'vue';

/**
 * Which surfaces are showing, and the persisted view preferences.
 *
 * Keyboard handling used to live here too, in a second window listener that
 * could not see App.vue's. Both are gone: bindings are declared through
 * useKeymap, and dismissal belongs to useOverlays.
 */
export const useUIState = () => {
  // ===== MODAL / PANEL STATE =====
  const showInfoHub = ref(false);
  const showSettings = ref(false);
  const currentInfoTab = ref('what-is-this'); // what-is-this, how-it-works, about, shortcuts

  // ===== PREFERENCES (synced to localStorage) =====
  const PREFERENCES_STORAGE_KEY = 'wikirealms:preferences';
  const preferences = reactive({
    // How the 3D view presents the world: 'sphere' (a planet you orbit) or
    // 'flat' (the same world as a map you fly over). Purely a rendering
    // choice — both views show the identical generated world, so
    // switching never regenerates terrain.
    worldShape: 'sphere',
    // How the world is drawn, as opposed to what shape it is: 'high' forces
    // WebGL, 'low' forces the 2D canvas fallback, 'auto' picks by capability.
    rendering: 'auto',
    // How much of the Ledger is showing. Null until the viewer chooses, so
    // the first visit can differ by screen size without overriding them.
    ledgerState: null,
    // The camera dive between worlds. Off is honoured absolutely; on is
    // still overridden by the system's reduced-motion preference.
    travelAnimation: true,
    // Marker layer toggles — each is an independent on/off.
    showSections: true,
    showPortals: true,
    showFoliage: true,
    panelOpacity: 0.9,
    autoHideHUD: false,
    firstVisitDone: false,
  });

  // ===== LOAD & SAVE PREFERENCES =====
  const loadPreferences = () => {
    try {
      const stored = localStorage.getItem(PREFERENCES_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Migrate legacy `showPeakFlags` string ('all' | 'main' | 'none')
        // into the new boolean showSections. 'none' → false, else true.
        if (parsed.showPeakFlags !== undefined && parsed.showSections === undefined) {
          parsed.showSections = parsed.showPeakFlags !== 'none';
          delete parsed.showPeakFlags;
        }
        // The citation-faerie layer is gone — citation density now reads
        // through the biome greenery instead. Drop the stored toggle so
        // it doesn't linger in the persisted preferences forever.
        delete parsed.showFaeries;
        // Guard against an unrecognized persisted view mode (a value from
        // a future build, or hand-edited storage) silently disabling the
        // 3D view — fall back to the flat map.
        if (parsed.worldShape !== 'flat' && parsed.worldShape !== 'sphere') delete parsed.worldShape;
        if (!['high', 'auto', 'low'].includes(parsed.rendering)) delete parsed.rendering;
        if (!['collapsed', 'peek', 'open', 'full'].includes(parsed.ledgerState)) delete parsed.ledgerState;
        if (typeof parsed.travelAnimation !== 'boolean') delete parsed.travelAnimation;
        Object.assign(preferences, parsed);
      }
    } catch (e) {
      console.warn('Failed to load preferences from localStorage:', e);
    }
  };

  const savePreferences = () => {
    try {
      localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
    } catch (e) {
      console.warn('Failed to save preferences to localStorage:', e);
    }
  };

  // Auto-save on any preference change (deep watch handled by caller or explicit calls)
  const updatePreferences = (updates) => {
    Object.assign(preferences, updates);
    savePreferences();
  };

  // ===== MODAL TOGGLES =====
  const toggleInfoHub = () => {
    showInfoHub.value = !showInfoHub.value;
  };

  const toggleSettings = () => {
    showSettings.value = !showSettings.value;
  };

  const setInfoTab = (tab) => {
    currentInfoTab.value = tab;
  };

  // Preferences load once, at module use; there is no listener to attach.
  loadPreferences();

  return {
    // Modals
    showInfoHub,
    showSettings,
    currentInfoTab,
    toggleInfoHub,
    toggleSettings,
    setInfoTab,

    // Preferences
    preferences,
    loadPreferences,
    savePreferences,
    updatePreferences,
  };
};
