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

  it('keeps lifting through open and full so Legend stays reachable', () => {
    // Hiding the helm while reading erased Planet / Flat / Legend on phones.
    // Clearance matches the snap fractions so the strip sits above the sheet.
    expect(clearsLedger('collapsed')).toBe(true)
    expect(clearsLedger('peek')).toBe(true)
    expect(clearsLedger('open')).toBe(true)
    expect(clearsLedger('full')).toBe(true)

    expect(ledgerClearance('open')).toBe('42dvh')
    expect(ledgerClearance('full')).toBe('88dvh')
  })
})
