/**
 * Kenney Cube Pets catalog — which animals exist, where they live, and
 * which topic families prefer them.
 *
 * Assets live in `public/assets/kenney/cube-pets/` (CC0). The raw packs
 * under `models/` are reference only and gitignored.
 *
 * Sea vs land is mostly a hard split: fish never leave the ocean, and
 * land pets never spawn in water. Crabs and penguins hold the shelf and
 * may stand on the beach.
 */

import { CREATURE_FAMILY } from './creatureTaxonomy.js'
import { CREATURE_HABITAT } from './creatures.js'

/** Base URL for curated Cube Pets GLBs (Vite `public/`). */
export const CUBE_PETS_BASE = '/assets/kenney/cube-pets'

/**
 * @typedef {{ id: string, file: string, habitat: 'land'|'sea',
 *   families: string[] }} KenneyPet
 */

/** @type {Record<string, KenneyPet>} */
export const KENNEY_PETS = Object.freeze({
  beaver: pet('beaver', 'land', [CREATURE_FAMILY.nature, CREATURE_FAMILY.places]),
  bee: pet('bee', 'land', [CREATURE_FAMILY.nature, CREATURE_FAMILY.science]),
  bunny: pet('bunny', 'land', [CREATURE_FAMILY.nature, CREATURE_FAMILY.arts, CREATURE_FAMILY.wanderer]),
  caterpillar: pet('caterpillar', 'land', [CREATURE_FAMILY.nature, CREATURE_FAMILY.science]),
  cat: pet('cat', 'land', [CREATURE_FAMILY.arts, CREATURE_FAMILY.wanderer, CREATURE_FAMILY.places]),
  chick: pet('chick', 'land', [CREATURE_FAMILY.nature, CREATURE_FAMILY.sport]),
  cow: pet('cow', 'land', [CREATURE_FAMILY.places, CREATURE_FAMILY.history]),
  crab: pet('crab', 'sea', [CREATURE_FAMILY.nature, CREATURE_FAMILY.science, CREATURE_FAMILY.places]),
  deer: pet('deer', 'land', [CREATURE_FAMILY.nature, CREATURE_FAMILY.places, CREATURE_FAMILY.history]),
  dog: pet('dog', 'land', [CREATURE_FAMILY.sport, CREATURE_FAMILY.wanderer, CREATURE_FAMILY.arts]),
  elephant: pet('elephant', 'land', [CREATURE_FAMILY.history, CREATURE_FAMILY.places, CREATURE_FAMILY.nature]),
  fish: pet('fish', 'sea', [CREATURE_FAMILY.nature, CREATURE_FAMILY.science, CREATURE_FAMILY.arts, CREATURE_FAMILY.wanderer]),
  fox: pet('fox', 'land', [CREATURE_FAMILY.nature, CREATURE_FAMILY.places, CREATURE_FAMILY.wanderer]),
  giraffe: pet('giraffe', 'land', [CREATURE_FAMILY.nature, CREATURE_FAMILY.places]),
  hog: pet('hog', 'land', [CREATURE_FAMILY.nature, CREATURE_FAMILY.sport]),
  koala: pet('koala', 'land', [CREATURE_FAMILY.nature, CREATURE_FAMILY.places]),
  lion: pet('lion', 'land', [CREATURE_FAMILY.history, CREATURE_FAMILY.arts, CREATURE_FAMILY.sport]),
  monkey: pet('monkey', 'land', [CREATURE_FAMILY.nature, CREATURE_FAMILY.arts, CREATURE_FAMILY.sport]),
  panda: pet('panda', 'land', [CREATURE_FAMILY.nature, CREATURE_FAMILY.places]),
  parrot: pet('parrot', 'land', [CREATURE_FAMILY.arts, CREATURE_FAMILY.nature]),
  penguin: pet('penguin', 'sea', [CREATURE_FAMILY.nature, CREATURE_FAMILY.places, CREATURE_FAMILY.science, CREATURE_FAMILY.wanderer]),
  pig: pet('pig', 'land', [CREATURE_FAMILY.places, CREATURE_FAMILY.nature]),
  polar: pet('polar', 'land', [CREATURE_FAMILY.places, CREATURE_FAMILY.science, CREATURE_FAMILY.nature]),
  tiger: pet('tiger', 'land', [CREATURE_FAMILY.nature, CREATURE_FAMILY.history, CREATURE_FAMILY.sport]),
})

export const KENNEY_PET_IDS = Object.freeze(Object.keys(KENNEY_PETS))

export const LAND_PET_IDS = Object.freeze(KENNEY_PET_IDS.filter((id) => KENNEY_PETS[id].habitat === CREATURE_HABITAT.land))
export const SEA_PET_IDS = Object.freeze(KENNEY_PET_IDS.filter((id) => KENNEY_PETS[id].habitat === CREATURE_HABITAT.sea))

/** Near the waterline / beach — can climb ashore; never fish. */
export const SEA_SHORE_PET_IDS = Object.freeze(['crab', 'penguin'])

/** Deeper basin — fish belong here; penguins may still cruise. */
export const SEA_DEEP_PET_IDS = Object.freeze(['fish', 'penguin'])

/**
 * Motion / size profile for a pet. Models are normalised to unit height;
 * `scale` is in grid cells (then multiplied by the projection's foliageScale).
 *
 * Sized to read from default orbit — small enough to stay accents, large
 * enough not to vanish into fleas again.
 *
 * @param {KenneyPet} pet
 */
export function petArchetype(pet) {
  const sea = pet.habitat === CREATURE_HABITAT.sea
  return Object.freeze({
    petId: pet.id,
    family: pet.families[0],
    habitat: pet.habitat,
    color: 0xffffff,
    squat: 1,
    eyeSize: 0,
    elongate: 1,
    dorsal: false,
    gait: sea ? 'breach' : 'hop',
    hopHeight: sea ? 0.38 : 0.32,
    gaitSpeed: sea ? 0.7 : 0.85,
    scale: sea ? 5.2 : 4.8,
  })
}

/**
 * How far below the waterline (in heightMap units) a sea pet's root sits.
 * Fish hang deeper; shore pets skim just under so they stay visible.
 */
export function seaSubmerge(petId) {
  return petId === 'fish' ? 0.045 : 0.012
}

/**
 * Shallower than this depth (oceanMaxHeight − floor) is the shelf: crabs
 * and penguins only. Matches WATER.opaqueDepth so fauna and the visible
 * shelf agree.
 */
export const SEA_FISH_MIN_DEPTH = 0.08

/**
 * @param {number} depth from waterDepth(height01)
 * @returns {'shore'|'deep'}
 */
export function seaZoneForDepth(depth) {
  return depth < SEA_FISH_MIN_DEPTH ? 'shore' : 'deep'
}

/**
 * Soft family preference over the habitat pool, optionally narrowed by
 * sea zone so fish stay off the shelf.
 *
 * Preferred pets get half the roll space so a physics article still leans
 * science-ish, but the other half draws from every land (or sea) pet —
 * otherwise Einstein is almost only polar / bee / caterpillar.
 *
 * @param {string} family
 * @param {string} habitat
 * @param {number} roll 0..1
 * @param {{ seaZone?: 'shore'|'deep' }} [options]
 */
export function pickPetForFamily(family, habitat, roll, options = {}) {
  let all = habitat === CREATURE_HABITAT.sea ? SEA_PET_IDS : LAND_PET_IDS
  if (habitat === CREATURE_HABITAT.sea && options.seaZone === 'shore') {
    all = SEA_SHORE_PET_IDS
  } else if (habitat === CREATURE_HABITAT.sea && options.seaZone === 'deep') {
    all = SEA_DEEP_PET_IDS
  }
  const preferred = all.filter((id) => KENNEY_PETS[id].families.includes(family))
  const t = Math.min(0.999999, Math.max(0, roll))

  if (preferred.length > 0 && t < 0.5) {
    return preferred[Math.floor(t * 2 * preferred.length)]
  }

  const u = preferred.length > 0 ? (t - 0.5) * 2 : t
  return all[Math.floor(u * all.length)]
}

/**
 * @param {string} family
 * @param {string} habitat
 * @returns {string[]}
 */
export function petsForFamily(family, habitat) {
  const all = habitat === CREATURE_HABITAT.sea ? SEA_PET_IDS : LAND_PET_IDS
  const preferred = all.filter((id) => KENNEY_PETS[id].families.includes(family))
  return preferred.length > 0 ? preferred : [...all]
}

function pet(id, habitat, families) {
  return Object.freeze({
    id,
    file: `animal-${id}.glb`,
    habitat,
    families: Object.freeze([...families]),
  })
}
