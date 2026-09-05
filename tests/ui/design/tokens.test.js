import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Resolved from the working directory: under jsdom, import.meta.url is an
// http:// URL, so fileURLToPath cannot be used here.
const SRC = resolve(process.cwd(), 'src')
const TOKENS = readFileSync(join(SRC, 'ui/design/tokens.css'), 'utf8')

function walkSrc(dir = SRC) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return walkSrc(full)
    return /\.(vue|css|js)$/.test(entry) ? [full] : []
  })
}

/**
 * Contrast is measured here rather than asserted in a comment. The
 * first-pass tokens carried claims like "~4.5:1 (AA compliant)" beside a
 * value that was nothing of the sort, and nothing ever checked.
 *
 * The worst case in this app is not ink on the void — it is ink on a
 * TRANSLUCENT panel lying over the brightest terrain the generator can
 * produce. Snow is #f5f5fa, so that composite is what the floors are
 * measured against.
 */
const SNOW = [245, 245, 250]

function token(name) {
  const match = TOKENS.match(new RegExp(`^\\s*--${name}:\\s*([^;]+);`, 'm'))
  if (!match) throw new Error(`token --${name} is not defined`)
  return match[1].trim()
}

function hexToRgb(hex) {
  const value = hex.replace('#', '')
  return [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16))
}

function rgbaToParts(value) {
  const [r, g, b, a] = value.match(/[\d.]+/g).map(Number)
  return { rgb: [r, g, b], alpha: a ?? 1 }
}

function composite(fg, bg, alpha) {
  return fg.map((channel, i) => channel * alpha + bg[i] * (1 - alpha))
}

function relativeLuminance([r, g, b]) {
  const [rl, gl, bl] = [r, g, b].map((channel) => {
    const c = channel / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl
}

function contrast(a, b) {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** A panel over snow: the lightest background any ink has to survive. */
function worstCaseBackground() {
  const { rgb, alpha } = rgbaToParts(token('surface-1'))
  return composite(rgb, SNOW, alpha)
}

describe('design tokens', () => {
  describe('contrast floors, measured against a panel over snow', () => {
    const cases = [
      { name: 'ink-1', floor: 7, role: 'body and headings — AAA' },
      { name: 'ink-2', floor: 4.5, role: 'secondary prose — AA' },
      { name: 'ink-3', floor: 3, role: 'labels only, never body text' },
      { name: 'accent', floor: 4.5, role: 'link and control text' },
      { name: 'trail', floor: 4.5, role: 'history and breadcrumb text' },
      { name: 'danger', floor: 4.5, role: 'error text' },
    ]

    it.each(cases)('--$name clears $floor:1 ($role)', ({ name, floor }) => {
      expect(contrast(hexToRgb(token(name)), worstCaseBackground())).toBeGreaterThanOrEqual(floor)
    })
  })

  it('keeps the panel opaque enough for the weakest ink to survive', () => {
    // Derived, not chosen: --ink-3 falls below 3:1 once the panel drops
    // under ~0.85. If someone lowers the alpha, this fails before a user
    // has to squint at it.
    const { alpha } = rgbaToParts(token('surface-1'))
    expect(alpha).toBeGreaterThanOrEqual(Number(token('panel-alpha-min')))

    const { rgb } = rgbaToParts(token('surface-1'))
    const tooTransparent = composite(rgb, SNOW, 0.72)
    expect(contrast(hexToRgb(token('ink-3')), tooTransparent)).toBeLessThan(3)
  })

  it('states the breakpoint ladder nowhere, because media queries cannot read it', () => {
    // The first-pass tokens declared --breakpoint-mobile/tablet/desktop,
    // which no media query could ever consume. Their absence is the fix.
    // Declarations only — the file explains the omission in prose.
    expect(TOKENS).not.toMatch(/^\s*--breakpoint-[a-z]+\s*:/m)
  })

  const LADDER = ['stage', 'stage-notice', 'stage-label', 'stage-portal', 'instruments', 'sheets', 'overlays', 'toast']

  it('defines one z-index ladder, in order', () => {
    for (const layer of LADDER) expect(() => token(`z-${layer}`)).not.toThrow()

    const rungs = LADDER.map((layer) => Number(token(`z-${layer}`)))
    expect(rungs).toEqual([...rungs].sort((a, b) => a - b))
  })

  it('puts a portal prompt above a section label', () => {
    // Both are drawn onto the world and both follow the cursor, so a portal
    // sitting on a summit puts them on the same pixel. "Click to travel" is
    // the one you can act on; it cannot be the one underneath.
    expect(Number(token('z-stage-portal'))).toBeGreaterThan(Number(token('z-stage-label')))
  })

  it('keeps everything drawn on the world below the instruments', () => {
    // SectionTooltip carried a bare z-index: 15 against --z-instruments: 10,
    // so a hover label painted over the top bar and the helm.
    for (const layer of ['stage-notice', 'stage-label', 'stage-portal']) {
      expect(Number(token(`z-${layer}`))).toBeLessThan(Number(token('z-instruments')))
    }
  })

  it('stacks nothing outside the ladder', () => {
    // The ladder is only a ladder if every rule climbs it. A bare number
    // silently outranks it — that is how the section label got above the
    // helm and the toast sat at 2100 with --z-toast defined as 300.
    const strays = []

    for (const file of walkSrc()) {
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, index) => {
          const value = line.match(/^\s*z-index:\s*(.+?);/)?.[1]
          if (value && !value.startsWith('var(--z-')) {
            strays.push(`${file.split('/src/')[1]}:${index + 1} z-index: ${value}`)
          }
        })
    }

    expect(strays).toEqual([])
  })

  describe('the token system holds together across src/', () => {
    // CSS swallows a reference to a token that does not exist: the
    // declaration is simply dropped and the element renders untouched. So a
    // typo is invisible until someone notices the colour is wrong.
    const RUNTIME_SET_IN_JS = new Set(['--citation-atmosphere', '--helm-lift'])

    function scanSrc() {
      const used = new Set()
      const defined = new Set()
      for (const file of walkSrc()) {
        const source = readFileSync(file, 'utf8')
        for (const match of source.matchAll(/var\(\s*(--[a-z0-9-]+)/g)) used.add(match[1])
        for (const match of source.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)) defined.add(match[1])
      }
      return { used, defined }
    }

    it('closes every bracket it opens', () => {
      // A malformed declaration is DROPPED by the browser, silently, the
      // same way an unknown custom property is — which is how a bulk
      // rename left `var(--surface-1-solid))` in a tooltip and took its
      // background away with nobody noticing. The regex that did it stopped
      // at the first ")" inside a nested rgba().
      const broken = []

      for (const file of walkSrc()) {
        const source = readFileSync(file, 'utf8')
        source.split('\n').forEach((line, index) => {
          const declaration = line.trim()
          if (!declaration.endsWith(';') || !declaration.includes(':')) return
          if (!declaration.includes('(')) return

          const opens = (declaration.match(/\(/g) ?? []).length
          const closes = (declaration.match(/\)/g) ?? []).length
          if (opens !== closes) broken.push(`${file.split('/src/')[1]}:${index + 1} ${declaration}`)
        })
      }

      expect(broken).toEqual([])
    })

    it('references no token that is never defined', () => {
      const { used, defined } = scanSrc()
      const dangling = [...used].filter((name) => !defined.has(name) && !RUNTIME_SET_IN_JS.has(name))
      expect(dangling).toEqual([])
    })

    it('carries no legacy aliases at all any more', () => {
      // The ledger existed to be emptied, and is. Every component now names
      // the token it means rather than one that forwards to it, so a reader
      // of any stylesheet sees the real system and not a translation of the
      // one it replaced.
      expect(TOKENS).not.toContain('LEGACY ALIASES')

      for (const retired of ['--panel-secondary', '--text-primary', '--danger-bg', '--duration-normal']) {
        expect(TOKENS, `${retired} should be gone`).not.toMatch(new RegExp(`^\\s*${retired}\\s*:`, 'm'))
      }
    })
  })

  it('scales spacing by density rather than redefining the scale', () => {
    // The old sheet redefined --spacing-* inside a media query, so the same
    // token meant different steps in different files.
    for (const step of ['xs', 'sm', 'md', 'lg', 'xl', '2xl']) {
      expect(token(`spacing-${step}`)).toContain('var(--density)')
    }
  })
})
