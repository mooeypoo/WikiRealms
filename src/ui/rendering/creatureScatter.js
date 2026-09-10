/**
 * WHERE fish swim — seeded placement on ocean cells only.
 *
 * Categories pick a topic family, then a Cute Fish Pack species that
 * fits that family. Shelf vs deep splits the pool so sharks stay off the
 * shallows. Layers are one InstancedMesh per fish id. Pageviews scale
 * how many appear; land stays empty.
 */
import {
  CREATURE_HABITAT,
  CREATURE_SALT,
  CREATURE_SAMPLING,
  cellCreatureRolls,
  creatureDensityForBiome,
  gaitCode,
  isSeaBiome,
  retuneCreature,
} from './creatures.js'
import { computeCreatureMix, pickFamilyFromMix } from './creatureTaxonomy.js'
import {
  FISH_PETS,
  SEA_OFFSHORE_CELLS,
  SEA_SPAWN_MIN_DEPTH,
  petArchetype,
  pickPetForFamily,
  seaSubmerge,
  seaZoneForDepth,
} from './kenneyPets.js'
import { pageviewDensityScale } from './pageviewDensity.js'
import { BIOME_THRESHOLDS } from '../../engine/generation/config.js'
import { waterDepth } from './waterSurface.js'
import { BIOME } from '../../engine/generation/terrain.js'

/**
 * Whether a fish may occupy this biome while wandering.
 * Fish stay over ocean only — no beach standers.
 *
 * @param {number} biome
 * @param {string} [_petId]
 */
export function seaPetCanStand(biome, _petId) {
  return isSeaBiome(biome)
}

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

/**
 * Whether a cell is far enough from land to host a fish home.
 *
 * @param {Uint8Array} biomeMap
 * @param {number} width
 * @param {number} height
 * @param {number} gridX
 * @param {number} gridY
 * @param {number} [radius]
 */
export function isOffshoreOcean(biomeMap, width, height, gridX, gridY, radius = SEA_OFFSHORE_CELLS) {
  const r = Math.max(0, Math.round(radius))
  for (let dy = -r; dy <= r; dy += 1) {
    for (let dx = -r; dx <= r; dx += 1) {
      const x = gridX + dx
      const y = gridY + dy
      if (x < 0 || x >= width || y < 0 || y >= height) return false
      if (!isSeaBiome(biomeMap[y * width + x])) return false
    }
  }
  return true
}

function collectSeaCandidates(terrain, seed, mix, densityScale) {
  const { width, height, biomeMap, heightMap } = terrain
  const stride = CREATURE_SAMPLING.seaStride
  const candidates = []

  for (let gridY = 1; gridY < height - 1; gridY += stride) {
    for (let gridX = 1; gridX < width - 1; gridX += stride) {
      const index = gridY * width + gridX
      if (!isSeaBiome(biomeMap[index])) continue

      const depth = waterDepth(heightMap[index])
      if (depth < SEA_SPAWN_MIN_DEPTH) continue
      if (!isOffshoreOcean(biomeMap, width, height, gridX, gridY)) continue

      const density = creatureDensityForBiome(BIOME.OCEAN)
      if (density <= 0) continue

      const { a: spawnRoll, b: familyRoll } = cellCreatureRolls(gridX, gridY, seed, CREATURE_SALT.seaSpawn)
      if (spawnRoll >= density * densityScale) continue

      const seaZone = seaZoneForDepth(depth)
      const family = pickFamilyFromMix(mix, familyRoll)
      const { a: petRoll } = cellCreatureRolls(gridX, gridY, seed, CREATURE_SALT.scale)
      const petId = pickPetForFamily(family, CREATURE_HABITAT.sea, petRoll, { seaZone })
      candidates.push({
        gridX,
        gridY,
        index,
        biome: biomeMap[index],
        family,
        habitat: CREATURE_HABITAT.sea,
        petId,
        seaZone,
      })
    }
  }

  return candidates
}

function buildLayer(petId, cells, seed, heightMap, width, height, projection, heightScale) {
  const pet = FISH_PETS[petId]
  if (!pet) return null
  const archetype = petArchetype(pet)
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
    const { a: bounceRoll, b: tempoRoll } = cellCreatureRolls(cell.gridX, cell.gridY, seed, CREATURE_SALT.wander)

    homes[i * 2] = cell.gridX
    homes[i * 2 + 1] = cell.gridY
    phases[i] = phaseRoll
    scales[i] = retuned.scale * (0.88 + scaleRoll * 0.28)
    squats[i] = retuned.squat
    elongates[i] = retuned.elongate
    gaitSpeeds[i] = retuned.gaitSpeed * (0.7 + tempoRoll * 0.55)
    hopHeights[i] = retuned.hopHeight * (0.4 + bounceRoll * 0.7)
    colors[i * 3] = retuned.colorR
    colors[i * 3 + 1] = retuned.colorG
    colors[i * 3 + 2] = retuned.colorB
    gaits[i] = gaitCode(retuned.gait)
    biomes[i] = cell.biome
  })

  return {
    petId,
    family: cells[0]?.family ?? pet.families[0],
    habitat: CREATURE_HABITAT.sea,
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
    previewPositions: buildPreviewPositions(cells, heightMap, width, height, projection, heightScale, petId),
  }
}

function buildPreviewPositions(cells, heightMap, width, height, projection, heightScale, petId) {
  const positions = new Float32Array(cells.length * 3)
  const terrain = { width, height, heightMap }
  const seaLevel = BIOME_THRESHOLDS.oceanMaxHeight
  const submerge = seaSubmerge(petId)
  cells.forEach((cell, i) => {
    const h = seaLevel - submerge
    const local = projection.toLocal(cell.gridX, cell.gridY, h, terrain, heightScale, 0)
    positions[i * 3] = local.x
    positions[i * 3 + 1] = local.y
    positions[i * 3 + 2] = local.z
  })
  return positions
}

function layersFromCandidates(candidates, seed, maxCount, heightMap, width, height, projection, heightScale) {
  const ordered = inThinningOrder(candidates, seed, CREATURE_SALT.seaThinning).slice(0, Math.max(0, maxCount))
  const byPet = new Map()
  for (const cell of ordered) {
    const list = byPet.get(cell.petId) ?? []
    list.push(cell)
    byPet.set(cell.petId, list)
  }

  const layers = []
  for (const [petId, cells] of byPet) {
    const layer = buildLayer(petId, cells, seed, heightMap, width, height, projection, heightScale)
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

  const seaCandidates = collectSeaCandidates(terrain, seed, mix, effectiveDensity)
  return layersFromCandidates(
    seaCandidates,
    seed,
    Math.round(CREATURE_SAMPLING.maxSea * effectiveDensity),
    heightMap,
    width,
    height,
    projection,
    heightScale,
  )
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

export const CREATURE_LAND_BIOMES = Object.freeze([])

export const CREATURE_SEA_BIOMES = Object.freeze([BIOME.OCEAN])
