/**
 * The Ledger's four states and the heights they take, shared with whatever
 * has to get out of their way.
 *
 * The helm sits in the same corner as the sheet on a phone, so it needs to
 * know how tall the sheet currently is. Keeping the numbers here rather
 * than inside the component means the two cannot disagree — and they did:
 * the helm was simply behind the sheet at every state, including collapsed.
 */
export const LEDGER_STATES = Object.freeze(['collapsed', 'peek', 'open', 'full'])

/** peek / open / full as fractions of the viewport. Collapsed sizes itself. */
export const LEDGER_SNAP_POINTS = Object.freeze([0.16, 0.42, 0.88])

/** Roughly what the collapsed bar occupies, including its safe-area padding. */
export const LEDGER_COLLAPSED_HEIGHT = 60

/**
 * How far something in the bottom-right must rise to clear the sheet.
 *
 * Above `peek` there is nowhere useful to rise to — the sheet is most of
 * the screen — so the caller hides instead, which `clearsLedger` decides.
 *
 * @param {'collapsed'|'peek'|'open'|'full'} state
 * @returns {string} a CSS length
 */
export function ledgerClearance(state) {
  if (state === 'collapsed') return `${LEDGER_COLLAPSED_HEIGHT}px`
  if (state === 'peek') return `calc(${LEDGER_SNAP_POINTS[0] * 100}dvh + 8px)`
  return '0px'
}

/** Whether a bottom-right control can still find room beside the sheet. */
export function clearsLedger(state) {
  return state === 'collapsed' || state === 'peek'
}
