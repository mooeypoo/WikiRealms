import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { UNDERSTORY_BY_BAND, UNDERSTORY_FORMS } from '../../../src/ui/rendering/foliage.js'
import { SPHERE_VIEW } from '../../../src/ui/rendering/projection.js'
import {
  buildUnderstoryGeometry,
  understoryHeight,
  understoryTriangleCount,
} from '../../../src/ui/rendering/bladeGeometry.js'

/**
 * Ground cover was point sprites until now, and a sprite has no shape to
 * get wrong — it faced the camera, at whatever size the driver allowed.
 * Clumps of real geometry can be wrong in all the ways trees can, so they
 * are checked the same way canopyGeometry.test.js checks those: three's
 * geometry classes need no GL context, while nothing in WorldView3D.vue's
 * render path runs under jsdom at all.
 */

/** Per-axis min/max of a geometry's position attribute. */
function bounds(geometry) {
  const position = geometry.getAttribute('position').array
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < position.length; i += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], position[i + axis])
      max[axis] = Math.max(max[axis], position[i + axis])
    }
  }
  return { min, max }
}

const KINDS = Object.keys(UNDERSTORY_FORMS)

describe('buildUnderstoryGeometry', () => {
  it('builds every kind with positions, normals and colours', () => {
    for (const kind of KINDS) {
      const geometry = buildUnderstoryGeometry(UNDERSTORY_FORMS[kind], 1)
      for (const name of ['position', 'normal', 'color']) {
        expect(geometry.getAttribute(name), `${kind} ${name}`).toBeInstanceOf(THREE.BufferAttribute)
        expect(geometry.getAttribute(name).count, `${kind} ${name}`).toBeGreaterThan(0)
      }
      expect(geometry.getAttribute('position').count).toBe(geometry.getAttribute('color').count)
    }
  })

  it('roots every clump at the origin, growing along +Z', () => {
    // The whole instancing scheme rests on this. The instance matrix
    // places and rotates a clump with no pivot correction, and the wind
    // shader weights its bend by height above z=0 — so a clump whose base
    // is not at the origin either floats, sinks, or bends from the wrong
    // end.
    for (const kind of KINDS) {
      const { min, max } = bounds(buildUnderstoryGeometry(UNDERSTORY_FORMS[kind], 1))
      expect(min[2], `${kind} base`).toBeCloseTo(0, 5)
      expect(max[2], `${kind} tip`).toBeGreaterThan(0)
    }
  })

  it('keeps each kind to the proportions its form documents', () => {
    // The three shapes share one primitive, so proportion is the ONLY
    // thing telling them apart: upright grass, a low splayed bush, a
    // wide fan of fronds. Lean, arch and spread each push a blade
    // outward and rob it of height at the same time, so these figures
    // move together and cannot be checked one at a time.
    //
    // Width matters against the sprite this replaces, which covered a
    // disc exactly `size` across: much narrower and the swap reads as
    // the whole ground-cover layer thinning out.
    const expected = {
      grass: { width: 0.85, height: 1.1 },
      scrub: { width: 0.95, height: 0.48 },
      fern: { width: 1.0, height: 0.78 },
    }

    for (const kind of KINDS) {
      const size = 0.85
      const { min, max } = bounds(buildUnderstoryGeometry(UNDERSTORY_FORMS[kind], size))
      const width = Math.max(max[0] - min[0], max[1] - min[1])

      expect(width / size, `${kind} width`).toBeCloseTo(expected[kind].width, 1)
      expect(max[2] / size, `${kind} height`).toBeCloseTo(expected[kind].height, 1)
    }

    // Grass stands up; the other two lie down. Getting this backwards is
    // how the first cut of these forms came out — a grass clump 1.4
    // cells wide and 1.0 tall, which is a doormat.
    const aspect = (kind) => {
      const { min, max } = bounds(buildUnderstoryGeometry(UNDERSTORY_FORMS[kind], 1))
      return max[2] / Math.max(max[0] - min[0], max[1] - min[1])
    }
    expect(aspect('grass')).toBeGreaterThan(1.2)
    expect(aspect('scrub')).toBeLessThan(0.7)
    expect(aspect('fern')).toBeLessThan(1)
  })

  it('keeps a clump inside its own cell', () => {
    // Ground cover samples EVERY cell, so a clump reaching more than
    // half a cell from its centre grows through the one next door — and
    // the placement offset already uses that whole half-cell.
    for (const kind of KINDS) {
      const size = Math.max(...Object.values(UNDERSTORY_BY_BAND).flat().map((v) => v.size))
      const { min, max } = bounds(buildUnderstoryGeometry(UNDERSTORY_FORMS[kind], size))
      const radius = Math.max(-min[0], max[0], -min[1], max[1])
      expect(radius, `${kind} reach`).toBeLessThan(1)
    }
  })

  it('shades the root darker than the tip', () => {
    // Ambient occlusion by another name: the light really is blocked down
    // in a clump. Without it a clump is one flat green and reads as a
    // cutout however good its silhouette, and this gradient is the only
    // place that shading comes from — the per-instance tint is a single
    // colour for the whole clump.
    for (const kind of KINDS) {
      const geometry = buildUnderstoryGeometry(UNDERSTORY_FORMS[kind], 1)
      const position = geometry.getAttribute('position')
      const color = geometry.getAttribute('color')

      let lowest = { z: Infinity, shade: 0 }
      let highest = { z: -Infinity, shade: 0 }
      for (let i = 0; i < position.count; i += 1) {
        const z = position.getZ(i)
        if (z < lowest.z) lowest = { z, shade: color.getX(i) }
        if (z > highest.z) highest = { z, shade: color.getX(i) }
      }

      expect(lowest.shade, `${kind} root`).toBeLessThan(highest.shade * 0.7)
      // Grey, so it only scales the instance's own colour rather than
      // tinting it. A gradient with a hue of its own would fight every
      // variant's green.
      for (let i = 0; i < color.count; i += 1) {
        expect(color.getX(i)).toBeCloseTo(color.getY(i), 6)
        expect(color.getY(i)).toBeCloseTo(color.getZ(i), 6)
      }
    }
  })

  it('tapers each blade to a point rather than a cut-off ribbon', () => {
    // A blade that ends in a rectangle reads as a strip of paper. The
    // taper is the difference between grass and confetti.
    //
    // One blade, because a whole clump puts every blade's tip at the
    // same height around a ring — so "the highest vertices coincide" is
    // false for the clump while being exactly what each blade must do.
    const geometry = buildUnderstoryGeometry({ ...UNDERSTORY_FORMS.grass, blades: 1 }, 1)
    const position = geometry.getAttribute('position')
    const { max } = bounds(geometry)

    const tips = []
    for (let i = 0; i < position.count; i += 1) {
      if (position.getZ(i) > max[2] - 1e-6) tips.push([position.getX(i), position.getY(i)])
    }
    expect(tips.length).toBeGreaterThan(1)
    for (const [x, y] of tips) {
      expect(Math.hypot(x - tips[0][0], y - tips[0][1])).toBeCloseTo(0, 5)
    }

    // And the width has to shrink at every step up, not only at the very
    // end: a blade that stays full width until the last segment is a
    // ribbon with a dart cut in it. Measured at the rows the blade
    // actually has, since the segment count is a tunable cost knob.
    const rows = new Map()
    for (let i = 0; i < position.count; i += 1) {
      const z = Math.round(position.getZ(i) * 1e5) / 1e5
      const row = rows.get(z) ?? { low: Infinity, high: -Infinity }
      row.low = Math.min(row.low, position.getY(i))
      row.high = Math.max(row.high, position.getY(i))
      rows.set(z, row)
    }

    const widths = [...rows.entries()].sort(([a], [b]) => a - b).map(([, row]) => row.high - row.low)
    expect(widths.length).toBeGreaterThan(2)
    for (let i = 1; i < widths.length; i += 1) {
      expect(widths[i], `row ${i}`).toBeLessThan(widths[i - 1])
    }
    expect(widths.at(-1)).toBeCloseTo(0, 5)
  })

  it('scales with the projection, so the planet does not grow giant grass', () => {
    // The relief on the planet is compressed 5.4x against the flat map,
    // and foliage authored in grid cells out-scales it if the cell scale
    // is dropped. It is how a jungle crown once came out at 40% of the
    // planet's entire vertical relief.
    const form = UNDERSTORY_FORMS.grass
    const scale = SPHERE_VIEW.foliageScale
    const flat = bounds(buildUnderstoryGeometry(form, 1, 1))
    const planet = bounds(buildUnderstoryGeometry(form, 1, scale))

    expect(scale).toBeLessThan(1)
    expect(planet.max[2] / flat.max[2]).toBeCloseTo(scale, 5)
    expect(planet.max[0] / flat.max[0]).toBeCloseTo(scale, 5)
    expect(understoryHeight(form, 1, scale)).toBeCloseTo(understoryHeight(form, 1, 1) * scale, 6)
  })

  it('reports the exact height the wind has to bend it by', () => {
    // The shader divides a vertex's own z by this to decide how far to
    // lean it, and squares the result. So this is not a rough size — an
    // overstated height means the tallest vertex in the clump only
    // reaches part-way up its own weighting curve and the whole thing
    // barely moves.
    //
    // It caught a real bug: form.height is a blade's length ALONG
    // ITSELF, and scrub leans 0.55 radians, which costs 23% of it. The
    // first version reported the length and scrub bent at less than half
    // the intended amount.
    for (const kind of KINDS) {
      const form = UNDERSTORY_FORMS[kind]
      const { max } = bounds(buildUnderstoryGeometry(form, 0.9, 1.4))
      expect(max[2], kind).toBeCloseTo(understoryHeight(form, 0.9, 1.4), 6)
      // And it is genuinely shorter than the blade is long, or the
      // correction is not doing anything.
      expect(understoryHeight(form, 0.9, 1.4), kind).toBeLessThan(form.height * 0.9 * 1.4)
    }
  })

  it('costs what it says it costs', () => {
    // This is the densest layer in the scene by an order of magnitude, so
    // its per-clump triangle count is the one number that decides whether
    // the whole thing is affordable.
    for (const kind of KINDS) {
      const form = UNDERSTORY_FORMS[kind]
      const geometry = buildUnderstoryGeometry(form, 1)
      expect(geometry.index, `${kind} should be de-indexed by the merge`).toBeNull()
      expect(geometry.getAttribute('position').count / 3, kind).toBe(understoryTriangleCount(form))
      expect(understoryTriangleCount(form), kind).toBeLessThanOrEqual(24)
    }
  })

  it('has a form for every kind the variant tables grow', () => {
    // A variant whose kind has no form is silently dropped by the
    // component, which is a whole biome band's ground cover vanishing.
    const grown = new Set()
    for (const variants of Object.values(UNDERSTORY_BY_BAND)) {
      for (const variant of variants) grown.add(variant.kind)
    }
    for (const kind of grown) {
      expect(UNDERSTORY_FORMS, `${kind} is grown but has no form`).toHaveProperty(kind)
    }
  })
})
