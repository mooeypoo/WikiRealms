/**
 * Turns a tree archetype's proportions (see foliage.js CANOPY_ARCHETYPES)
 * into one BufferGeometry, ready to be instanced.
 *
 * This module imports three.js, which the rest of ui/rendering avoids —
 * and does so precisely BECAUSE it makes the code testable. three's
 * geometry classes need no WebGL context, so everything here runs under
 * jsdom, while the component that consumes it cannot: WorldView3D.vue
 * bails to its fallback the moment detectWebGLSupport fails, so nothing
 * inside its render path is exercised by the suite at all. Pulling the
 * shape-building out here is the difference between "the trees are the
 * right way up" being checked and being hoped for.
 *
 * Conventions the instancing depends on:
 * - +Z is up, matching the mesh's local frame (the shared worldGroup
 *   rotation carries it into world-Y-up, and on the planet each instance
 *   rotates +Z onto its own surface normal).
 * - The base sits at the origin, so an instance matrix only has to
 *   place, rotate and scale — no per-instance pivot correction.
 * - Trunk and crown are merged into ONE geometry, so a stand of two
 *   thousand trees is one draw call rather than four thousand.
 */
import * as THREE from 'three'

/** Radial segments. Tiny on purpose: read in their thousands, at distance. */
const TRUNK_SEGMENTS = 5
const CONE_SEGMENTS = 7
const CROWN_WIDTH_SEGMENTS = 7
const CROWN_HEIGHT_SEGMENTS = 5

/**
 * Concatenates BufferGeometries that share an attribute set.
 *
 * three.js ships a BufferGeometryUtils helper for this, but the
 * archetypes here carry only position and normal, so doing it directly is
 * a dozen lines and no addon import. De-indexes first, because the
 * sources index differently and merging index buffers means rebasing
 * every offset.
 *
 * @param {THREE.BufferGeometry[]} geometries
 * @returns {THREE.BufferGeometry}
 */
export function mergeGeometries(geometries) {
  const parts = geometries.map((geometry) => {
    const flat = geometry.index ? geometry.toNonIndexed() : geometry
    return { flat, owned: flat !== geometry }
  })

  // Whatever the first geometry carries, every geometry must carry. The
  // trees bring position and normal; a clump of grass blades also brings
  // a per-vertex colour, and hardcoding that pair silently dropped it —
  // leaving the root-dark gradient in the source and not on the screen.
  const merged = new THREE.BufferGeometry()

  for (const [name, first] of Object.entries(parts[0].flat.attributes)) {
    let total = 0
    for (const part of parts) {
      const attribute = part.flat.getAttribute(name)
      if (!attribute) {
        throw new Error(`mergeGeometries: a geometry is missing the '${name}' attribute`)
      }
      total += attribute.array.length
    }

    const buffer = new Float32Array(total)
    let offset = 0
    for (const part of parts) {
      const attribute = part.flat.getAttribute(name)
      buffer.set(attribute.array, offset)
      offset += attribute.array.length
    }
    merged.setAttribute(name, new THREE.BufferAttribute(buffer, first.itemSize))
  }

  for (const part of parts) if (part.owned) part.flat.dispose()

  return merged
}

/**
 * Builds one archetype's geometry, with +Z up and its base at the origin.
 *
 * @param {{ trunkHeight: number, trunkRadius: number, crownHeight: number, crownRadius: number, crown: string }} spec
 *   proportions in GRID CELLS, from CANOPY_ARCHETYPES
 * @param {number} [scale] world units per grid cell for the active
 *   projection (see FLAT_VIEW/SPHERE_VIEW foliageScale)
 * @returns {THREE.BufferGeometry}
 */
export function buildArchetypeGeometry(spec, scale = 1) {
  const trunkHeight = spec.trunkHeight * scale
  const crownHeight = spec.crownHeight * scale
  const crownRadius = spec.crownRadius * scale

  // Slightly tapered, so a trunk reads as a trunk rather than a pipe.
  const trunk = new THREE.CylinderGeometry(
    spec.trunkRadius * scale * 0.8,
    spec.trunkRadius * scale,
    trunkHeight,
    TRUNK_SEGMENTS,
  )
  // Cylinder and Cone are built around +Y; this frame is +Z up, so every
  // piece is rotated once here rather than once per instance.
  trunk.rotateX(Math.PI / 2)
  trunk.translate(0, 0, trunkHeight / 2)

  let crown
  if (spec.crown === 'cone') {
    crown = new THREE.ConeGeometry(crownRadius, crownHeight, CONE_SEGMENTS)
    crown.rotateX(Math.PI / 2)
  } else {
    crown = new THREE.SphereGeometry(crownRadius, CROWN_WIDTH_SEGMENTS, CROWN_HEIGHT_SEGMENTS)
    crown.rotateX(Math.PI / 2)
    // Squashed to an ellipsoid of the requested height: a sphere on a
    // stick reads as a lollipop, and a real broadleaf crown is wider
    // than it is tall.
    crown.scale(1, 1, crownHeight / (crownRadius * 2))
  }
  crown.translate(0, 0, trunkHeight + crownHeight / 2)

  const merged = mergeGeometries([trunk, crown])
  trunk.dispose()
  crown.dispose()
  return merged
}

/**
 * Total height of an archetype in world units — what the tallest thing
 * on a cell measures, used by tests and by anything that has to clear a
 * canopy.
 *
 * @param {object} spec from CANOPY_ARCHETYPES
 * @param {number} [scale]
 */
export function archetypeHeight(spec, scale = 1) {
  return (spec.trunkHeight + spec.crownHeight) * scale
}
