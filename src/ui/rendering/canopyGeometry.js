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
/** One fewer than a plain cone's, because a tiered crown pays per tier. */
const TIER_SEGMENTS = 6

/**
 * How a stack of tiers is proportioned. See buildTieredCrown.
 *
 * WHY A TIERED CONIFER EXISTS AT ALL
 *
 * Not for the silhouette — for the snow. The shader only lays snow where
 * a surface faces the sky, gated by SNOW_FACING_START at 0.35, and a
 * single cone of crownHeight 3.0 on crownRadius 0.48 has sides 81
 * degrees off vertical: their normals carry an up-component of 0.158 and
 * take nothing. Measured over the whole archetype by surface area, 0.2%
 * of a plain conifer could hold frost, against 53% of a krummholz.
 *
 * That was invisible for a cruel reason. ALTITUDE.coniferStart is 0.52
 * and frostStart is 0.62, so across the entire frost band the tree that
 * grows IS a conifer — the one shape in the set that could not carry
 * what the band was there to give it. Every part worked and the world
 * had bare green trees standing in the snow.
 *
 * WHY THESE NUMBERS
 *
 * A tier's side slope is its height over its radius, and that single
 * ratio decides both how the tree reads and whether snow stays on it.
 * Shallow tiers hold snow and look like a fir; steep ones hold nothing.
 * But shallow tiers are short, so filling a tall crown with them takes
 * MORE of them — which is why the tier count is not a matter of taste.
 * The pitch is therefore not a constant here at all: it is solved for,
 * from the crown height the archetype asks for and the tiers available
 * to fill it, so that the two can never quietly disagree.
 */
const TIER_SHAPE = Object.freeze({
  /**
   * How much narrower the topmost tier is than the bottom one.
   *
   * This, rather than the slope of any individual tier, is what makes
   * the crown taper: each tier is a shallow skirt, and the cone shape of
   * the whole tree comes from the skirts shrinking as they climb.
   */
  taper: 0.85,
  /**
   * How far up its neighbour each tier's base sits, as a fraction of
   * that neighbour's height.
   *
   * Below 1 the tiers OVERLAP, which is what keeps the silhouette
   * continuous. It has to: tiers placed base-to-apex leave gaps wherever
   * they shrink faster than they shorten, and the crown comes apart into
   * a column of floating cones. Overlapping by construction means no
   * arrangement of taper and count can produce that.
   */
  overlap: 0.72,
})

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
 * The slope of every tier in a stack, as height over radius.
 *
 * Solved rather than chosen, so that a crown of the requested height is
 * exactly filled by the tiers it was given: steepen the tiers and they
 * overshoot it, flatten them and they fall short. Exported because the
 * frost depends on it — the up-component of a tier's normal is
 * cos(atan(pitch)), and that is what SNOW_FACING_START is measured
 * against.
 *
 * @param {number[]} radii each tier's radius, bottom first
 * @param {number} height total crown height
 */
export function tierPitch(radii, height) {
  // Every tier but the last contributes only its overlapped part; the
  // top one contributes its whole height, since its apex is the tip.
  let stacked = 0
  for (let i = 0; i < radii.length - 1; i++) stacked += radii[i]
  const span = TIER_SHAPE.overlap * stacked + radii[radii.length - 1]
  return height / span
}

/**
 * The radius of each tier in a stack, bottom first.
 *
 * @param {number} radius the bottom tier's radius
 * @param {number} tiers how many
 */
export function tierRadii(radius, tiers) {
  const radii = []
  for (let i = 0; i < tiers; i++) {
    radii.push(radius * (1 - (TIER_SHAPE.taper * i) / tiers))
  }
  return radii
}

/**
 * A conifer crown as a stack of overlapping skirts, +Z up, base at z=0.
 *
 * @param {number} radius bottom tier's radius, in world units
 * @param {number} height total crown height, in world units
 * @param {number} tiers how many skirts
 * @returns {THREE.BufferGeometry[]} one per tier, caller merges and disposes
 */
export function buildTieredCrown(radius, height, tiers) {
  const radii = tierRadii(radius, tiers)
  const pitch = tierPitch(radii, height)

  const parts = []
  let base = 0
  for (const tierRadius of radii) {
    const tierHeight = pitch * tierRadius
    const skirt = new THREE.ConeGeometry(tierRadius, tierHeight, TIER_SEGMENTS)
    skirt.rotateX(Math.PI / 2)
    skirt.translate(0, 0, base + tierHeight / 2)
    parts.push(skirt)
    base += tierHeight * TIER_SHAPE.overlap
  }
  return parts
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

  // A tiered crown is already a stack sitting on z=0, so it is placed by
  // its base; the other two are single solids placed by their centre.
  let crown
  if (spec.crown === 'tiered') {
    crown = buildTieredCrown(crownRadius, crownHeight, spec.tiers)
    for (const tier of crown) tier.translate(0, 0, trunkHeight)
  } else if (spec.crown === 'cone') {
    const cone = new THREE.ConeGeometry(crownRadius, crownHeight, CONE_SEGMENTS)
    cone.rotateX(Math.PI / 2)
    cone.translate(0, 0, trunkHeight + crownHeight / 2)
    crown = [cone]
  } else {
    const round = new THREE.SphereGeometry(
      crownRadius,
      CROWN_WIDTH_SEGMENTS,
      CROWN_HEIGHT_SEGMENTS,
    )
    round.rotateX(Math.PI / 2)
    // Squashed to an ellipsoid of the requested height: a sphere on a
    // stick reads as a lollipop, and a real broadleaf crown is wider
    // than it is tall.
    round.scale(1, 1, crownHeight / (crownRadius * 2))
    round.translate(0, 0, trunkHeight + crownHeight / 2)
    crown = [round]
  }

  const merged = mergeGeometries([trunk, ...crown])
  trunk.dispose()
  for (const part of crown) part.dispose()
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
