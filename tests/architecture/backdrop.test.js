import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The sky is a CSS backdrop, not scene geometry.
 *
 * It cost nothing to build and it costs nothing to run: no skybox, no star
 * mesh, no texture upload — a gradient and two tiled dot-fields the
 * compositor draws behind a transparent canvas. Because it is behind the
 * canvas rather than in the scene, the stars also hold still while the
 * world turns, which is what makes them read as distant.
 *
 * The whole arrangement hangs on one renderer flag. Without alpha the
 * canvas composites opaque black over all of it, which is exactly the
 * state this replaced: the starfield and the body gradient had both been
 * written months earlier and never once been visible.
 */

const read = (path) => readFileSync(resolve(import.meta.dirname, '../..', path), 'utf8')

const WORLD_VIEW_3D = read('src/ui/components/WorldView3D.vue')
const APP = read('src/App.vue')
const STYLE = read('src/style.css')

describe('the backdrop', () => {
  it('renders the world onto a transparent canvas', () => {
    // jsdom has no WebGL, so the renderer never constructs in a test and
    // there is no object to interrogate. The construction site is the
    // only place this can be checked.
    expect(WORLD_VIEW_3D).toMatch(/new THREE\.WebGLRenderer\(\{[^}]*alpha:\s*true/)
  })

  it('clears to nothing, so what is behind the canvas survives', () => {
    expect(WORLD_VIEW_3D).toMatch(/setClearColor\(\s*0x000000\s*,\s*0\s*\)/)
  })

  it('never paints the stage over its own sky', () => {
    // A background on any of these would bury the field just as the opaque
    // canvas did, and just as silently.
    for (const selector of ['.cosmos', '.cosmos__stage', '.cosmos__world']) {
      const rule = APP.match(new RegExp(`\\${selector} \\{([^}]*)\\}`))?.[1]
      expect(rule, `${selector} should exist`).toBeDefined()
      expect(rule, `${selector} must not paint over the starfield`).not.toMatch(/background/)
    }
  })

  it('is not black', () => {
    // "Muted, not black" is the whole brief. --surface-void is the darkest
    // rung and even it keeps some blue in it.
    expect(STYLE).toMatch(/body \{[^}]*radial-gradient/)
    expect(read('src/ui/design/tokens.css')).toMatch(/--surface-void:\s*#0[0-9a-f]{5}/)
  })

  it('scatters the stars rather than tiling one patch of them', () => {
    // Six stars on a single 400px tile repeat about fifteen times across a
    // desktop, and a grid of identical constellations reads as wallpaper.
    // Two fields whose sizes share no useful factor repeat every 5200px.
    const sizes = [...APP.matchAll(/background-size:\s*(\d+)px \1px/g)].map((match) => Number(match[1]))

    expect(sizes.length).toBeGreaterThanOrEqual(2)
    expect(new Set(sizes).size).toBe(sizes.length)
  })
})
