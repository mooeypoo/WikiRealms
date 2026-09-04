import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Resolved from the working directory: under jsdom, import.meta.url is an
// http:// URL, so fileURLToPath cannot be used here.
const SRC = resolve(process.cwd(), 'src')

/**
 * Enforces the domain separation docs/architecture.md sets out and
 * docs/ux-vision.md §7 sharpens, by reading imports rather than trusting
 * anyone to remember the rule.
 *
 * The direction that matters: presentation may depend on domain logic,
 * never the reverse, and the design primitives may depend on nothing at
 * all — a <Sheet> that knows what an article is has stopped being reusable.
 */
const RULES = [
  {
    layer: 'src/engine',
    mayNotImport: ['ui/', 'adapters/'],
    because: 'the generation engine must not know about rendering or fetching',
  },
  {
    layer: 'src/core',
    mayNotImport: ['ui/', 'adapters/'],
    because: 'core is pure domain logic; adapters and Vue are outside it',
  },
  {
    layer: 'src/adapters',
    mayNotImport: ['ui/'],
    because: 'an adapter serves the app; it must not reach back into the UI',
  },
  {
    layer: 'src/ui/design',
    mayNotImport: ['engine/', 'core/', 'adapters/', 'ui/components/', 'ui/rendering/'],
    because: 'design primitives are reusable precisely because they know nothing about this app',
  },
  {
    layer: 'src/ui/rendering',
    mayNotImport: ['adapters/', 'ui/components/'],
    because: 'renderers turn world data into geometry; they do not fetch, and they do not own components',
  },
]

const IMPORT_PATTERN = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g

function walk(dir) {
  const found = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) found.push(...walk(full))
    else if (/\.(js|vue)$/.test(entry)) found.push(full)
  }
  return found
}

/** Resolves an import specifier to a path relative to src/, or null if external. */
function resolveWithinSrc(fromFile, specifier) {
  if (!specifier.startsWith('.')) return null
  const resolved = join(fromFile, '..', specifier)
  return relative(SRC, resolved).split('\\').join('/')
}

function importsOf(file) {
  const source = readFileSync(file, 'utf8')
  const specifiers = []
  for (const match of source.matchAll(IMPORT_PATTERN)) {
    specifiers.push(match[1] ?? match[2])
  }
  return specifiers.filter(Boolean)
}

describe('layer boundaries', () => {
  it.each(RULES)('$layer does not import $mayNotImport', ({ layer, mayNotImport, because }) => {
    const dir = join(SRC, layer.replace(/^src\//, ''))
    const violations = []

    for (const file of walk(dir)) {
      for (const specifier of importsOf(file)) {
        const target = resolveWithinSrc(file, specifier)
        if (!target) continue
        for (const forbidden of mayNotImport) {
          if (target.startsWith(forbidden)) {
            violations.push(`${relative(SRC, file)} → ${target}`)
          }
        }
      }
    }

    expect(violations, `${layer}: ${because}`).toEqual([])
  })

  it('covers every layer that exists under src/', () => {
    // A new top-level directory should arrive with a rule, not slip in
    // unconstrained. src/ui is covered by its subdirectory rules.
    const known = new Set(['core', 'engine', 'adapters', 'ui'])
    const actual = readdirSync(SRC).filter((entry) => statSync(join(SRC, entry)).isDirectory())

    expect(actual.filter((entry) => !known.has(entry))).toEqual([])
  })
})
