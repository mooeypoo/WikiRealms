/**
 * How far the Ledger scrolls a selected section into view.
 *
 * Centering the citation callout overshot the section head — especially in
 * the shorter `open` sheet and on mobile. Align the section row near the
 * top of the scrollport instead; padding is tuned per Ledger rung and
 * viewport so the head stays readable while the detail / CTA still fits
 * underneath when there is room.
 */

/**
 * @typedef {'collapsed' | 'peek' | 'open' | 'full'} LedgerState
 * @typedef {{ top: number, bottom: number }} LedgerScrollPadding
 */

/**
 * Padding inside the scrollport, in CSS pixels.
 *
 * Tighter on short / narrow viewports and on the mid `open` rung, where
 * the body is shallow and a generous top inset would waste the viewport.
 *
 * @param {LedgerState} state
 * @param {{ narrow?: boolean, short?: boolean }} [viewport]
 * @returns {LedgerScrollPadding}
 */
export function ledgerSelectionPadding(state, viewport = {}) {
  const cramped = Boolean(viewport.narrow || viewport.short)

  if (state === 'full') {
    return cramped ? { top: 10, bottom: 14 } : { top: 16, bottom: 20 }
  }
  if (state === 'open') {
    return cramped ? { top: 8, bottom: 12 } : { top: 12, bottom: 16 }
  }
  // peek / collapsed — rare for selection (we promote to open first)
  return { top: 8, bottom: 10 }
}

/**
 * ScrollTop that parks the section head just below `paddingTop`.
 *
 * When the opened detail + CTA are shorter than the scrollport under that
 * head, they remain visible. When they are taller, the head stays put —
 * better than centering the callout and shoving the title away.
 *
 * @param {{
 *   rangeTop: number,
 *   paddingTop?: number,
 *   maxScrollTop?: number,
 * }} args
 * @returns {number}
 */
export function computeLedgerSelectionScrollTop({
  rangeTop,
  paddingTop = 8,
  maxScrollTop = Infinity,
}) {
  const scrollTop = rangeTop - paddingTop
  return Math.min(Math.max(0, scrollTop), Math.max(0, maxScrollTop))
}

/**
 * Offset of an element’s top/bottom relative to a scroll container’s content.
 *
 * @param {Element} el
 * @param {Element} scroller
 * @returns {{ top: number, bottom: number }}
 */
export function offsetWithinScroller(el, scroller) {
  const elRect = el.getBoundingClientRect()
  const scrollerRect = scroller.getBoundingClientRect()
  const scrollTop = scroller.scrollTop
  return {
    top: elRect.top - scrollerRect.top + scrollTop,
    bottom: elRect.bottom - scrollerRect.top + scrollTop,
  }
}

/**
 * Nearest ancestor that scrolls vertically, or null.
 *
 * @param {Element | null | undefined} el
 * @returns {Element | null}
 */
export function nearestVerticalScroller(el) {
  let node = el?.parentElement ?? null
  while (node && node !== document.documentElement) {
    const { overflowY } = getComputedStyle(node)
    if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') {
      return node
    }
    node = node.parentElement
  }
  return null
}
