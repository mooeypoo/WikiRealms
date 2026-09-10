import { describe, expect, it } from 'vitest'
import {
  FISH_PETS,
  LAND_PET_IDS,
  SEA_PET_IDS,
  SEA_SHORE_PET_IDS,
  petsForFamily,
  pickPetForFamily,
} from '../../../src/ui/rendering/kenneyPets.js'
import { CREATURE_FAMILY } from '../../../src/ui/rendering/creatureTaxonomy.js'
import { CREATURE_HABITAT } from '../../../src/ui/rendering/creatures.js'

describe('cute fish pets', () => {
  it('is an all-sea catalog with no land pets', () => {
    expect(LAND_PET_IDS).toEqual([])
    expect(SEA_PET_IDS.length).toBe(Object.keys(FISH_PETS).length)
    expect(SEA_PET_IDS.length).toBeGreaterThan(20)
    for (const id of SEA_PET_IDS) {
      expect(FISH_PETS[id].habitat).toBe(CREATURE_HABITAT.sea)
    }
  })

  it('never offers a land pet for sea habitat', () => {
    for (const family of Object.values(CREATURE_FAMILY)) {
      for (const id of petsForFamily(family, CREATURE_HABITAT.sea)) {
        expect(FISH_PETS[id].habitat).toBe(CREATURE_HABITAT.sea)
      }
    }
  })

  it('picks deterministically from the fish pool', () => {
    expect(pickPetForFamily(CREATURE_FAMILY.nature, CREATURE_HABITAT.sea, 0)).toBe(
      pickPetForFamily(CREATURE_FAMILY.nature, CREATURE_HABITAT.sea, 0),
    )
    expect(SEA_PET_IDS).toContain(pickPetForFamily(CREATURE_FAMILY.wanderer, CREATURE_HABITAT.sea, 0.5))
  })

  it('keeps huge predators off the shore zone', () => {
    for (let i = 0; i < 60; i += 1) {
      const id = pickPetForFamily(CREATURE_FAMILY.history, CREATURE_HABITAT.sea, (i + 0.5) / 60, {
        seaZone: 'shore',
      })
      expect(SEA_SHORE_PET_IDS).toContain(id)
      expect(['shark', 'swordfish', 'sunfish', 'tuna', 'goblinShark', 'humphead', 'anglerfish']).not.toContain(id)
    }
  })

  it('can draw sharks in deep water', () => {
    const seen = new Set()
    for (let i = 0; i < 80; i += 1) {
      seen.add(
        pickPetForFamily(CREATURE_FAMILY.history, CREATURE_HABITAT.sea, (i + 0.5) / 80, {
          seaZone: 'deep',
        }),
      )
    }
    expect(seen.has('shark') || seen.has('swordfish') || seen.has('humphead')).toBe(true)
  })

  it('still draws from the full pool most of the time for sparse families', () => {
    const seen = new Set()
    for (let i = 0; i < 80; i += 1) {
      seen.add(pickPetForFamily(CREATURE_FAMILY.science, CREATURE_HABITAT.sea, (i + 0.5) / 80))
    }
    expect(seen.size).toBeGreaterThan(10)
  })
})
