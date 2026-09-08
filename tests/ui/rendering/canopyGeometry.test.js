import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { CANOPY_ARCHETYPES } from '../../../src/ui/rendering/foliage.js'
import {
  archetypeHeight,
  buildArchetypeGeometry,
  mergeGeometries,
} from '../../../src/ui/rendering/canopyGeometry.js'

/**
 * The only test coverage the 3D vegetation gets.
 *
 * WorldView3D.vue bails to its WebGL fallback under jsdom, so nothing
 * inside its render path runs in the suite. three's geometry classes need
 * no GL context, though, so the shapes themselves can be checked here —
 * which is what makes "the trees are the right way up" a fact rather than
 * a hope.
 */

/** Per-axis min/max of a geometry's position attribute. */
function bounds(geometry) {
  const position = geometry.getAttribute('position').array
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < position.length; i += 3) {
    for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis], position[i + axis])
      max[axis] = Math.max(max[axis], position[i + axis])
    }
  }
  return { min, max }
}

const NAMES = Object.keys(CANOPY_ARCHETYPES)

describe('buildArchetypeGeometry', () => {
  it('builds every archetype with positions and normals', () => {
    for (const name of NAMES) {
      const geometry = buildArchetypeGeometry(CANOPY_ARCHETYPES[name])

      expect(geometry.getAttribute('position').count, name).toBeGreaterThan(0)
      expect(geometry.getAttribute('normal').count, name).toBe(geometry.getAttribute('position').count)
      // De-indexed on merge, so instancing needs no index rebasing.
      expect(geometry.index, name).toBeNull()
    }
  })

  it('stands every tree up the +Z axis', () => {
    // The convention the instancing depends on. Get this wrong and every
    // tree on the planet lies on its side, which is exactly the kind of
    // thing only a browser would otherwise have caught.
    for (const name of NAMES) {
      const spec = CANOPY_ARCHETYPES[name]
      const { min, max } = bounds(buildArchetypeGeometry(spec))
      const height = archetypeHeight(spec)

      expect(max[2], name).toBeCloseTo(height, 4)
      // Z extent must exceed the horizontal extent for anything meant to
      // be a tree. The shrub and the krummholz are deliberately not
      // trees: both hug the ground and are wider than they are tall.
      if (name !== 'krummholz' && name !== 'shrub') {
        expect(max[2] - min[2], name).toBeGreaterThan(max[0] - min[0])
      }
    }
  })

  it('puts the base at the origin, so an instance matrix only places it', () => {
    for (const name of NAMES) {
      const { min } = bounds(buildArchetypeGeometry(CANOPY_ARCHETYPES[name]))

      // A trunk cap sits exactly on 0; nothing may hang below it, or a
      // tree sinks into the terrain by however much it overhangs.
      expect(min[2], name).toBeCloseTo(0, 4)
    }
  })

  it('keeps the crown inside the authored radius', () => {
    for (const name of NAMES) {
      const spec = CANOPY_ARCHETYPES[name]
      const { min, max } = bounds(buildArchetypeGeometry(spec))

      expect(max[0], name).toBeLessThanOrEqual(spec.crownRadius + 1e-6)
      expect(min[0], name).toBeGreaterThanOrEqual(-spec.crownRadius - 1e-6)
    }
  })

  it('squashes a round crown to the authored height rather than leaving a sphere', () => {
    // A sphere on a stick reads as a lollipop. The crown has to be the
    // height it says it is.
    const spec = CANOPY_ARCHETYPES.broadleaf
    const { max } = bounds(buildArchetypeGeometry(spec))

    expect(max[2]).toBeCloseTo(spec.trunkHeight + spec.crownHeight, 4)
    // And wider than tall, which a bare sphere of this radius would not be.
    expect(spec.crownRadius * 2).toBeGreaterThan(spec.crownHeight)
  })

  it('scales the whole tree by the projection cell scale', () => {
    const spec = CANOPY_ARCHETYPES.conifer
    const full = bounds(buildArchetypeGeometry(spec, 1))
    const half = bounds(buildArchetypeGeometry(spec, 0.5))

    expect(half.max[2]).toBeCloseTo(full.max[2] / 2, 4)
    expect(half.max[0]).toBeCloseTo(full.max[0] / 2, 4)
  })

  it('stays cheap enough to instance in the thousands', () => {
    // Budget: the terrain mesh alone is 262k triangles at the default
    // grid, and the canopy runs to a couple of thousand instances.
    for (const name of NAMES) {
      const triangles = buildArchetypeGeometry(CANOPY_ARCHETYPES[name]).getAttribute('position').count / 3

      expect(triangles, name).toBeLessThan(120)
    }
  })

  it('gives a conifer a narrower silhouette than a broadleaf', () => {
    // The archetypes have to be distinguishable in outline, since that is
    // what separates one band's trees from another's at distance.
    const conifer = bounds(buildArchetypeGeometry(CANOPY_ARCHETYPES.conifer))
    const broadleaf = bounds(buildArchetypeGeometry(CANOPY_ARCHETYPES.broadleaf))

    const slenderness = (b) => (b.max[2] - b.min[2]) / (b.max[0] - b.min[0])

    expect(slenderness(conifer)).toBeGreaterThan(slenderness(broadleaf))
  })
})

describe('mergeGeometries', () => {
  it('concatenates vertex counts', () => {
    const a = new THREE.ConeGeometry(1, 2, 6)
    const b = new THREE.ConeGeometry(1, 2, 6)
    const expected = a.toNonIndexed().getAttribute('position').count * 2

    expect(mergeGeometries([a, b]).getAttribute('position').count).toBe(expected)
  })

  it('leaves the sources usable', () => {
    // buildArchetypeGeometry disposes them itself afterwards; merging must
    // not do it early, or the second read throws.
    const cone = new THREE.ConeGeometry(1, 2, 6)
    mergeGeometries([cone])

    expect(cone.getAttribute('position').count).toBeGreaterThan(0)
  })

  it('preserves positions from every source', () => {
    const low = new THREE.ConeGeometry(1, 2, 6)
    const high = new THREE.ConeGeometry(1, 2, 6)
    high.translate(0, 10, 0)

    const { min, max } = bounds(mergeGeometries([low, high]))

    expect(min[1]).toBeLessThan(0)
    expect(max[1]).toBeGreaterThan(9)
  })
})
