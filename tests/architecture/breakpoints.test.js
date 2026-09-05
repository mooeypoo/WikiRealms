import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BREAKPOINTS, SHORT_MAX_HEIGHT } from '../../src/ui/design/useViewport.js'

const SRC = resolve(process.cwd(), 'src')

/**
 * One ladder, actually held.
 *
 * The first-pass UI declared breakpoints at 320/768/1200 as custom
 * properties — which media queries cannot read — and then wrote real
 * queries at 640, 767, 1023 and 1199, chosen per component. So the
 * "responsive system" was four systems, and the declared one was inert.
 *
 * Media queries cannot reference a constant, so the only way the ladder in
 * useViewport can stay true is if something reads the CSS back and checks.
 */
function walk(dir = SRC) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return walk(full)
    return /\.(vue|css)$/.test(entry) ? [full] : []
  })
}

/** Every width the ladder legitimately produces: a min, or one less than one. */
const ALLOWED_WIDTHS = new Set(
  Object.values(BREAKPOINTS)
    .filter((value) => value > 0)
    .flatMap((value) => [value, value - 1]),
)

const ALLOWED_HEIGHTS = new Set([SHORT_MAX_HEIGHT])

describe('breakpoints', () => {
  const queries = walk().flatMap((file) => {
    const source = readFileSync(file, 'utf8')
    return [...source.matchAll(/@media([^{]+)\{/g)].map((match) => ({
      file: relative(SRC, file),
      query: match[1].trim(),
    }))
  })

  it('finds the media queries to check', () => {
    expect(queries.length).toBeGreaterThan(0)
  })

  it.each(queries)('$file: $query uses the ladder', ({ query }) => {
    for (const [, dimension, pixels] of query.matchAll(/\((?:max|min)-(width|height):\s*(\d+)px\)/g)) {
      const allowed = dimension === 'width' ? ALLOWED_WIDTHS : ALLOWED_HEIGHTS
      expect([...allowed], `${pixels}px is not a step on the ladder`).toContain(Number(pixels))
    }
  })

  it('states the short case by height, never by width', () => {
    // A landscape phone is 844px wide — wider than an md tablet. Anything
    // reaching for it by width has misunderstood which axis is scarce.
    const byWidth = queries.filter((entry) => /max-width:\s*8\d\dpx/.test(entry.query))

    expect(byWidth).toEqual([])
  })

  it('leaves preference queries alone', () => {
    // These are not breakpoints and must not be normalised into the ladder.
    const preferences = queries.filter((entry) => entry.query.includes('prefers-') || entry.query.includes('pointer:'))

    expect(preferences.length).toBeGreaterThan(0)
  })
})
