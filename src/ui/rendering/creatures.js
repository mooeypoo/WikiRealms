/**
 * What a blob is — proportions, colour, gait — separate from WHERE it
 * stands (creatureScatter.js) and HOW categories pick the mix
 * (creatureTaxonomy.js).
 *
 * Free of three.js: archetype tables and per-cell rolls are plain data
 * the scatter and the component both read.
 */
import { BIOME } from '../../engine/generation/terrain.js'
import { CREATURE_FAMILY } from './creatureTaxonomy.js'

/**
 * Chance a sampled land cell tries to host a creature, before quality
 * thinning. Sparse on purpose — these are noticed individuals, not cover.
 */
export const CREATURE_DENSITY_BY_BAND = Object.freeze({
  [BIOME.DUNES]: 0.012,
  [BIOME.STEPPE]: 0.02,
  [BIOME.LIGHT_VEG]: 0.035,
  [BIOME.MEADOW]: 0.055,
  [BIOME.WOODLAND]: 0.045,
  [BIOME.JUNGLE]: 0.07,
})

export const CREATURE_SAMPLING = Object.freeze({
  /** Sample every Nth cell so we never approach foliage-scale counts. */
  stride: 3,
  /** Hard ceiling after density rolls, before quality scaling. */
  maxCount: 72,
  /** Wander radius in grid cells around the home cell. */
  wanderRadius: 1.35,
  /** Seconds for one hop cycle at gaitSpeed 1. */
  hopPeriod: 1.15,
})

/**
 * Visual + motion identity per topic family.
 *
 * `squat` scales Y vs XZ at rest (lower = flatter pudding).
 * `eyeSize` is relative to body radius in the shader.
 * `gait` is hop (vertical bounce) or waddle (side lean).
 * `hopHeight` is peak lift in body-radii.
 * `gaitSpeed` multiplies the shared hop clock.
 */
export const CREATURE_ARCHETYPES = Object.freeze({
  [CREATURE_FAMILY.nature]: Object.freeze({
    family: CREATURE_FAMILY.nature,
    color: 0x6fbf6a,
    squat: 0.78,
    eyeSize: 0.14,
    gait: 'hop',
    hopHeight: 1.1,
    gaitSpeed: 1.05,
    // Sizes are in grid cells (same unit as foliage). Kept large enough
    // to read from the default orbit without turning into planet-scale pets.
    scale: 1.15,
  }),
  [CREATURE_FAMILY.science]: Object.freeze({
    family: CREATURE_FAMILY.science,
    color: 0x6aa8d8,
    squat: 0.88,
    eyeSize: 0.16,
    gait: 'hop',
    hopHeight: 1.35,
    gaitSpeed: 1.2,
    scale: 1.0,
  }),
  [CREATURE_FAMILY.arts]: Object.freeze({
    family: CREATURE_FAMILY.arts,
    color: 0xd48ab8,
    squat: 0.72,
    eyeSize: 0.15,
    gait: 'waddle',
    hopHeight: 0.55,
    gaitSpeed: 0.85,
    scale: 1.05,
  }),
  [CREATURE_FAMILY.history]: Object.freeze({
    family: CREATURE_FAMILY.history,
    color: 0xc4a05a,
    squat: 0.7,
    eyeSize: 0.12,
    gait: 'waddle',
    hopHeight: 0.4,
    gaitSpeed: 0.7,
    scale: 1.2,
  }),
  [CREATURE_FAMILY.places]: Object.freeze({
    family: CREATURE_FAMILY.places,
    color: 0x8b7a5e,
    squat: 0.82,
    eyeSize: 0.13,
    gait: 'hop',
    hopHeight: 0.85,
    gaitSpeed: 0.9,
    scale: 1.05,
  }),
  [CREATURE_FAMILY.sport]: Object.freeze({
    family: CREATURE_FAMILY.sport,
    color: 0xe07a4a,
    squat: 0.85,
    eyeSize: 0.14,
    gait: 'hop',
    hopHeight: 1.55,
    gaitSpeed: 1.35,
    scale: 1.05,
  }),
  [CREATURE_FAMILY.wanderer]: Object.freeze({
    family: CREATURE_FAMILY.wanderer,
    color: 0xb8a8d0,
    squat: 0.8,
    eyeSize: 0.15,
    gait: 'hop',
    hopHeight: 1.0,
    gaitSpeed: 1.0,
    scale: 1.05,
  }),
})

/**
 * Biome retunes applied after the archetype base.
 * Tint is RGB in 0–1 multiplied onto the base colour.
 */
export const BIOME_CREATURE_RETUNE = Object.freeze({
  [BIOME.DUNES]: Object.freeze({
    tint: Object.freeze([1.15, 0.95, 0.75]),
    scaleMul: 0.92,
    speedMul: 0.85,
    squatMul: 0.95,
  }),
  [BIOME.STEPPE]: Object.freeze({
    tint: Object.freeze([1.05, 1.0, 0.85]),
    scaleMul: 0.95,
    speedMul: 0.9,
    squatMul: 0.97,
  }),
  [BIOME.LIGHT_VEG]: Object.freeze({
    tint: Object.freeze([1.0, 1.02, 0.95]),
    scaleMul: 1.0,
    speedMul: 1.0,
    squatMul: 1.0,
  }),
  [BIOME.MEADOW]: Object.freeze({
    tint: Object.freeze([0.95, 1.08, 0.95]),
    scaleMul: 1.12,
    speedMul: 0.88,
    squatMul: 0.92,
  }),
  [BIOME.WOODLAND]: Object.freeze({
    tint: Object.freeze([0.85, 1.0, 0.9]),
    scaleMul: 0.95,
    speedMul: 1.05,
    squatMul: 1.0,
  }),
  [BIOME.JUNGLE]: Object.freeze({
    tint: Object.freeze([0.75, 1.15, 0.85]),
    scaleMul: 0.82,
    speedMul: 1.25,
    squatMul: 1.05,
  }),
})

function fmix32(h) {
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return h >>> 0
}

const SALT = Object.freeze({
  spawn: 40,
  family: 41,
  phase: 42,
  scale: 43,
  wander: 44,
  thinning: 45,
})

/**
 * @param {number} gridX
 * @param {number} gridY
 * @param {number} seed
 * @param {number} [salt]
 * @returns {{ a: number, b: number }} two independent rolls in [0, 1)
 */
export function cellCreatureRolls(gridX, gridY, seed, salt = 0) {
  const combined =
    Math.imul(gridX, 0x27d4eb2d) ^ Math.imul(gridY, 0x165667b1) ^ Math.imul(seed ^ salt, 0x9e3779b1)
  const hash = fmix32(combined)
  return {
    a: (hash & 0xffff) / 0x10000,
    b: ((hash >>> 16) & 0xffff) / 0x10000,
  }
}

export { SALT as CREATURE_SALT }

/**
 * @param {number} biome
 * @returns {number}
 */
export function creatureDensityForBiome(biome) {
  return CREATURE_DENSITY_BY_BAND[biome] ?? 0
}

/**
 * Applies biome retune to an archetype's display numbers.
 *
 * @param {object} archetype
 * @param {number} biome
 * @returns {{ colorR: number, colorG: number, colorB: number, scale: number,
 *   squat: number, gaitSpeed: number, hopHeight: number, eyeSize: number, gait: string }}
 */
export function retuneCreature(archetype, biome) {
  const retune = BIOME_CREATURE_RETUNE[biome] ?? {
    tint: [1, 1, 1],
    scaleMul: 1,
    speedMul: 1,
    squatMul: 1,
  }
  const r = ((archetype.color >> 16) & 0xff) / 255
  const g = ((archetype.color >> 8) & 0xff) / 255
  const b = (archetype.color & 0xff) / 255
  return {
    colorR: Math.min(1, r * retune.tint[0]),
    colorG: Math.min(1, g * retune.tint[1]),
    colorB: Math.min(1, b * retune.tint[2]),
    scale: archetype.scale * retune.scaleMul,
    squat: archetype.squat * retune.squatMul,
    gaitSpeed: archetype.gaitSpeed * retune.speedMul,
    hopHeight: archetype.hopHeight,
    eyeSize: archetype.eyeSize,
    gait: archetype.gait,
  }
}

/**
 * Hop / waddle pose for one creature at a clock time.
 *
 * @param {number} timeSec
 * @param {{ phase: number, gaitSpeed: number, hopHeight: number, gait: string, scale: number, squat: number }} creature
 * @returns {{ lift: number, squashX: number, squashY: number, squashZ: number, lean: number }}
 */
export function creaturePose(timeSec, creature) {
  const period = CREATURE_SAMPLING.hopPeriod / Math.max(0.2, creature.gaitSpeed)
  const cycle = ((timeSec * creature.gaitSpeed) / CREATURE_SAMPLING.hopPeriod + creature.phase) % 1
  const body = creature.scale
  const baseSquat = creature.squat

  if (creature.gait === 'waddle') {
    const sway = Math.sin(cycle * Math.PI * 2)
    const bob = Math.abs(sway) * body * creature.hopHeight * 0.25
    return {
      lift: bob,
      squashX: body * (1 + Math.abs(sway) * 0.08),
      squashY: body * baseSquat * (1 - Math.abs(sway) * 0.06),
      squashZ: body * (1 - Math.abs(sway) * 0.04),
      lean: sway * 0.22,
    }
  }

  // Hop: airborne parabola in the middle of the cycle, squash on landing.
  const airborne = cycle > 0.15 && cycle < 0.55
  const t = airborne ? (cycle - 0.15) / 0.4 : 0
  const lift = airborne ? Math.sin(t * Math.PI) * body * creature.hopHeight : 0
  const landSquash = !airborne && cycle > 0.55 && cycle < 0.75
    ? Math.sin(((cycle - 0.55) / 0.2) * Math.PI) * 0.22
    : cycle < 0.15
      ? Math.sin((cycle / 0.15) * Math.PI) * 0.12
      : 0

  return {
    lift,
    squashX: body * (1 + landSquash),
    squashY: body * baseSquat * (1 - landSquash * 1.4) * (airborne ? 1.12 : 1),
    squashZ: body * (1 + landSquash),
    lean: 0,
  }
}

/**
 * Wander offset in grid cells for a closed loop around home.
 *
 * @param {number} timeSec
 * @param {number} phase
 * @param {number} speedMul
 * @param {number} radius
 * @returns {{ dx: number, dy: number }}
 */
export function creatureWander(timeSec, phase, speedMul, radius = CREATURE_SAMPLING.wanderRadius) {
  const angle = timeSec * 0.35 * speedMul + phase * Math.PI * 2
  const wobble = 0.65 + 0.35 * Math.sin(timeSec * 0.7 + phase * 9)
  return {
    dx: Math.cos(angle) * radius * wobble,
    dy: Math.sin(angle * 0.87 + 1.2) * radius * wobble,
  }
}
