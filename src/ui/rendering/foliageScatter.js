/**
 * WHERE things grow, separated from WHAT they are made of.
 *
 * foliage.js holds the rules — which bands carry which variants, at what
 * density, in what proportions. This module applies those rules to a
 * terrain grid and emits the result as flat attribute buffers: one
 * position per sprite, one position/normal/yaw/scale/colour per tree.
 * Turning those buffers into Points clouds and InstancedMeshes is the
 * component's job and nothing else's.
 *
 * The split exists because the two halves fail differently. Placement is
 * arithmetic over a hash — it can be wrong in ways a test can see (a band
 * that grows nothing, a ramp that inverts, a lattice showing through the
 * jitter), and until now it lived inside WorldView3D.vue behind the
 * detectWebGLSupport gate, where the suite could not reach it at all.
 * Materials and draw calls need a GL context and cannot be tested under
 * jsdom whatever we do. So the decisions move out here and the plumbing
 * stays there.
 *
 * The second reason is that appearance is currently baked into these
 * buffers and should not stay that way. `colors` carries snow dusting
 * computed at build time, which is why a snowline cannot move without
 * disposing and rebuilding the entire world. Buffers are the shape that
 * lets those values become shader attributes and uniforms later; this
 * module is deliberately the only place that would have to change.
 *
 * Free of three.js, like the rest of ui/rendering bar canopyGeometry.js.
 * Positions come from an injected projection (see projection.js), so the
 * flat map and the planet share one scatter path and a test can drive
 * either without a renderer.
 */
import {
  CANOPY_ARCHETYPES,
  FOLIAGE_SAMPLING,
  canopyInstanceTransform,
  cellFoliageRolls,
  computeFoliageDensityScale,
  foliageInstanceColor,
  pickCanopyVariant,
  pickUnderstoryVariant,
  resolveArchetypeForAltitude,
} from './foliage.js'

/**
 * A point sprite is centred on its position, so to stand ON the ground it
 * has to be lifted half its own height.
 *
 * A ratio rather than a fixed distance, and that is the point: the flat
 * 0.8 world units this replaced was tuned for sprites 1.5 to 4.8 units
 * across, and at the sizes ground cover is now authored in — under one
 * grid cell — the same lift floated every blade of grass a full
 * sprite-width above the terrain.
 */
export const UNDERSTORY_LIFT_RATIO = 0.5

/**
 * Which decision each per-cell hash is for.
 *
 * Every layer and every per-instance property takes its own salt or they
 * correlate — see cellFoliageRolls in foliage.js. Without separate salts
 * the understory and the canopy agree about which cells are populated,
 * and every tree stands in its own patch of grass with bare ground
 * between; without separating scale from offset, every small tree sits at
 * its cell's centre and every large one at the rim.
 */
const SALT = Object.freeze({
  understory: 0,
  canopyVariant: 1,
  canopyScale: 2,
  canopyOffset: 3,
  canopyTint: 4,
})

/**
 * Whether a cell takes a variant, given its own density roll.
 *
 * The threshold is the variant's band density scaled by this cell's
 * lushness and its altitude, so a better-cited section grows more and a
 * cell above the treeline grows less. Shared by both layers because the
 * test is the same one; only the roll and the table differ.
 */
function takesVariant(variant, densityRoll, lushness, height) {
  return densityRoll < variant.density * computeFoliageDensityScale(lushness, height)
}

/**
 * Ground cover, as one position buffer per variant.
 *
 * Grouped by variant IDENTITY, not by kind or colour: two bands can both
 * grow "grass" at different greens and densities, and they are different
 * draw calls with different materials. Insertion order is preserved, so
 * the order the component adds them to the scene is stable across
 * rebuilds of the same world.
 *
 * @param {{ width: number, height: number, heightMap: Float64Array,
 *   biomeMap: Uint8Array, lushnessMap: Float64Array }} terrain
 * @param {number} seed world seed
 * @param {{ projection: object, heightScale: number, cellScale?: number }} options
 * @returns {Array<{ variant: object, count: number, positions: Float32Array }>}
 */
export function scatterUnderstory(terrain, seed, { projection, heightScale, cellScale = 1 }) {
  const { width, height, heightMap, biomeMap, lushnessMap } = terrain
  const stride = FOLIAGE_SAMPLING.understoryStride
  const byVariant = new Map()

  // The border row and column are skipped: a sprite there has no
  // neighbouring cell on one side, so it can sit over the seam between
  // the terrain mesh and nothing.
  for (let gridY = 1; gridY < height - 1; gridY += stride) {
    for (let gridX = 1; gridX < width - 1; gridX += stride) {
      const index = gridY * width + gridX
      const { variantRoll, densityRoll } = cellFoliageRolls(gridX, gridY, seed, SALT.understory)
      const variant = pickUnderstoryVariant(biomeMap[index], variantRoll)
      if (!variant) continue
      if (!takesVariant(variant, densityRoll, lushnessMap[index], heightMap[index])) continue

      const positions = byVariant.get(variant) ?? []
      const lift = variant.size * cellScale * UNDERSTORY_LIFT_RATIO
      const local = projection.toLocal(gridX, gridY, heightMap[index], terrain, heightScale, lift)
      positions.push(local.x, local.y, local.z)
      byVariant.set(variant, positions)
    }
  }

  return [...byVariant].map(([variant, positions]) => ({
    variant,
    count: positions.length / 3,
    positions: new Float32Array(positions),
  }))
}

/**
 * Trees, as one set of instance attributes per archetype.
 *
 * Two passes, because the archetype a cell grows is not known until its
 * altitude has been read, and an InstancedMesh needs its final count at
 * construction. The first pass decides which cells grow what; the second
 * fills the buffers.
 *
 * `normals` are the surface normal each instance stands up along — +Z
 * everywhere on the flat map, and the outward radial on the planet, so a
 * tree on the far side of the globe is not lying on its side. Unit
 * vectors, straight from the projection.
 *
 * @param {{ width: number, height: number, heightMap: Float64Array,
 *   biomeMap: Uint8Array, lushnessMap: Float64Array }} terrain
 * @param {number} seed world seed
 * @param {{ projection: object, heightScale: number, cellScale?: number }} options
 * @returns {Array<{ archetype: string, count: number, positions: Float32Array,
 *   normals: Float32Array, yaws: Float32Array, scales: Float32Array, colors: Float32Array }>}
 */
export function scatterCanopy(terrain, seed, { projection, heightScale, cellScale = 1 }) {
  const { width, height, heightMap, biomeMap, lushnessMap } = terrain
  const stride = FOLIAGE_SAMPLING.canopyStride
  const byArchetype = new Map()

  for (let gridY = 1; gridY < height - 1; gridY += stride) {
    for (let gridX = 1; gridX < width - 1; gridX += stride) {
      const index = gridY * width + gridX
      const { variantRoll, densityRoll } = cellFoliageRolls(gridX, gridY, seed, SALT.canopyVariant)
      const variant = pickCanopyVariant(biomeMap[index], variantRoll)
      if (!variant) continue
      if (!takesVariant(variant, densityRoll, lushnessMap[index], heightMap[index])) continue

      // Altitude substitutes the KIND of tree, not just the count:
      // broadleaf gives way to conifer, conifer to krummholz under the
      // treeline. So which buffer a cell lands in depends on its height.
      const archetype = resolveArchetypeForAltitude(variant.archetype, heightMap[index])
      const cells = byArchetype.get(archetype) ?? []
      cells.push({ gridX, gridY, index, color: variant.color })
      byArchetype.set(archetype, cells)
    }
  }

  const layers = []
  for (const [archetype, cells] of byArchetype) {
    // An archetype the table names but CANOPY_ARCHETYPES does not
    // describe has no geometry to instance, so it is dropped here rather
    // than handed to the component to discover.
    if (!CANOPY_ARCHETYPES[archetype]) continue

    const count = cells.length
    const positions = new Float32Array(count * 3)
    const normals = new Float32Array(count * 3)
    const colors = new Float32Array(count * 3)
    const yaws = new Float32Array(count)
    const scales = new Float32Array(count)

    cells.forEach((cell, instance) => {
      const { variantRoll: scaleRoll, densityRoll: rotationRoll } = cellFoliageRolls(
        cell.gridX,
        cell.gridY,
        seed,
        SALT.canopyScale,
      )
      const { variantRoll: offsetAngleRoll, densityRoll: offsetRadiusRoll } = cellFoliageRolls(
        cell.gridX,
        cell.gridY,
        seed,
        SALT.canopyOffset,
      )
      const { variantRoll: tintRoll } = cellFoliageRolls(cell.gridX, cell.gridY, seed, SALT.canopyTint)
      const transform = canopyInstanceTransform(scaleRoll, rotationRoll, offsetAngleRoll, offsetRadiusRoll)

      // The lateral offset moves the tree off its cell's centre so a wood
      // does not read as an orchard, but the HEIGHT and the normal are
      // still read at the cell itself. Sampling them at the offset
      // position instead would need a bilinear read of the height field,
      // and at up to half a cell of offset the difference is under the
      // width of a trunk.
      const local = projection.toLocal(
        cell.gridX + transform.offsetX,
        cell.gridY + transform.offsetY,
        heightMap[cell.index],
        terrain,
        heightScale,
        0,
      )
      positions[instance * 3] = local.x
      positions[instance * 3 + 1] = local.y
      positions[instance * 3 + 2] = local.z

      const surface = projection.normalAt(cell.gridX, cell.gridY, terrain)
      normals[instance * 3] = surface.x
      normals[instance * 3 + 1] = surface.y
      normals[instance * 3 + 2] = surface.z

      yaws[instance] = transform.yaw
      scales[instance] = transform.scale

      const { r, g, b } = foliageInstanceColor(cell.color, heightMap[cell.index], tintRoll)
      colors[instance * 3] = r
      colors[instance * 3 + 1] = g
      colors[instance * 3 + 2] = b
    })

    layers.push({ archetype, count, positions, normals, yaws, scales, colors })
  }

  return layers
}

/**
 * Both layers in one pass over the rules, for the component that wants
 * the whole scatter and not one half of it.
 *
 * `cellScale` defaults to the projection's own foliage scale: sizes are
 * authored in grid cells against the flat map, and the planet compresses
 * the same relief 5.4x, so a tree sized for the map out-scales the range
 * it stands on there.
 *
 * @param {object} terrain see scatterUnderstory
 * @param {number} seed world seed
 * @param {{ projection: object, heightScale: number, cellScale?: number }} options
 */
export function scatterFoliage(terrain, seed, { projection, heightScale, cellScale }) {
  const scale = cellScale ?? projection.foliageScale ?? 1
  return {
    understory: scatterUnderstory(terrain, seed, { projection, heightScale, cellScale: scale }),
    canopy: scatterCanopy(terrain, seed, { projection, heightScale, cellScale: scale }),
  }
}
