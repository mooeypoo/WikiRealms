import { describe, expect, it } from 'vitest'
import {
  computeLedgerSelectionScrollTop,
  ledgerSelectionPadding,
} from '../../../src/ui/components/ledgerScroll.js'

describe('ledgerSelectionPadding', () => {
  it('uses tighter padding when the viewport is narrow or short', () => {
    expect(ledgerSelectionPadding('open', { narrow: true })).toEqual({ top: 8, bottom: 12 })
    expect(ledgerSelectionPadding('open', { short: true })).toEqual({ top: 8, bottom: 12 })
    expect(ledgerSelectionPadding('full', { narrow: true })).toEqual({ top: 10, bottom: 14 })
  })

  it('gives the full desktop sheet more breathing room', () => {
    expect(ledgerSelectionPadding('full', {})).toEqual({ top: 16, bottom: 20 })
    expect(ledgerSelectionPadding('open', {})).toEqual({ top: 12, bottom: 16 })
  })
})

describe('computeLedgerSelectionScrollTop', () => {
  it('aligns the section head below the top padding', () => {
    expect(
      computeLedgerSelectionScrollTop({
        rangeTop: 400,
        paddingTop: 12,
      }),
    ).toBe(388)
  })

  it('never scrolls above 0 or past maxScrollTop', () => {
    expect(
      computeLedgerSelectionScrollTop({
        rangeTop: 5,
        paddingTop: 12,
        maxScrollTop: 1000,
      }),
    ).toBe(0)

    expect(
      computeLedgerSelectionScrollTop({
        rangeTop: 900,
        paddingTop: 12,
        maxScrollTop: 500,
      }),
    ).toBe(500)
  })

  it('uses a smaller top inset on mobile open so the head sits higher', () => {
    const desktop = ledgerSelectionPadding('open', {})
    const mobile = ledgerSelectionPadding('open', { narrow: true })
    expect(
      computeLedgerSelectionScrollTop({ rangeTop: 400, paddingTop: mobile.top }),
    ).toBeGreaterThan(
      computeLedgerSelectionScrollTop({ rangeTop: 400, paddingTop: desktop.top }),
    )
  })
})
