import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = resolve(process.cwd(), 'src')

/**
 * Direction contract: UI chrome mirrors with `dir` + logical CSS; the world
 * stays physical. Centering must not mix logical inset with physical
 * translate — that shoves dialogs off-screen under RTL.
 *
 * See docs/architecture.md §Direction and .cursor/rules/rtl-layout.mdc.
 */
function walk(dir = SRC) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return walk(full)
    return /\.(vue|css)$/.test(entry) ? [full] : []
  })
}

describe('RTL / LTR layout contract', () => {
  it('never centres with inset-inline-*: 50% plus physical translate(-50%)', () => {
    const offenders = []
    for (const file of walk()) {
      // Strip block comments so documentation of the footgun is not flagged.
      const source = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
      // Same rule block: logical mid-inline + physical half-size shift.
      const mixed = /inset-inline-(?:start|end)\s*:\s*50%[^}]*translate\(\s*-50%/s
      if (mixed.test(source)) {
        offenders.push(relative(process.cwd(), file))
      }
    }
    expect(offenders).toEqual([])
  })

  it('documents dialog centering as a physical-axis exception', () => {
    const sheet = readFileSync(resolve(SRC, 'ui/design/Sheet.vue'), 'utf8')
    const dialogBlock = sheet.match(/\.sheet--dialog\s*\{[^}]+\}/)?.[0] ?? ''
    expect(dialogBlock).toMatch(/left:\s*50%/)
    expect(dialogBlock).toMatch(/translate\(-50%,\s*-50%\)/)
    expect(dialogBlock).not.toMatch(/inset-inline-start:\s*50%/)
    expect(sheet).toMatch(/physical `left`/i)
  })
})
