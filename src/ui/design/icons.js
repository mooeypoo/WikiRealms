/**
 * The icon set: Lucide-style geometry (ISC), drawn on a 24px grid with a
 * single stroke weight, hand-copied rather than pulled in as a dependency
 * so the bundle carries exactly these and nothing else.
 *
 * This replaces the emoji the first-pass UI used as affordances. Emoji
 * cannot take `currentColor`, do not share an optical grid, and render
 * differently on every platform — which was the single loudest reason the
 * interface read as unfinished.
 *
 * Each entry is the inner markup of a 0 0 24 24 SVG. Stroke properties are
 * set by Icon.vue, so paths carry geometry only.
 */
export const ICONS = {
  search: '<circle cx="11" cy="11" r="7" /><path d="M20 20l-3.6-3.6" />',
  share:
    '<path d="M4 13v6a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-6" /><path d="M12 3.5v12" /><path d="M8 7.5l4-4 4 4" />',
  guide:
    '<path d="M12 6.5v13.5" /><path d="M3 4.5h6a3 3 0 0 1 3 3V20a2.4 2.4 0 0 0-2.4-2.2H3z" /><path d="M21 4.5h-6a3 3 0 0 0-3 3V20a2.4 2.4 0 0 1 2.4-2.2H21z" />',
  settings:
    '<path d="M4 8h9" /><path d="M18.5 8H20" /><path d="M4 16h3.5" /><path d="M13 16h7" /><circle cx="15.8" cy="8" r="2.2" /><circle cx="10.2" cy="16" r="2.2" />',
  globe:
    '<circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17" /><path d="M12 3.5a13 13 0 0 1 0 17" /><path d="M12 3.5a13 13 0 0 0 0 17" />',
  map: '<path d="M3 6.5l6-2 6 2 6-2v13l-6 2-6-2-6 2z" /><path d="M9 4.5v13" /><path d="M15 6.5v13" />',
  layers:
    '<path d="M12 3l9 5-9 5-9-5 9-5z" /><path d="M3 13l9 5 9-5" /><path d="M3 17.5l9 5 9-5" />',
  // A map key: swatch, label, three times over. Deliberately NOT a question
  // mark — "?" is bound to the About dialog, and an icon that looks like the
  // help key but does something else is a trap.
  legend:
    '<rect x="3.5" y="5" width="4.5" height="4.5" rx="1" /><path d="M11.5 7.25h9" /><rect x="3.5" y="9.75" width="4.5" height="4.5" rx="1" /><path d="M11.5 12h9" /><rect x="3.5" y="14.5" width="4.5" height="4.5" rx="1" /><path d="M11.5 16.75h9" />',
  crosshair:
    '<circle cx="12" cy="12" r="7.5" /><path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4" />',
  trail:
    '<circle cx="6" cy="5" r="2.4" /><circle cx="6" cy="19" r="2.4" /><circle cx="18" cy="12" r="2.4" /><path d="M6 7.4v9.2" /><path d="M8.4 5h4.6a2.6 2.6 0 0 1 2.6 2.6v2" />',
  eye: '<path d="M2 12s3.8-6.5 10-6.5S22 12 22 12s-3.8 6.5-10 6.5S2 12 2 12z" /><circle cx="12" cy="12" r="3" />',
  'eye-off':
    '<path d="M10.6 6.2A9.9 9.9 0 0 1 12 5.5c6.2 0 10 6.5 10 6.5a18 18 0 0 1-3.3 4" /><path d="M6.4 7.6A17.6 17.6 0 0 0 2 12s3.8 6.5 10 6.5a9.9 9.9 0 0 0 3.4-.6" /><path d="M3 3l18 18" />',
  download: '<path d="M12 3.5v12" /><path d="M8 11.5l4 4 4-4" /><path d="M4 19.5h16" />',
  upload: '<path d="M12 15.5v-12" /><path d="M8 7.5l4-4 4 4" /><path d="M4 19.5h16" />',
  external:
    '<path d="M15 4h5v5" /><path d="M10.5 13.5L20 4" /><path d="M19 14v4.5a1.5 1.5 0 0 1-1.5 1.5H5.5A1.5 1.5 0 0 1 4 18.5V6.5A1.5 1.5 0 0 1 5.5 5H10" />',
  close: '<path d="M6 6l12 12" /><path d="M18 6L6 18" />',
  alert:
    '<path d="M12 4.5L21 20H3z" /><path d="M12 10v4.5" /><circle cx="12" cy="17.2" r="0.9" fill="currentColor" stroke="none" />',
  'chevron-up': '<path d="M6 15l6-6 6 6" />',
  'chevron-down': '<path d="M6 9l6 6 6-6" />',
  'chevron-left': '<path d="M15 6l-6 6 6 6" />',
  'chevron-right': '<path d="M9 6l6 6-6 6" />',
  more: '<circle cx="5.5" cy="12" r="1.5" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" /><circle cx="18.5" cy="12" r="1.5" fill="currentColor" stroke="none" />',
  // The wordmark's glyph. A portal seen edge-on: the app's one piece of
  // identity, so it lives with the icons rather than as a stray asset.
  mark: '<path d="M12 2.5L20 12l-8 9.5L4 12z" /><circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none" />',
  // Ledger readouts: map vocabulary, not generic chrome.
  peaks: '<path d="M2.5 19.5L8.5 7l3.2 5.2L15 5.5l6.5 14z" /><path d="M2.5 19.5h19" />',
  tree: '<path d="M12 21v-6" /><path d="M12 15c-3.2 0-5.5-2-5.5-4.6C6.5 7.8 9 5.5 12 3.5c3 2 5.5 4.3 5.5 6.9C17.5 13 15.2 15 12 15z" /><path d="M8.2 12.2c-1.4.6-2.2 1.6-2.2 2.9 0 1.7 1.8 3 4 3h4c2.2 0 4-1.3 4-3 0-1.3-.8-2.3-2.2-2.9" />',
  prose: '<path d="M5 7h14" /><path d="M5 12h11" /><path d="M5 17h8" />',
  // Ocean fauna / pageviews — a simple side-on fish, not the old land blob.
  fish: '<path d="M3.5 12c2.2-4.2 5.6-6.2 9.2-6.2 4.6 0 6.6 2.6 8.8 6.2-2.2 3.6-4.2 6.2-8.8 6.2-3.6 0-7-2-9.2-6.2z" /><circle cx="8.2" cy="11.2" r="0.85" fill="currentColor" stroke="none" /><path d="M16.8 12l3.7-3.2v6.4z" />',
}

export const ICON_NAMES = Object.keys(ICONS)
