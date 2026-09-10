/**
 * WHERE fauna stand — seeded placement on land and ocean.
 *
 * Candidates pick a topic family from categories, then a Kenney pet that
 * lives in that habitat. Sea pets split by depth: fish stay off the
 * shelf; crabs and penguins hold the shallows (and may stand on beach).
 * Layers are one InstancedMesh per pet id.
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
  KENNEY_PETS,
  SEA_SHORE_PET_IDS,
  petArchetype,
  pickPetForFamily,
  seaSubmerge,
  seaZoneForDepth,
} from './kenneyPets.js'
import { allowSeaCreatures, pageviewDensityScale } from './pageviewDensity.js'
import { BIOME } from '../../engine/generation/terrain.js'
import { BIOME_THRESHOLDS } from '../../engine/generation/config.js'
import { waterDepth } from './waterSurface.js'

/**
 * Whether a sea pet may occupy this biome while wandering.
 * Shore species can stand on the beach; fish stay over ocean only.
 *
 * @param {number} biome
 * @param {string} petId
 */
export function seaPetCanStand(biome, petId) {
  if (isSeaBiome(biome)) return true
  return biome === BIOME.BEACH && SEA_SHORE_PET_IDS.includes(petId)
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

function collectCandidates(terrain, seed, mix, { densityScale, habitat }) {
  const { width, height, biomeMap, heightMap } = terrain
  const stride = habitat === CREATURE_HABITAT.sea ? CREATURE_SAMPLING.seaStride : CREATURE_SAMPLING.stride
  const spawnSalt = habitat === CREATURE_HABITAT.sea ? CREATURE_SALT.seaSpawn : CREATURE_SALT.spawn
  const candidates = []

  for (let gridY = 1; gridY < height - 1; gridY += stride) {
    for (let gridX = 1; gridX < width - 1; gridX += stride) {
      const index = gridY * width + gridX
      const biome = biomeMap[index]
      const sea = isSeaBiome(biome)
      const beach = biome === BIOME.BEACH

      let density = 0
      /** @type {'shore'|'deep'|null} */
      let seaZone = null

      if (habitat === CREATURE_HABITAT.sea) {
        if (sea) {
          density = creatureDensityForBiome(biome)
          seaZone = seaZoneForDepth(waterDepth(heightMap[index]))
        } else if (beach) {
          // Crabs / penguins may stand on the sand; fish never do.
          density = CREATURE_SAMPLING.beachDensity
          seaZone = 'shore'
        } else {
          continue
        }
      } else {
        if (sea) continue
        density = creatureDensityForBiome(biome)
      }

      if (density <= 0) continue

      const { a: spawnRoll, b: familyRoll } = cellCreatureRolls(gridX, gridY, seed, spawnSalt)
      if (spawnRoll >= density * densityScale) continue

      const family = pickFamilyFromMix(mix, familyRoll)
      const { a: petRoll } = cellCreatureRolls(gridX, gridY, seed, CREATURE_SALT.scale)
      const petId = pickPetForFamily(family, habitat, petRoll, seaZone ? { seaZone } : {})
      candidates.push({ gridX, gridY, index, biome, family, habitat, petId, seaZone })
    }
  }

  return candidates
}

function buildLayer(petId, cells, seed, habitat, heightMap, width, height, projection, heightScale) {
  const pet = KENNEY_PETS[petId]
  if (!pet || pet.habitat !== habitat) return null
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
    petId,
    family: cells[0]?.family ?? pet.families[0],
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
    previewPositions: buildPreviewPositions(cells, heightMap, width, height, projection, heightScale, habitat, petId),
  }
}

function buildPreviewPositions(cells, heightMap, width, height, projection, heightScale, habitat, petId) {
  const positions = new Float32Array(cells.length * 3)
  const terrain = { width, height, heightMap }
  const seaLevel = BIOME_THRESHOLDS.oceanMaxHeight
  const submerge = habitat === CREATURE_HABITAT.sea ? seaSubmerge(petId) : 0
  cells.forEach((cell, i) => {
    let h
    if (habitat === CREATURE_HABITAT.sea) {
      // Beach stands on sand; ocean pets stay on the water plane (not the
      // rising floor) so a shallow shelf never lifts them onto the shore.
      h = cell.biome === BIOME.BEACH ? heightMap[cell.index] : seaLevel - submerge
    } else {
      h = heightMap[cell.index]
    }
    const local = projection.toLocal(cell.gridX, cell.gridY, h, terrain, heightScale, 0)
    positions[i * 3] = local.x
    positions[i * 3 + 1] = local.y
    positions[i * 3 + 2] = local.z
  })
  return positions
}

function layersFromCandidates(candidates, seed, habitat, thinningSalt, maxCount, heightMap, width, height, projection, heightScale) {
  const ordered = inThinningOrder(candidates, seed, thinningSalt).slice(0, Math.max(0, maxCount))
  const byPet = new Map()
  for (const cell of ordered) {
    const list = byPet.get(cell.petId) ?? []
    list.push(cell)
    byPet.set(cell.petId, list)
  }

  const layers = []
  for (const [petId, cells] of byPet) {
    const layer = buildLayer(petId, cells, seed, habitat, heightMap, width, height, projection, heightScale)
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
