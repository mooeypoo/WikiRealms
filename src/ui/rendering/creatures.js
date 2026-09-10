/**
 * What a blob is — proportions, colour, gait — separate from WHERE it
 * stands (creatureScatter.js) and HOW categories pick the mix
 * (creatureTaxonomy.js).
 *
 * Two habitats share the same topic families: land puddings hop on
 * lushness bands, and sea leviathans breach across ocean cells.
 *
 * Free of three.js: archetype tables and per-cell rolls are plain data
 * the scatter and the component both read.
 */
import { BIOME } from '../../engine/generation/terrain.js'
import { CREATURE_FAMILY } from './creatureTaxonomy.js'

export const CREATURE_HABITAT = Object.freeze({
  land: 'land',
  sea: 'sea',
})

/**
 * Chance a sampled cell tries to host a creature, before quality thinning.
 * Sparse on purpose — noticed individuals, not cover.
 */
export const CREATURE_DENSITY_BY_BAND = Object.freeze({
  // Land bands stay at 0 — fauna is water-only (pageviews → fish count).
  [BIOME.DUNES]: 0,
  [BIOME.STEPPE]: 0,
  [BIOME.LIGHT_VEG]: 0,
  [BIOME.MEADOW]: 0,
  [BIOME.WOODLAND]: 0,
  [BIOME.JUNGLE]: 0,
  // Open water carries the whole pageview signal.
  [BIOME.OCEAN]: 0.07,
})

export const CREATURE_SAMPLING = Object.freeze({
  /** Unused for land (density 0); kept for older call sites. */
  stride: 3,
  /** Ocean sampling lattice. */
  seaStride: 3,
  /** Hard ceilings after density rolls, before pageview scaling. */
  maxLand: 0,
  /** Busy pages fill the seas; quiet ones stay sparse via pageviewDensityScale. */
  maxSea: 64,
  /** Land wander (unused). */
  wanderRadius: 2.15,
  /** Open-ocean cruise radius in grid cells — wide loops, not shoreline hugs. */
  seaWanderRadius: 14,
  /** Reef fish still roam, but farther from home than before. */
  shoreWanderRadius: 9,
  /** Soft push-apart distance between fish in the same layer (grid cells). */
  swimSeparation: 2.4,
  /** Beach never hosts fauna anymore. */
  beachDensity: 0,
  /** Seconds for one land stride cycle at gaitSpeed 1. */
  hopPeriod: 1.55,
  /** Seconds for one swim / bob cycle at gaitSpeed 1 — slow, readable. */
  breachPeriod: 4.4,
})

/**
 * Land puddings. `scale` is in grid cells — accents from orbit, not mascots.
 *
 * `elongate` stretches the body along forward (1 = sphere).
 * `gait`: hop (grounded scoot) | waddle | breach
 * `hopHeight`: squish amplitude for land strides (not jump height).
 */
export const CREATURE_ARCHETYPES = Object.freeze({
  [CREATURE_FAMILY.nature]: Object.freeze({
    family: CREATURE_FAMILY.nature,
    habitat: CREATURE_HABITAT.land,
    color: 0x6fbf6a,
    squat: 0.78,
    eyeSize: 0.14,
    elongate: 1,
    dorsal: false,
    gait: 'hop',
    hopHeight: 1.1,
    gaitSpeed: 1.05,
    scale: 2.15,
  }),
  [CREATURE_FAMILY.science]: Object.freeze({
    family: CREATURE_FAMILY.science,
    habitat: CREATURE_HABITAT.land,
    color: 0x6aa8d8,
    squat: 0.88,
    eyeSize: 0.16,
    elongate: 1,
    dorsal: false,
    gait: 'hop',
    hopHeight: 1.35,
    gaitSpeed: 1.2,
    scale: 2.0,
  }),
  [CREATURE_FAMILY.arts]: Object.freeze({
    family: CREATURE_FAMILY.arts,
    habitat: CREATURE_HABITAT.land,
    color: 0xd48ab8,
    squat: 0.72,
    eyeSize: 0.15,
    elongate: 1,
    dorsal: false,
    gait: 'waddle',
    hopHeight: 0.55,
    gaitSpeed: 0.85,
    scale: 2.05,
  }),
  [CREATURE_FAMILY.history]: Object.freeze({
    family: CREATURE_FAMILY.history,
    habitat: CREATURE_HABITAT.land,
    color: 0xc4a05a,
    squat: 0.7,
    eyeSize: 0.12,
    elongate: 1,
    dorsal: false,
    gait: 'waddle',
    hopHeight: 0.4,
    gaitSpeed: 0.7,
    scale: 2.2,
  }),
  [CREATURE_FAMILY.places]: Object.freeze({
    family: CREATURE_FAMILY.places,
    habitat: CREATURE_HABITAT.land,
    color: 0x8b7a5e,
    squat: 0.82,
    eyeSize: 0.13,
    elongate: 1,
    dorsal: false,
    gait: 'hop',
    hopHeight: 0.85,
    gaitSpeed: 0.9,
    scale: 2.05,
  }),
  [CREATURE_FAMILY.sport]: Object.freeze({
    family: CREATURE_FAMILY.sport,
    habitat: CREATURE_HABITAT.land,
    color: 0xe07a4a,
    squat: 0.85,
    eyeSize: 0.14,
    elongate: 1,
    dorsal: false,
    gait: 'hop',
    hopHeight: 1.55,
    gaitSpeed: 1.35,
    scale: 2.05,
  }),
  [CREATURE_FAMILY.wanderer]: Object.freeze({
    family: CREATURE_FAMILY.wanderer,
    habitat: CREATURE_HABITAT.land,
    color: 0xb8a8d0,
    squat: 0.8,
    eyeSize: 0.15,
    elongate: 1,
    dorsal: false,
    gait: 'hop',
    hopHeight: 1.0,
    gaitSpeed: 1.0,
    scale: 2.1,
  }),
})

/**
 * Sea leviathans — same topic families, whale-ish silhouette and breach.
 * Cooler / wetter tints; a bit larger than land so open water still reads.
 */
export const SEA_CREATURE_ARCHETYPES = Object.freeze({
  [CREATURE_FAMILY.nature]: Object.freeze({
    family: CREATURE_FAMILY.nature,
    habitat: CREATURE_HABITAT.sea,
    color: 0x4a9e8e,
    squat: 0.55,
    eyeSize: 0.1,
    elongate: 1.85,
    dorsal: true,
    gait: 'breach',
    hopHeight: 1.8,
    gaitSpeed: 0.7,
    scale: 3.1,
  }),
  [CREATURE_FAMILY.science]: Object.freeze({
    family: CREATURE_FAMILY.science,
    habitat: CREATURE_HABITAT.sea,
    color: 0x3d7eb8,
    squat: 0.5,
    eyeSize: 0.11,
    elongate: 2.05,
    dorsal: true,
    gait: 'breach',
    hopHeight: 2.1,
    gaitSpeed: 0.75,
    scale: 3.2,
  }),
  [CREATURE_FAMILY.arts]: Object.freeze({
    family: CREATURE_FAMILY.arts,
    habitat: CREATURE_HABITAT.sea,
    color: 0x8b6bb0,
    squat: 0.52,
    eyeSize: 0.1,
    elongate: 1.7,
    dorsal: true,
    gait: 'breach',
    hopHeight: 1.5,
    gaitSpeed: 0.65,
    scale: 2.9,
  }),
  [CREATURE_FAMILY.history]: Object.freeze({
    family: CREATURE_FAMILY.history,
    habitat: CREATURE_HABITAT.sea,
    color: 0x6a7a8a,
    squat: 0.48,
    eyeSize: 0.09,
    elongate: 2.2,
    dorsal: true,
    gait: 'breach',
    hopHeight: 1.4,
    gaitSpeed: 0.55,
    scale: 3.35,
  }),
  [CREATURE_FAMILY.places]: Object.freeze({
    family: CREATURE_FAMILY.places,
    habitat: CREATURE_HABITAT.sea,
    color: 0x5a8a9a,
    squat: 0.54,
    eyeSize: 0.1,
    elongate: 1.9,
    dorsal: true,
    gait: 'breach',
    hopHeight: 1.6,
    gaitSpeed: 0.68,
    scale: 3.0,
  }),
  [CREATURE_FAMILY.sport]: Object.freeze({
    family: CREATURE_FAMILY.sport,
    habitat: CREATURE_HABITAT.sea,
    color: 0x2a9aaa,
    squat: 0.58,
    eyeSize: 0.11,
    elongate: 1.75,
    dorsal: true,
    gait: 'breach',
    hopHeight: 2.4,
    gaitSpeed: 0.9,
    scale: 3.0,
  }),
  [CREATURE_FAMILY.wanderer]: Object.freeze({
    family: CREATURE_FAMILY.wanderer,
    habitat: CREATURE_HABITAT.sea,
    color: 0x7a90a8,
    squat: 0.53,
    eyeSize: 0.1,
    elongate: 1.8,
    dorsal: true,
    gait: 'breach',
    hopHeight: 1.7,
    gaitSpeed: 0.7,
    scale: 3.05,
  }),
})

/**
 * Biome retunes applied after the archetype base.
 * Tint is RGB in 0–1 multiplied onto the base colour.
 */
export const BIOME_CREATURE_RETUNE = Object.freeze({
  [BIOME.OCEAN]: Object.freeze({
    tint: Object.freeze([0.92, 1.05, 1.12]),
    scaleMul: 1.0,
    speedMul: 1.0,
    squatMul: 1.0,
  }),
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

/** Gait codes stored in scatter buffers. */
export const GAIT = Object.freeze({
  hop: 0,
  waddle: 1,
  breach: 2,
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
  seaSpawn: 46,
  seaThinning: 47,
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
 * @param {number} biome
 * @returns {boolean}
 */
export function isSeaBiome(biome) {
  return biome === BIOME.OCEAN
}

/**
 * @param {string} family
 * @param {string} habitat
 */
export function archetypeFor(family, habitat) {
  const table = habitat === CREATURE_HABITAT.sea ? SEA_CREATURE_ARCHETYPES : CREATURE_ARCHETYPES
  return table[family] ?? table[CREATURE_FAMILY.wanderer]
}

/**
 * Applies biome retune to an archetype's display numbers.
 *
 * @param {object} archetype
 * @param {number} biome
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
    elongate: archetype.elongate ?? 1,
    dorsal: Boolean(archetype.dorsal),
    gait: archetype.gait,
    habitat: archetype.habitat,
  }
}

/**
 * @param {string} gait
 * @returns {number}
 */
export function gaitCode(gait) {
  return GAIT[gait] ?? GAIT.hop
}

/**
 * @param {number} code
 * @returns {string}
 */
export function gaitFromCode(code) {
  if (code === GAIT.waddle) return 'waddle'
  if (code === GAIT.breach) return 'breach'
  return 'hop'
}

/**
 * Hop / waddle / breach pose for one creature at a clock time.
 *
 * Land gaits stay on the ground: `hopHeight` is how hard the body squishes
 * each stride, not how high it jumps. Amplitudes stay soft so fauna reads
 * as living accents rather than a bouncing crowd. Sea breach still arcs a
 * little, but most of the read is stretch and pitch.
 *
 * @returns {{ lift: number, squashX: number, squashY: number, squashZ: number, lean: number, pitch: number }}
 */
export function creaturePose(timeSec, creature) {
  const body = creature.scale
  const baseSquat = creature.squat
  const cycle =
    ((timeSec * creature.gaitSpeed) /
      (creature.gait === 'breach' ? CREATURE_SAMPLING.breachPeriod : CREATURE_SAMPLING.hopPeriod) +
      creature.phase) %
    1

  if (creature.gait === 'waddle') {
    const sway = Math.sin(cycle * Math.PI * 2)
    const weight = Math.abs(sway)
    return {
      lift: 0,
      squashX: body * (1 + weight * 0.06),
      squashY: body * baseSquat * (1 - weight * 0.07),
      squashZ: body * (1 - weight * 0.025),
      lean: sway * 0.14,
      pitch: 0,
    }
  }

  if (creature.gait === 'breach') {
    // Slow surface cruise: continuous gentle bob that can crest partly
    // out of the water, plus a softer body stretch — not a leap.
    const roll = Math.sin(cycle * Math.PI * 2)
    const cresting = cycle > 0.55 && cycle < 0.9
    const t = cresting ? (cycle - 0.55) / 0.35 : 0
    const crest = cresting ? Math.sin(t * Math.PI) : 0
    const bob = 0.5 + 0.5 * roll
    const amp = 0.06 + Math.min(0.1, creature.hopHeight * 0.04)
    return {
      // Base bob keeps them alive between crests; crest peeks above the waterline.
      lift: body * (0.04 + bob * 0.1 + crest * 0.28),
      squashX: body * (0.98 + crest * 0.04 + Math.abs(roll) * 0.02),
      squashY: body * baseSquat * (1 - crest * amp * 0.4 + Math.abs(roll) * 0.015),
      squashZ: body * (1 + crest * 0.08 + Math.abs(roll) * 0.02),
      lean: 0,
      pitch: crest * 0.22 + roll * 0.05,
    }
  }

  // Grounded scoot: light compress into the stride — never leave the ground.
  const stride = Math.sin(cycle * Math.PI * 2)
  const compress = Math.max(0, -stride)
  const spring = Math.max(0, stride)
  const amp = 0.05 + Math.min(0.1, creature.hopHeight * 0.04)

  return {
    lift: 0,
    squashX: body * (1 + compress * amp * 0.9),
    squashY: body * baseSquat * (1 - compress * amp * 1.15 + spring * amp * 0.3),
    squashZ: body * (1 + compress * amp * 0.7 - spring * amp * 0.12),
    lean: stride * 0.03,
    pitch: compress * 0.05 - spring * 0.03,
  }
}

/**
 * Wander offset in grid cells — a closed, slightly irregular path around
 * home. Phase picks a unique ellipse/skew so neighbours do not orbit in
 * lockstep; the loop stays small enough to read as a trail, not a march.
 */
export function creatureWander(
  timeSec,
  phase,
  speedMul,
  radius = CREATURE_SAMPLING.wanderRadius,
) {
  const turn = 0.16 + phase * 0.14
  const stretch = 0.55 + phase * 0.4
  const skew = 0.62 + ((phase * 5.3) % 1) * 0.5
  const angle = timeSec * turn * speedMul + phase * Math.PI * 2
  const pulse = 0.84 + 0.16 * Math.sin(timeSec * (0.28 + phase * 0.22) + phase * 11)
  return {
    dx: Math.cos(angle) * radius * pulse,
    dy: Math.sin(angle * skew + 0.95 + phase * 2.1) * radius * pulse * stretch,
  }
}
