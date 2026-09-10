import { describe, expect, it } from 'vitest'
import {
  LEDGER_COLLAPSED_HEIGHT,
  LEDGER_PEEK_HEIGHT,
  LEDGER_STATES,
  clearsLedger,
  ledgerClearance,
} from '../../../src/ui/components/ledgerStates.js'

describe('ledger states', () => {
  it('lists the four states in order of how much they show', () => {
    expect(LEDGER_STATES).toEqual(['collapsed', 'peek', 'open', 'full'])
  })

  it('gives something in the same corner room to clear the sheet', () => {
    // The helm sat behind the sheet at every state, including collapsed:
    // the two share the bottom-right of a phone and neither knew it.
    expect(ledgerClearance('collapsed')).toBe(`${LEDGER_COLLAPSED_HEIGHT}px`)
    expect(ledgerClearance('peek')).toBe(`${LEDGER_PEEK_HEIGHT}px`)
  })

  it('stops offering room once the sheet is most of the screen', () => {
    // Perching a control on top of a panel someone is reading is worse
    // than standing it down until they are done.
    expect(clearsLedger('collapsed')).toBe(true)
    expect(clearsLedger('peek')).toBe(true)
    expect(clearsLedger('open')).toBe(false)
    expect(clearsLedger('full')).toBe(false)

    expect(ledgerClearance('open')).toBe('0px')
    expect(ledgerClearance('full')).toBe('0px')
  })
})
