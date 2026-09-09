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
  UNDERSTORY_JITTER,
  canopyInstanceTransform,
  cellFoliageRolls,
  FOLIAGE_DENSITY,
  computeFoliageDensityScale,
  foliageTintColor,
  pickCanopyVariant,
  pickUnderstoryVariant,
  resolveArchetypeForAltitude,
  understoryInstanceTransform,
} from './foliage.js'

/**
 * Which decision each per-cell hash is for.
 *
 * Every layer and every per-instance property takes its own salt or they
 * correlate — see cellFoliageRolls in foliage.js. Without separate salts
 * the understory and the canopy agree about which cells are populated,
 * and every tree stands in its own patch of grass with bare ground
 * between; without separating scale from offset, every small tree sits at
 * its cell's centre and every large one at the rim.
 *
 * The understory's three new salts are appended rather than slotted in
 * beside its old one, because a salt IS the identity of a decision: the
 * placement roll has to keep reading 0 or every world's ground cover
 * moves. Which cells grow what is unchanged by giving each clump a size
 * and a bearing.
 */
const SALT = Object.freeze({
  understory: 0,
  canopyVariant: 1,
  canopyScale: 2,
  canopyOffset: 3,
  canopyTint: 4,
  understoryScale: 5,
  understoryOffset: 6,
  understoryTint: 7,
  thinning: 8,
})

/**
 * Puts a layer's cells in a deterministic random order.
 *
 * WHY THE ORDER OF INSTANCES MATTERS
 *
 * An InstancedMesh draws the FIRST `count` of its instances, and that is
 * the whole mechanism behind distance thinning: lower the count and the
 * rest stop costing anything, with no rebuild and no second buffer.
 *
 * Which makes the order load-bearing. Cells arrive here in scan order,
 * so truncating that count would strip the world from the bottom up —
 * the far half of the map would simply have no vegetation. Sorted by a
 * hash, any prefix is a spatially uniform sample of the whole layer, so
 * thinning reads as ground cover growing sparser everywhere.
 *
 * The hash takes its own salt: reusing the placement roll would mean the
 * cells that survive thinning are the ones that were most likely to grow
 * something, which correlates density with survival and thins the sparse
 * bands to nothing first.
 *
 * Ties are broken by cell index so the order is total, not merely
 * mostly-determined — two cells sharing a roll must not depend on the
 * sort's stability for their order.
 */
function inThinningOrder(cells, seed) {
  return cells
    .map((cell) => ({
      cell,
      key: cellFoliageRolls(cell.gridX, cell.gridY, seed, SALT.thinning).variantRoll,
    }))
    .sort((a, b) => a.key - b.key || a.cell.index - b.cell.index)
    .map((entry) => entry.cell)
}

/**
 * Whether a cell takes a variant, given its own density roll.
 *
 * The threshold is the variant's band density scaled by this cell's
 * lushness and its altitude, so a better-cited section grows more and a
 * cell above the treeline grows less. Shared by both layers because the
 * test is the same one; the roll, the table and the lushness curve
 * differ — see FOLIAGE_DENSITY for why the canopy answers to lushness
 * more steeply than the ground does.
 */
function takesVariant(variant, densityRoll, lushness, height, curve) {
  return densityRoll < variant.density * computeFoliageDensityScale(lushness, height, curve)
}

/**
 * Ground cover, as one set of instance attributes per variant.
 *
 * Grouped by variant IDENTITY, not by kind or colour: two bands can both
 * grow "grass" at different greens and densities, and they are different
 * draw calls with different materials. Insertion order is preserved, so
 * the order the component adds them to the scene is stable across
 * rebuilds of the same world.
 *
 * This used to emit positions alone, because a clump of ground cover was
 * a point sprite and a sprite has no orientation to describe — it faced
 * the camera whatever the ground did. Now it is real geometry, so it
 * needs everything a tree needs: the normal to stand up along, a bearing
 * so a field is not a comb, a size, and its altitude for frost. The one
 * thing it no longer needs is a lift off the ground, which existed only
 * because a sprite is centred on its position rather than rooted at it.
 *
 * It takes no cellScale, where scatterCanopy does. Nothing here is
 * measured in world units any more: the clump's own size is applied when
 * its geometry is built, and its lateral offset is in grid cells, which
 * both projections agree on. The scale used to be needed for the sprite
 * lift alone.
 *
 * @param {{ width: number, height: number, heightMap: Float64Array,
 *   biomeMap: Uint8Array, lushnessMap: Float64Array }} terrain
 * @param {number} seed world seed
 * @param {{ projection: object, heightScale: number }} options
 * @returns {Array<{ variant: object, count: number, positions: Float32Array,
 *   normals: Float32Array, yaws: Float32Array, scales: Float32Array,
 *   colors: Float32Array, heights: Float32Array }>}
 */
export function scatterUnderstory(terrain, seed, { projection, heightScale, skyVisibility, sunlightMap }) {
  const { width, height, heightMap, biomeMap, lushnessMap } = terrain
  const stride = FOLIAGE_SAMPLING.understoryStride
  const byVariant = new Map()

  // The border row and column are skipped: a clump there has no
  // neighbouring cell on one side, so it can sit over the seam between
  // the terrain mesh and nothing.
  for (let gridY = 1; gridY < height - 1; gridY += stride) {
    for (let gridX = 1; gridX < width - 1; gridX += stride) {
      const index = gridY * width + gridX
      const { variantRoll, densityRoll } = cellFoliageRolls(gridX, gridY, seed, SALT.understory)
      const variant = pickUnderstoryVariant(biomeMap[index], variantRoll)
      if (!variant) continue
      if (!takesVariant(variant, densityRoll, lushnessMap[index], heightMap[index], FOLIAGE_DENSITY.understory))
        continue

      const cells = byVariant.get(variant) ?? []
      cells.push({ gridX, gridY, index })
      byVariant.set(variant, cells)
    }
  }

  return [...byVariant].map(([variant, unordered]) => {
    const cells = inThinningOrder(unordered, seed)
    const count = cells.length
    const positions = new Float32Array(count * 3)
    const normals = new Float32Array(count * 3)
    const colors = new Float32Array(count * 3)
    const yaws = new Float32Array(count)
    const scales = new Float32Array(count)
    const heights = new Float32Array(count)
    const occlusions = fullyLitBuffer(count)
    const sunlights = fullyLitBuffer(count)

    cells.forEach((cell, instance) => {
      const { variantRoll: scaleRoll, densityRoll: rotationRoll } = cellFoliageRolls(
        cell.gridX,
        cell.gridY,
        seed,
        SALT.understoryScale,
      )
      const { variantRoll: offsetAngleRoll, densityRoll: offsetRadiusRoll } = cellFoliageRolls(
        cell.gridX,
        cell.gridY,
        seed,
        SALT.understoryOffset,
      )
      const { variantRoll: tintRoll } = cellFoliageRolls(cell.gridX, cell.gridY, seed, SALT.understoryTint)
      const transform = understoryInstanceTransform(scaleRoll, rotationRoll, offsetAngleRoll, offsetRadiusRoll)

      // Height and normal are read at the CELL, while the clump itself
      // sits at the offset — the same trade the canopy makes, and for
      // the same reason: reading them at the offset needs a bilinear
      // sample of the height field, and across half a cell the
      // difference is smaller than a blade is wide.
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

      const { r, g, b } = foliageTintColor(variant.color, tintRoll, UNDERSTORY_JITTER)
      colors[instance * 3] = r
      colors[instance * 3 + 1] = g
      colors[instance * 3 + 2] = b

      heights[instance] = heightMap[cell.index]
      if (skyVisibility) occlusions[instance] = skyVisibility[cell.index]
      if (sunlightMap) sunlights[instance] = sunlightMap[cell.index]
    })

    return { variant, count, positions, normals, yaws, scales, colors, heights, occlusions, sunlights }
  })
}

/**
 * A per-instance light buffer, filled with "fully lit" — sees the whole
 * sky, and the sun reaches it.
 *
 * The default matters: a caller with neither map — every test here, and
 * any future one — must get plants lit exactly as before rather than
 * plants lit by no sky at all, or standing in permanent night.
 */
function fullyLitBuffer(count) {
  return new Float32Array(count).fill(1)
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
export function scatterCanopy(terrain, seed, { projection, heightScale, cellScale = 1, skyVisibility, sunlightMap }) {
  const { width, height, heightMap, biomeMap, lushnessMap } = terrain
  const stride = FOLIAGE_SAMPLING.canopyStride
  const byArchetype = new Map()

  for (let gridY = 1; gridY < height - 1; gridY += stride) {
    for (let gridX = 1; gridX < width - 1; gridX += stride) {
      const index = gridY * width + gridX
      const { variantRoll, densityRoll } = cellFoliageRolls(gridX, gridY, seed, SALT.canopyVariant)
      const variant = pickCanopyVariant(biomeMap[index], variantRoll)
      if (!variant) continue
      if (!takesVariant(variant, densityRoll, lushnessMap[index], heightMap[index], FOLIAGE_DENSITY.canopy))
        continue

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
  for (const [archetype, unordered] of byArchetype) {
    const cells = inThinningOrder(unordered, seed)
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
    // How high each tree stands, in the same [0, 1] the height map uses.
    // Emitted rather than folded into the colour so a shader can decide
    // how much snow lies on which of its surfaces, and so a snowline can
    // move without any of this being recomputed.
    const heights = new Float32Array(count)
    const occlusions = fullyLitBuffer(count)
    const sunlights = fullyLitBuffer(count)

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

      const { r, g, b } = foliageTintColor(cell.color, tintRoll)
      colors[instance * 3] = r
      colors[instance * 3 + 1] = g
      colors[instance * 3 + 2] = b

      heights[instance] = heightMap[cell.index]
      if (skyVisibility) occlusions[instance] = skyVisibility[cell.index]
      if (sunlightMap) sunlights[instance] = sunlightMap[cell.index]
    })

    layers.push({ archetype, count, positions, normals, yaws, scales, colors, heights, occlusions, sunlights })
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
 * `skyVisibility` is the occlusion map for the same terrain, if the
 * caller has one. A plant is lit by the sky its own cell can see, which
 * is what keeps a stand of trees in a ravine as dark as the ravine —
 * without it the ground darkens and the vegetation standing on it does
 * not, and the trees read as cut out and laid on top.
 *
 * `sunlightMap` is the cast-shadow map for the same terrain, and is here
 * for the same reason at a larger scale: a hillside in the shadow of the
 * range behind it goes dark, and a stand of trees on that hillside that
 * did not would be the brightest thing in the shot.
 *
 * @param {object} terrain see scatterUnderstory
 * @param {number} seed world seed
 * @param {{ projection: object, heightScale: number, cellScale?: number,
 *   skyVisibility?: Float32Array, sunlightMap?: Float32Array }} options
 */
export function scatterFoliage(terrain, seed, { projection, heightScale, cellScale, skyVisibility, sunlightMap }) {
  const scale = cellScale ?? projection.foliageScale ?? 1
  return {
    understory: scatterUnderstory(terrain, seed, { projection, heightScale, skyVisibility, sunlightMap }),
    canopy: scatterCanopy(terrain, seed, {
      projection, heightScale, cellScale: scale, skyVisibility, sunlightMap,
    }),
  }
}
