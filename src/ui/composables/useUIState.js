import { ref, computed, reactive, onMounted, onUnmounted } from 'vue';

/**
 * useUIState - Centralized UI state management
 * Manages: modals, panels, preferences, keyboard shortcuts, preferences persistence
 */
export const useUIState = () => {
  // ===== MODAL / PANEL STATE =====
  const showInfoHub = ref(false);
  const showSettings = ref(false);
  const currentInfoTab = ref('what-is-this'); // what-is-this, how-it-works, about, shortcuts

  // ===== PREFERENCES (synced to localStorage) =====
  const PREFERENCES_STORAGE_KEY = 'wikirealms:preferences';
  const preferences = reactive({
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

  const closeAllModals = () => {
    showInfoHub.value = false;
    showSettings.value = false;
  };

  const setInfoTab = (tab) => {
    currentInfoTab.value = tab;
  };

  // ===== KEYBOARD SHORTCUTS =====
  const handleKeyDown = (e) => {
    // Don't trigger shortcuts if typing in an input
    if (e.target.matches('input, textarea')) {
      return;
    }

    // Info Hub toggle: ? or i
    if (e.key === '?' || e.key === 'i') {
      e.preventDefault();
      toggleInfoHub();
    }

    // Settings toggle: s
    if (e.key === 's' || e.key === 'S') {
      e.preventDefault();
      toggleSettings();
    }

    // Close modals: Escape
    if (e.key === 'Escape') {
      e.preventDefault();
      closeAllModals();
    }
  };

  // ===== LIFECYCLE =====
  onMounted(() => {
    loadPreferences();
    window.addEventListener('keydown', handleKeyDown);
  });

  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeyDown);
  });

  return {
    // Modals
    showInfoHub,
    showSettings,
    currentInfoTab,
    toggleInfoHub,
    toggleSettings,
    closeAllModals,
    setInfoTab,

    // Preferences
    preferences,
    loadPreferences,
    savePreferences,
    updatePreferences,
  };
};
