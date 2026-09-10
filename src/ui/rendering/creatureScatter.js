/**
 * WHERE blobs stand — seeded placement on land and ocean.
 *
 * Mirrors foliageScatter.js: Three-free attribute buffers grouped by
 * family + habitat. The component turns them into InstancedMeshes and
 * updates matrices each frame for roam / hop / breach.
 */
import {
  CREATURE_HABITAT,
  CREATURE_SALT,
  CREATURE_SAMPLING,
  archetypeFor,
  cellCreatureRolls,
  creatureDensityForBiome,
  gaitCode,
  isSeaBiome,
  retuneCreature,
} from './creatures.js'
import { computeCreatureMix, pickFamilyFromMix } from './creatureTaxonomy.js'
import { allowSeaCreatures, pageviewDensityScale } from './pageviewDensity.js'
import { BIOME } from '../../engine/generation/terrain.js'
import { BIOME_THRESHOLDS } from '../../engine/generation/config.js'

/**
 * Bilinear height sample so wanderers stay glued when they leave the
 * home cell centre.
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

function inThinningOrder(cells, seed, salt) {
  return cells
    .map((cell) => ({
      cell,
      key: cellCreatureRolls(cell.gridX, cell.gridY, seed, salt).a,
    }))
    .sort((a, b) => a.key - b.key || a.cell.index - b.cell.index)
    .map((entry) => entry.cell)
}

function collectCandidates(terrain, seed, mix, { densityScale, habitat }) {
  const { width, height, biomeMap } = terrain
  const stride = habitat === CREATURE_HABITAT.sea ? CREATURE_SAMPLING.seaStride : CREATURE_SAMPLING.stride
  const spawnSalt = habitat === CREATURE_HABITAT.sea ? CREATURE_SALT.seaSpawn : CREATURE_SALT.spawn
  const candidates = []

  for (let gridY = 1; gridY < height - 1; gridY += stride) {
    for (let gridX = 1; gridX < width - 1; gridX += stride) {
      const index = gridY * width + gridX
      const biome = biomeMap[index]
      const sea = isSeaBiome(biome)
      if (habitat === CREATURE_HABITAT.sea && !sea) continue
      if (habitat === CREATURE_HABITAT.land && sea) continue

      const density = creatureDensityForBiome(biome)
      if (density <= 0) continue

      const { a: spawnRoll, b: familyRoll } = cellCreatureRolls(gridX, gridY, seed, spawnSalt)
      if (spawnRoll >= density * densityScale) continue

      const family = pickFamilyFromMix(mix, familyRoll)
      candidates.push({ gridX, gridY, index, biome, family, habitat })
    }
  }

  return candidates
}

function buildLayer(family, cells, seed, habitat, heightMap, width, height, projection, heightScale) {
  const archetype = archetypeFor(family, habitat)
  if (!archetype) return null
  const count = cells.length
  const homes = new Float32Array(count * 2)
  const phases = new Float32Array(count)
  const scales = new Float32Array(count)
  const squats = new Float32Array(count)
  const elongates = new Float32Array(count)
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
    elongates[i] = retuned.elongate
    gaitSpeeds[i] = retuned.gaitSpeed
    hopHeights[i] = retuned.hopHeight
    colors[i * 3] = retuned.colorR
    colors[i * 3 + 1] = retuned.colorG
    colors[i * 3 + 2] = retuned.colorB
    gaits[i] = gaitCode(retuned.gait)
    biomes[i] = cell.biome
  })

  return {
    family,
    habitat,
    archetype,
    count,
    homes,
    phases,
    scales,
    squats,
    elongates,
    gaitSpeeds,
    hopHeights,
    colors,
    gaits,
    biomes,
    previewPositions: buildPreviewPositions(cells, heightMap, width, height, projection, heightScale, habitat),
  }
}

function buildPreviewPositions(cells, heightMap, width, height, projection, heightScale, habitat) {
  const positions = new Float32Array(cells.length * 3)
  const terrain = { width, height, heightMap }
  const seaLevel = BIOME_THRESHOLDS.oceanMaxHeight
  cells.forEach((cell, i) => {
    const h = habitat === CREATURE_HABITAT.sea ? seaLevel : heightMap[cell.index]
    const local = projection.toLocal(cell.gridX, cell.gridY, h, terrain, heightScale, 0)
    positions[i * 3] = local.x
    positions[i * 3 + 1] = local.y
    positions[i * 3 + 2] = local.z
  })
  return positions
}

function layersFromCandidates(candidates, seed, habitat, thinningSalt, maxCount, heightMap, width, height, projection, heightScale) {
  const ordered = inThinningOrder(candidates, seed, thinningSalt).slice(0, Math.max(0, maxCount))
  const byFamily = new Map()
  for (const cell of ordered) {
    const list = byFamily.get(cell.family) ?? []
    list.push(cell)
    byFamily.set(cell.family, list)
  }

  const layers = []
  for (const [family, cells] of byFamily) {
    const layer = buildLayer(family, cells, seed, habitat, heightMap, width, height, projection, heightScale)
    if (layer) layers.push(layer)
  }
  return layers
}

/**
 * @param {{ width: number, height: number, heightMap: Float64Array,
 *   biomeMap: Uint8Array }} terrain
 * @param {number} seed
 * @param {string[]} [categories]
 * @param {{ projection: object, heightScale: number, densityScale?: number,
 *   pageviews?: number|null }} options
 */
export function scatterCreatures(
  terrain,
  seed,
  categories = [],
  { projection, heightScale, densityScale = 1, pageviews = null } = {},
) {
  const { width, height, heightMap } = terrain
  const mix = computeCreatureMix(categories)
  const popularity = pageviewDensityScale(pageviews)
  const effectiveDensity = densityScale * popularity

  const landCandidates = collectCandidates(terrain, seed, mix, {
    densityScale: effectiveDensity,
    habitat: CREATURE_HABITAT.land,
  })
  const seaCandidates = allowSeaCreatures(pageviews, popularity)
    ? collectCandidates(terrain, seed, mix, {
        densityScale: effectiveDensity,
        habitat: CREATURE_HABITAT.sea,
      })
    : []

  const landLayers = layersFromCandidates(
    landCandidates,
    seed,
    CREATURE_HABITAT.land,
    CREATURE_SALT.thinning,
    Math.round(CREATURE_SAMPLING.maxLand * effectiveDensity),
    heightMap,
    width,
    height,
    projection,
    heightScale,
  )
  const seaLayers = layersFromCandidates(
    seaCandidates,
    seed,
    CREATURE_HABITAT.sea,
    CREATURE_SALT.seaThinning,
    Math.round(CREATURE_SAMPLING.maxSea * effectiveDensity),
    heightMap,
    width,
    height,
    projection,
    heightScale,
  )

  return [...landLayers, ...seaLayers]
}

/**
 * Total creature count across layers (for tests / quality checks).
 * @param {ReturnType<typeof scatterCreatures>} layers
 */
export function creatureCount(layers) {
  return layers.reduce((sum, layer) => sum + layer.count, 0)
}

export function creatureCountByHabitat(layers) {
  let land = 0
  let sea = 0
  for (const layer of layers) {
    if (layer.habitat === CREATURE_HABITAT.sea) sea += layer.count
    else land += layer.count
  }
  return { land, sea }
}

export const CREATURE_LAND_BIOMES = Object.freeze([
  BIOME.DUNES,
  BIOME.STEPPE,
  BIOME.LIGHT_VEG,
  BIOME.MEADOW,
  BIOME.WOODLAND,
  BIOME.JUNGLE,
])

export const CREATURE_SEA_BIOMES = Object.freeze([BIOME.OCEAN])
