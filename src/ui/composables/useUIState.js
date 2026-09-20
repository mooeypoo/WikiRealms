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
  const currentInfoTab = ref('start-here'); // start-here, journey, how-worlds, about, shortcuts

  // ===== PREFERENCES (synced to localStorage) =====
  const PREFERENCES_STORAGE_KEY = 'wikirealms:preferences';
  const preferences = reactive({
    // Last Wikipedia edition the viewer *arrived* in via search or a shared
    // link — the default for the next search field only. Never use this to
    // reinterpret an existing realm title or URL pair; language rides with
    // the article (trail node / ?realm=&lang=).
    language: 'en',
    // When false, the language picker lists featured editions only.
    showAllWikipedias: false,
    // How the 3D view presents the world: 'flat' (a map you fly over) or
    // 'sphere' (a planet you orbit). Purely a rendering choice — both
    // views show the identical generated world, so switching never
    // regenerates terrain.
    //
    // Flat is the default. The planet held it for a while and reads
    // better as an arrival, but it can only ever show half a world at
    // once: every section on the far side is behind the horizon, and the
    // ground detail that carries the article — which section cites well,
    // where the trees thin out — is spread over all of it. The map shows
    // the whole article at once.
    worldShape: 'flat',
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
    // solid | translucent | minimal. Replaces panelOpacity, which dimmed
    // text along with the panel and could be dragged below legibility.
    chrome: 'translucent',
    autoHideHUD: false,
    firstVisitDone: false,
    /** First-session Legend tip has been seen or dismissed. */
    legendHintSeen: false,
    /** Phone peek tip (pull up for sections) has been seen or dismissed. */
    ledgerPeekHintSeen: false,
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
        if (typeof parsed.language === 'string') {
          // Unknown codes fall back at use-sites via normalizeLanguage;
          // keep the string so a later catalog refresh can revive it.
        } else {
          delete parsed.language;
        }
        if (typeof parsed.showAllWikipedias !== 'boolean') delete parsed.showAllWikipedias;
        if (!['high', 'auto', 'low'].includes(parsed.rendering)) delete parsed.rendering;
        if (!['collapsed', 'peek', 'open', 'full'].includes(parsed.ledgerState)) delete parsed.ledgerState;
        if (typeof parsed.travelAnimation !== 'boolean') delete parsed.travelAnimation;
        if (!['solid', 'translucent', 'minimal'].includes(parsed.chrome)) delete parsed.chrome;
        // The old opacity slider is gone; a stored value must not linger.
        delete parsed.panelOpacity;
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
