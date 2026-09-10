/**
 * WHERE blobs stand — seeded placement on the lushness grid.
 *
 * Mirrors foliageScatter.js: Three-free attribute buffers grouped by
 * family archetype. The component turns them into InstancedMeshes and
 * updates matrices each frame for roam / hop.
 */
import {
  CREATURE_ARCHETYPES,
  CREATURE_SALT,
  CREATURE_SAMPLING,
  cellCreatureRolls,
  creatureDensityForBiome,
  retuneCreature,
} from './creatures.js'
import { computeCreatureMix, pickFamilyFromMix } from './creatureTaxonomy.js'
import { BIOME } from '../../engine/generation/terrain.js'

/**
 * Bilinear height sample so wanderers stay glued when they leave the
 * home cell centre.
 *
 * @param {Float64Array} heightMap
 * @param {number} width
 * @param {number} height
 * @param {number} x
 * @param {number} y
 * @returns {number}
 */
export function sampleHeight(heightMap, width, height, x, y) {
  const x0 = Math.max(0, Math.min(width - 1, Math.floor(x)))
  const y0 = Math.max(0, Math.min(height - 1, Math.floor(y)))
  const x1 = Math.min(width - 1, x0 + 1)
  const y1 = Math.min(height - 1, y0 + 1)
  const tx = Math.min(1, Math.max(0, x - x0))
  const ty = Math.min(1, Math.max(0, y - y0))
  const h00 = heightMap[y0 * width + x0]
  const h10 = heightMap[y0 * width + x1]
  const h01 = heightMap[y1 * width + x0]
  const h11 = heightMap[y1 * width + x1]
  return h00 * (1 - tx) * (1 - ty) + h10 * tx * (1 - ty) + h01 * (1 - tx) * ty + h11 * tx * ty
}

function inThinningOrder(cells, seed) {
  return cells
    .map((cell) => ({
      cell,
      key: cellCreatureRolls(cell.gridX, cell.gridY, seed, CREATURE_SALT.thinning).a,
    }))
    .sort((a, b) => a.key - b.key || a.cell.index - b.cell.index)
    .map((entry) => entry.cell)
}

/**
 * @param {{ width: number, height: number, heightMap: Float64Array,
 *   biomeMap: Uint8Array }} terrain
 * @param {number} seed
 * @param {string[]} [categories]
 * @param {{ projection: object, heightScale: number, densityScale?: number }} options
 * @returns {Array<{ family: string, archetype: object, count: number,
 *   homes: Float32Array, phases: Float32Array, scales: Float32Array,
 *   squats: Float32Array, gaitSpeeds: Float32Array, hopHeights: Float32Array,
 *   colors: Float32Array, gaits: Uint8Array, biomes: Uint8Array }>}
 */
export function scatterCreatures(terrain, seed, categories = [], { projection, heightScale, densityScale = 1 } = {}) {
  const { width, height, heightMap, biomeMap } = terrain
  const mix = computeCreatureMix(categories)
  const stride = CREATURE_SAMPLING.stride
  const candidates = []

  for (let gridY = 1; gridY < height - 1; gridY += stride) {
    for (let gridX = 1; gridX < width - 1; gridX += stride) {
      const index = gridY * width + gridX
      const biome = biomeMap[index]
      const density = creatureDensityForBiome(biome)
      if (density <= 0) continue

      const { a: spawnRoll, b: familyRoll } = cellCreatureRolls(gridX, gridY, seed, CREATURE_SALT.spawn)
      if (spawnRoll >= density * densityScale) continue

      const family = pickFamilyFromMix(mix, familyRoll)
      candidates.push({ gridX, gridY, index, biome, family })
    }
  }

  const ordered = inThinningOrder(candidates, seed).slice(
    0,
    Math.max(0, Math.round(CREATURE_SAMPLING.maxCount * densityScale)),
  )

  const byFamily = new Map()
  for (const cell of ordered) {
    const list = byFamily.get(cell.family) ?? []
    list.push(cell)
    byFamily.set(cell.family, list)
  }

  const layers = []
  for (const [family, cells] of byFamily) {
    const archetype = CREATURE_ARCHETYPES[family]
    if (!archetype) continue
    const count = cells.length
    const homes = new Float32Array(count * 2)
    const phases = new Float32Array(count)
    const scales = new Float32Array(count)
    const squats = new Float32Array(count)
    const gaitSpeeds = new Float32Array(count)
    const hopHeights = new Float32Array(count)
    const colors = new Float32Array(count * 3)
    const gaits = new Uint8Array(count)
    const biomes = new Uint8Array(count)

    cells.forEach((cell, i) => {
      const retuned = retuneCreature(archetype, cell.biome)
      const { a: phaseRoll } = cellCreatureRolls(cell.gridX, cell.gridY, seed, CREATURE_SALT.phase)
      const { a: scaleRoll } = cellCreatureRolls(cell.gridX, cell.gridY, seed, CREATURE_SALT.scale)

      homes[i * 2] = cell.gridX
      homes[i * 2 + 1] = cell.gridY
      phases[i] = phaseRoll
      scales[i] = retuned.scale * (0.88 + scaleRoll * 0.28)
      squats[i] = retuned.squat
      gaitSpeeds[i] = retuned.gaitSpeed
      hopHeights[i] = retuned.hopHeight
      colors[i * 3] = retuned.colorR
      colors[i * 3 + 1] = retuned.colorG
      colors[i * 3 + 2] = retuned.colorB
      gaits[i] = retuned.gait === 'waddle' ? 1 : 0
      biomes[i] = cell.biome
    })

    layers.push({
      family,
      archetype,
      count,
      homes,
      phases,
      scales,
      squats,
      gaitSpeeds,
      hopHeights,
      colors,
      gaits,
      biomes,
      // Kept so callers can root a static preview without the animate path.
      previewPositions: buildPreviewPositions(cells, heightMap, width, height, projection, heightScale),
    })
  }

  return layers
}

function buildPreviewPositions(cells, heightMap, width, height, projection, heightScale) {
  const positions = new Float32Array(cells.length * 3)
  const terrain = { width, height, heightMap }
  cells.forEach((cell, i) => {
    const h = heightMap[cell.index]
    const local = projection.toLocal(cell.gridX, cell.gridY, h, terrain, heightScale, 0)
    positions[i * 3] = local.x
    positions[i * 3 + 1] = local.y
    positions[i * 3 + 2] = local.z
  })
  return positions
}

/**
 * Total creature count across layers (for tests / quality checks).
 * @param {ReturnType<typeof scatterCreatures>} layers
 */
export function creatureCount(layers) {
  return layers.reduce((sum, layer) => sum + layer.count, 0)
}

// Re-export land biomes that can host life for tests.
export const CREATURE_LAND_BIOMES = Object.freeze([
  BIOME.DUNES,
  BIOME.STEPPE,
  BIOME.LIGHT_VEG,
  BIOME.MEADOW,
  BIOME.WOODLAND,
  BIOME.JUNGLE,
])
