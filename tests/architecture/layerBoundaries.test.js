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
    // ui/content/ is forbidden in this direction because content already
    // depends on rendering — the legend and the band table take their
    // swatches from biomeColor. A renderer reaching back for copy would
    // make the two mutually dependent, and the tooltip nearly did: it
    // wanted the words for the band it had just classified. It returns
    // the band id instead and lets the component resolve them.
    mayNotImport: ['adapters/', 'ui/components/', 'ui/content/'],
    because: 'renderers turn world data into geometry; they do not fetch, own components, or hold copy',
  },
  {
    layer: 'src/ui/content',
    mayNotImport: ['adapters/', 'ui/components/'],
    because: 'copy may read the engine it describes and the colours it shows, but it does not fetch or own components',
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

  /**
   * Which renderer modules are allowed to reach for three.js.
   *
   * The rest of ui/rendering avoids it so that the DECISIONS — where
   * things grow, how big, what colour, which shape — stay testable: three's
   * geometry classes need no WebGL context, but a material, a texture or a
   * draw call does, and WorldView3D.vue bails to its fallback the moment
   * detectWebGLSupport fails, so nothing inside its render path is
   * exercised by the suite at all.
   *
   * That convention was a comment in two file headers, which is not a
   * convention so much as a hope. An import added to foliageScatter.js
   * would quietly undo the extraction that put it there.
   *
   * The allowlist is the pairing: for every module here there should be a
   * pure one holding the decisions it draws. canopyGeometry.js builds
   * tree shapes and bladeGeometry.js ground-cover clumps, both for
   * foliageScatter.js's buffers; portalForms.js draws portals for
   * portalPlacement.js's placements; stylizedMaterial.js shades what
   * biomeColor.js and terrainMesh.js decided the colour of.
   */
  const MAY_IMPORT_THREE = [
    'bladeGeometry.js',
    'canopyGeometry.js',
    'portalForms.js',
    'stylizedMaterial.js',
  ]

  it('keeps three.js out of ui/rendering bar the geometry builders', () => {
    const violations = []

    for (const file of walk(join(SRC, 'ui/rendering'))) {
      const name = relative(join(SRC, 'ui/rendering'), file).split('\\').join('/')
      if (MAY_IMPORT_THREE.includes(name)) continue
      if (importsOf(file).some((specifier) => specifier === 'three' || specifier.startsWith('three/'))) {
        violations.push(name)
      }
    }

    expect(violations, 'a renderer that needs a GL context cannot be unit tested').toEqual([])
  })

  it('covers every layer that exists under src/', () => {
    // A new top-level directory should arrive with a rule, not slip in
    // unconstrained. src/ui is covered by its subdirectory rules.
    const known = new Set(['core', 'engine', 'adapters', 'ui'])
    const actual = readdirSync(SRC).filter((entry) => statSync(join(SRC, entry)).isDirectory())

    expect(actual.filter((entry) => !known.has(entry))).toEqual([])
  })
})
