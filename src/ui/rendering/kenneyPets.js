/**
 * Kenney Cube Pets catalog — which animals exist, where they live, and
 * which topic families prefer them.
 *
 * Assets live in `public/assets/kenney/cube-pets/` (CC0). The raw packs
 * under `models/` are reference only and gitignored.
 *
 * Sea vs land is a hard split: fish/crab/penguin never spawn on land,
 * and land pets never spawn in ocean.
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

/**
 * Motion / size profile for a pet. Models are normalised to unit height;
 * `scale` is in grid cells (then multiplied by the projection's foliageScale).
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
    hopHeight: sea ? 0.55 : 0.45,
    gaitSpeed: sea ? 0.85 : 1,
    scale: sea ? 1.9 : 1.65,
  })
}

/**
 * Pets available for a topic family in a habitat. Falls back to every pet
 * in that habitat so a sparse mix never fails to place.
 *
 * @param {string} family
 * @param {string} habitat
 * @returns {string[]}
 */
export function petsForFamily(family, habitat) {
  const pool = habitat === CREATURE_HABITAT.sea ? SEA_PET_IDS : LAND_PET_IDS
  const preferred = pool.filter((id) => KENNEY_PETS[id].families.includes(family))
  return preferred.length > 0 ? preferred : [...pool]
}

/**
 * Deterministic pick from a family's habitat pool.
 *
 * @param {string} family
 * @param {string} habitat
 * @param {number} roll 0..1
 */
export function pickPetForFamily(family, habitat, roll) {
  const pool = petsForFamily(family, habitat)
  const t = Math.min(0.999999, Math.max(0, roll))
  return pool[Math.floor(t * pool.length)]
}

function pet(id, habitat, families) {
  return Object.freeze({
    id,
    file: `animal-${id}.glb`,
    habitat,
    families: Object.freeze([...families]),
  })
}
