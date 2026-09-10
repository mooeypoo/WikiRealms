/**
 * Quaternius Cute Fish Pack catalog — which fish swim the oceans, and
 * which topic families prefer them.
 *
 * Runtime GLBs live in `public/assets/quaternius/cute-fish/` (CC0). The
 * raw pack under `models/` is reference only and gitignored; regenerate
 * with `node scripts/convertCuteFish.mjs`.
 *
 * Fauna is water-only: pageviews scale how many fish appear. Land stays
 * clear of animals so the map does not clutter.
 */

import { CREATURE_FAMILY } from './creatureTaxonomy.js'
import { CREATURE_HABITAT } from './creatures.js'

/** Base URL for curated fish GLBs (Vite `public/`). */
export const CUTE_FISH_BASE = '/assets/quaternius/cute-fish'

/**
 * @typedef {{ id: string, file: string, habitat: 'sea',
 *   families: string[], size: 'small'|'medium'|'large'|'huge' }} FishPet
 */

/** @type {Record<string, FishPet>} */
export const FISH_PETS = Object.freeze({
  anglerfish: fish('anglerfish', 'Anglerfish', [CREATURE_FAMILY.science, CREATURE_FAMILY.wanderer], 'large'),
  armoredCatfish: fish('armoredCatfish', 'ArmoredCatfish', [CREATURE_FAMILY.science, CREATURE_FAMILY.nature], 'medium'),
  betta: fish('betta', 'Betta', [CREATURE_FAMILY.arts, CREATURE_FAMILY.nature], 'small'),
  blackLionFish: fish('blackLionFish', 'BlackLionFish', [CREATURE_FAMILY.history, CREATURE_FAMILY.science], 'medium'),
  blobfish: fish('blobfish', 'Blobfish', [CREATURE_FAMILY.science, CREATURE_FAMILY.arts], 'medium'),
  blueGoldfish: fish('blueGoldfish', 'BlueGoldfish', [CREATURE_FAMILY.places, CREATURE_FAMILY.arts], 'small'),
  blueTang: fish('blueTang', 'BlueTang', [CREATURE_FAMILY.nature, CREATURE_FAMILY.science], 'medium'),
  butterflyFish: fish('butterflyFish', 'ButterflyFish', [CREATURE_FAMILY.nature, CREATURE_FAMILY.arts], 'small'),
  cardinalFish: fish('cardinalFish', 'CardinalFish', [CREATURE_FAMILY.nature, CREATURE_FAMILY.places], 'small'),
  clownfish: fish('clownfish', 'Clownfish', [CREATURE_FAMILY.nature, CREATURE_FAMILY.wanderer, CREATURE_FAMILY.arts], 'small'),
  coralGrouper: fish('coralGrouper', 'CoralGrouper', [CREATURE_FAMILY.places, CREATURE_FAMILY.nature], 'medium'),
  cowfish: fish('cowfish', 'Cowfish', [CREATURE_FAMILY.arts, CREATURE_FAMILY.science], 'small'),
  flatfish: fish('flatfish', 'Flatfish', [CREATURE_FAMILY.places, CREATURE_FAMILY.history], 'medium'),
  flowerHorn: fish('flowerHorn', 'FlowerHorn', [CREATURE_FAMILY.arts, CREATURE_FAMILY.places], 'medium'),
  goblinShark: fish('goblinShark', 'GoblinShark', [CREATURE_FAMILY.science, CREATURE_FAMILY.history], 'large'),
  goldfish: fish('goldfish', 'Goldfish', [CREATURE_FAMILY.places, CREATURE_FAMILY.arts, CREATURE_FAMILY.wanderer], 'small'),
  humphead: fish('humphead', 'Humphead', [CREATURE_FAMILY.history, CREATURE_FAMILY.places], 'large'),
  koi: fish('koi', 'Koi', [CREATURE_FAMILY.arts, CREATURE_FAMILY.places, CREATURE_FAMILY.history], 'medium'),
  lionfish: fish('lionfish', 'Lionfish', [CREATURE_FAMILY.nature, CREATURE_FAMILY.sport], 'medium'),
  mandarinFish: fish('mandarinFish', 'MandarinFish', [CREATURE_FAMILY.arts, CREATURE_FAMILY.nature], 'small'),
  moorishIdol: fish('moorishIdol', 'MoorishIdol', [CREATURE_FAMILY.wanderer, CREATURE_FAMILY.arts], 'small'),
  parrotFish: fish('parrotFish', 'ParrotFish', [CREATURE_FAMILY.nature, CREATURE_FAMILY.places], 'medium'),
  piranha: fish('piranha', 'Piranha', [CREATURE_FAMILY.sport, CREATURE_FAMILY.history], 'small'),
  puffer: fish('puffer', 'Puffer', [CREATURE_FAMILY.science, CREATURE_FAMILY.arts], 'medium'),
  redSnapper: fish('redSnapper', 'RedSnapper', [CREATURE_FAMILY.sport, CREATURE_FAMILY.places], 'medium'),
  royalGramma: fish('royalGramma', 'RoyalGramma', [CREATURE_FAMILY.arts, CREATURE_FAMILY.nature], 'small'),
  shark: fish('shark', 'Shark', [CREATURE_FAMILY.history, CREATURE_FAMILY.sport, CREATURE_FAMILY.science], 'huge'),
  sunfish: fish('sunfish', 'Sunfish', [CREATURE_FAMILY.science, CREATURE_FAMILY.wanderer], 'huge'),
  swordfish: fish('swordfish', 'Swordfish', [CREATURE_FAMILY.sport, CREATURE_FAMILY.history], 'huge'),
  tang: fish('tang', 'Tang', [CREATURE_FAMILY.nature, CREATURE_FAMILY.wanderer], 'medium'),
  tetra: fish('tetra', 'Tetra', [CREATURE_FAMILY.nature, CREATURE_FAMILY.science], 'small'),
  tuna: fish('tuna', 'Tuna', [CREATURE_FAMILY.sport, CREATURE_FAMILY.places], 'large'),
  turbot: fish('turbot', 'Turbot', [CREATURE_FAMILY.places, CREATURE_FAMILY.history], 'medium'),
  yellowTang: fish('yellowTang', 'YellowTang', [CREATURE_FAMILY.nature, CREATURE_FAMILY.arts], 'medium'),
  zebraClownFish: fish('zebraClownFish', 'ZebraClownFish', [CREATURE_FAMILY.wanderer, CREATURE_FAMILY.nature], 'small'),
})

/** @deprecated Alias — scatter / assets still import this name in places. */
export const KENNEY_PETS = FISH_PETS

export const FISH_PET_IDS = Object.freeze(Object.keys(FISH_PETS))
export const KENNEY_PET_IDS = FISH_PET_IDS

/** Every pet is a sea fish; land fauna is gone. */
export const SEA_PET_IDS = FISH_PET_IDS
export const LAND_PET_IDS = Object.freeze([])

/**
 * Reef / shelf fish — prefer these in shallows so sharks do not skim the
 * beach. Still all over-water; nothing stands on sand.
 */
export const SEA_SHORE_PET_IDS = Object.freeze(
  FISH_PET_IDS.filter((id) => FISH_PETS[id].size === 'small' || FISH_PETS[id].size === 'medium'),
)

/** Open basin — full catalog including the big ones. */
export const SEA_DEEP_PET_IDS = FISH_PET_IDS

const SIZE_SCALE = Object.freeze({
  small: 3.4,
  medium: 4.4,
  large: 5.8,
  huge: 7.0,
})

const SIZE_SUBMERGE = Object.freeze({
  small: 0.032,
  medium: 0.04,
  large: 0.05,
  huge: 0.058,
})

/**
 * Motion / size profile for a fish. Models are normalised to unit height;
 * `scale` is in grid cells (then multiplied by the projection's foliageScale).
 *
 * @param {FishPet} pet
 */
export function petArchetype(pet) {
  const size = pet.size ?? 'medium'
  return Object.freeze({
    petId: pet.id,
    family: pet.families[0],
    habitat: CREATURE_HABITAT.sea,
    color: 0xffffff,
    squat: 1,
    eyeSize: 0,
    elongate: 1,
    dorsal: false,
    gait: 'breach',
    hopHeight: size === 'huge' || size === 'large' ? 0.45 : 0.32,
    gaitSpeed: size === 'small' ? 0.85 : 0.65,
    scale: SIZE_SCALE[size] ?? SIZE_SCALE.medium,
  })
}

/**
 * How far below the waterline (in heightMap units) a fish's root sits.
 * @param {string} petId
 */
export function seaSubmerge(petId) {
  const size = FISH_PETS[petId]?.size ?? 'medium'
  return SIZE_SUBMERGE[size] ?? SIZE_SUBMERGE.medium
}

/**
 * Shallower than this depth (oceanMaxHeight − floor) is the shelf: prefer
 * smaller reef fish. Matches WATER.opaqueDepth so fauna and the visible
 * shelf agree.
 */
export const SEA_FISH_MIN_DEPTH = 0.08

/**
 * Fish only spawn this deep or deeper — the wet sand / greenwater edge
 * stays clear so schools read as open-ocean, not shoreline clutter.
 */
export const SEA_SPAWN_MIN_DEPTH = 0.11

/**
 * How many cells of pure ocean must surround a spawn (Chebyshev). Keeps
 * homes off the coastline even when depth alone would allow them.
 */
export const SEA_OFFSHORE_CELLS = 5

/**
 * @param {number} depth from waterDepth(height01)
 * @returns {'shore'|'deep'}
 */
export function seaZoneForDepth(depth) {
  return depth < SEA_FISH_MIN_DEPTH ? 'shore' : 'deep'
}

/**
 * Soft family preference over the fish pool, optionally narrowed by sea
 * zone so huge predators stay off the shelf.
 *
 * Preferred fish get a quarter of the roll space; the rest draws from the
 * whole zone pool so seas show many species, not one family's favourites.
 *
 * @param {string} family
 * @param {string} _habitat ignored — fauna is sea-only
 * @param {number} roll 0..1
 * @param {{ seaZone?: 'shore'|'deep' }} [options]
 */
export function pickPetForFamily(family, _habitat, roll, options = {}) {
  let all = SEA_PET_IDS
  if (options.seaZone === 'shore') all = SEA_SHORE_PET_IDS
  else if (options.seaZone === 'deep') all = SEA_DEEP_PET_IDS

  const preferred = all.filter((id) => FISH_PETS[id].families.includes(family))
  const t = Math.min(0.999999, Math.max(0, roll))

  if (preferred.length > 0 && t < 0.25) {
    return preferred[Math.floor((t / 0.25) * preferred.length)]
  }

  const u = preferred.length > 0 ? (t - 0.25) / 0.75 : t
  return all[Math.floor(u * all.length)]
}

/**
 * @param {string} family
 * @param {string} [_habitat]
 * @returns {string[]}
 */
export function petsForFamily(family, _habitat) {
  const preferred = SEA_PET_IDS.filter((id) => FISH_PETS[id].families.includes(family))
  return preferred.length > 0 ? preferred : [...SEA_PET_IDS]
}

/**
 * @param {string} id
 * @param {string} file basename without extension
 * @param {string[]} families
 * @param {'small'|'medium'|'large'|'huge'} size
 */
function fish(id, file, families, size) {
  return Object.freeze({
    id,
    file: `${file}.glb`,
    habitat: CREATURE_HABITAT.sea,
    families: Object.freeze([...families]),
    size,
  })
}
