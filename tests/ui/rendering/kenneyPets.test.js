import { describe, expect, it } from 'vitest'
import {
  KENNEY_PETS,
  LAND_PET_IDS,
  SEA_PET_IDS,
  petsForFamily,
  pickPetForFamily,
} from '../../../src/ui/rendering/kenneyPets.js'
import { CREATURE_FAMILY } from '../../../src/ui/rendering/creatureTaxonomy.js'
import { CREATURE_HABITAT } from '../../../src/ui/rendering/creatures.js'

describe('kenneyPets', () => {
  it('splits sea and land with no overlap', () => {
    expect([...SEA_PET_IDS].sort()).toEqual(['crab', 'fish', 'penguin'])
    expect(LAND_PET_IDS).not.toContain('fish')
    expect(LAND_PET_IDS.length + SEA_PET_IDS.length).toBe(Object.keys(KENNEY_PETS).length)
  })

  it('never offers a land pet for sea habitat', () => {
    for (const family of Object.values(CREATURE_FAMILY)) {
      for (const id of petsForFamily(family, CREATURE_HABITAT.sea)) {
        expect(KENNEY_PETS[id].habitat).toBe(CREATURE_HABITAT.sea)
      }
    }
  })

  it('picks deterministically from the habitat pool', () => {
    expect(pickPetForFamily(CREATURE_FAMILY.nature, CREATURE_HABITAT.sea, 0)).toBe(
      pickPetForFamily(CREATURE_FAMILY.nature, CREATURE_HABITAT.sea, 0),
    )
    expect(SEA_PET_IDS).toContain(pickPetForFamily(CREATURE_FAMILY.wanderer, CREATURE_HABITAT.sea, 0.5))
  })
})
