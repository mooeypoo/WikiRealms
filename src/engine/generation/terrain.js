import { ALTITUDE, BIOME_THRESHOLDS, LUSHNESS, SHORE } from './config.js'

/**
 * Biome ids stored in World.terrain.biomeMap.
 *
 * Ordered, and the order is load-bearing for the six lushness bands: they
 * run from least to most cited, so LUSHNESS_BANDS below can be indexed
 * straight from a cut point. Water and altitude bracket them.
 *
 * DUNES and STEPPE are both dry, and the difference between them is the
 * point: dunes mean a section cites NOTHING, steppe means it cites less
 * than the rest of the article. "No sources" and "fewer sources than its
 * neighbours" are different claims about an article, and a reader acts on
 * them differently.
 */
export const BIOME = Object.freeze({
  OCEAN: 0,
  BEACH: 1,
  DUNES: 2, // cites nothing at all
  STEPPE: 3, // cited well below this article's own rate
  LIGHT_VEG: 4, // somewhat below
  MEADOW: 5, // about the article's own rate
  WOODLAND: 6, // above it
  JUNGLE: 7, // far above it
  // Not a band: the polar caps belong to no section, so they are the one
  // ground in a world that says nothing about the article. Rock has no id
  // at all any more — it is cover over a band (see rockCover).
  SNOW: 8,
})

/** All six lushness bands, least to most cited. */
export const LUSHNESS_BANDS = Object.freeze([
  BIOME.DUNES,
  BIOME.STEPPE,
  BIOME.LIGHT_VEG,
  BIOME.MEADOW,
  BIOME.WOODLAND,
  BIOME.JUNGLE,
])

/**
 * The five bands a section with at least one citation can land in.
 * Index matches LUSHNESS.bandCuts. Dunes is excluded deliberately: it is
 * not the bottom of this scale, it is a separate statement.
 */
export const CITED_LUSHNESS_BANDS = Object.freeze(LUSHNESS_BANDS.slice(1))

/**
 * Fractal noise sampled on a CYLINDER rather than a plane, so it is
 * continuous across the grid's left/right edges.
 *
 * The grid is an equirectangular map (see config.js GRID): column 0 and
 * column width-1 are neighbouring meridians. Plain 2D noise sampled at
 * x/scale knows nothing about that and leaves a visible discontinuity in
 * surface detail down the seam wherever land crosses it. Wrapping the x
 * axis onto a circle of circumference `width` makes the noise periodic in
 * x by construction, at the same feature size as the planar version —
 * the circle's radius is chosen so one grid column is one unit of arc.
 *
 * @param {import('simplex-noise').NoiseFunction3D} noise3D
 * @param {number} x grid column
 * @param {number} y grid row
 * @param {number} width grid width, i.e. the wrap period
 * @param {{ octaves: number, persistence: number, scale: number }} params
 */
export function sampleFractalNoiseWrapped(noise3D, x, y, width, { octaves, persistence, scale }) {
  const circleRadius = width / (2 * Math.PI)
  const angle = (x / width) * 2 * Math.PI
  const cylinderX = Math.cos(angle) * circleRadius
  const cylinderY = Math.sin(angle) * circleRadius

  let amplitude = 1
  let frequency = 1
  let sum = 0
  let maxAmplitude = 0

  for (let i = 0; i < octaves; i++) {
    sum +=
      noise3D((cylinderX / scale) * frequency, (cylinderY / scale) * frequency, (y / scale) * frequency) * amplitude
    maxAmplitude += amplitude
    amplitude *= persistence
    frequency *= 2
  }

  return (sum / maxAmplitude + 1) / 2
}

/**
 * Which lushness band a scalar falls in. The only place that turns the
 * continuous signal into a name — renderers that can vary continuously
 * should read the scalar itself and leave this to the legend and tooltip.
 *
 * Exactly 0 means the section cites nothing, and gets the dunes. Every
 * other value is a position among the sections that DO cite, cut into
 * even fifths. Treating dunes as the bottom fifth instead would merge
 * "no sources" into "few sources", which is the distinction the sixth
 * band exists for.
 *
 * @param {number} lushness [0, 1] from lushness.js
 * @returns {number} BIOME enum value
 */
export function lushnessBand(lushness) {
  const value = Number(lushness) || 0
  if (value <= 0) return BIOME.DUNES
  for (let i = 0; i < LUSHNESS.bandCuts.length; i++) {
    if (value < LUSHNESS.bandCuts[i]) return CITED_LUSHNESS_BANDS[i]
  }
  return CITED_LUSHNESS_BANDS[CITED_LUSHNESS_BANDS.length - 1]
}

/** Smooth 0→1 ramp with zero slope at both ends. */
function smoothstep(edge0, edge1, value) {
  if (edge1 <= edge0) return value >= edge1 ? 1 : 0
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/**
 * How much bare stone shows through at this height, in [0, 1].
 *
 * A ramp, not a line. The threshold this replaces put a visible contour
 * across every peak in the world at exactly one height.
 *
 * @param {number} height [0, 1]
 */
export function rockCover(height) {
  return smoothstep(ALTITUDE.rockStart, ALTITUDE.rockFull, Number(height) || 0)
}

/**
 * How much snow lies on top, in [0, 1]. Begins before the rock band has
 * finished, so no altitude is uniformly one surface.
 *
 * @param {number} height [0, 1]
 */
export function snowCover(height) {
  return smoothstep(ALTITUDE.snowStart, ALTITUDE.snowFull, Number(height) || 0)
}

/**
 * How much sand lies over the ground at this height, in [0, 1].
 *
 * Half cover at BIOME_THRESHOLDS.beachMaxHeight, since the band is
 * centred there: the classification this replaces for colour purposes
 * put a hard step at that height, which a mesh cannot draw without
 * showing its own triangles, and a band centred on it carries the same
 * amount of sand rather than moving the coast. See SHORE.
 *
 * Note this keeps returning 1 below the waterline: a submerged shelf is
 * still sand. seaFloorCover is what takes it back again down there.
 *
 * @param {number} height [0, 1]
 */
export function sandCover(height) {
  return 1 - smoothstep(SHORE.sandFadeFrom, SHORE.sandFadeTo, Number(height) || 0)
}

/**
 * How much sea floor shows at this height, in [0, 1] — 0 at the
 * waterline, complete by SHORE.seaFloorFull below it.
 *
 * Applied over the sand rather than instead of it, so the two boundaries
 * a coast has are two ramps rather than two steps.
 *
 * @param {number} height [0, 1]
 */
export function seaFloorCover(height) {
  return 1 - smoothstep(SHORE.seaFloorFull, BIOME_THRESHOLDS.oceanMaxHeight, Number(height) || 0)
}

/**
 * How much snow a CROWN carries at this height, in [0, 1]. Lower than
 * snowCover, and deliberately so — see ALTITUDE.frostStart.
 *
 * The canopy shader computes this same curve from its own uniforms; this
 * is the JS statement of the rule, so the reachability of the whole
 * effect can be measured on a real world rather than assumed. That
 * assumption is exactly what failed once: snow on trees shipped working
 * and unreachable, because no tree in any world stood high enough.
 *
 * @param {number} height [0, 1]
 */
export function frostCover(height) {
  return smoothstep(ALTITUDE.frostStart, ALTITUDE.frostFull, Number(height) || 0)
}

/**
 * What fraction of this cell's usual foliage survives its altitude, in
 * [0, 1]. 1 below the treeline, tapering to 0 above it.
 *
 * A section's lushness lifts its own treeline: wetter ground grows trees
 * higher up a real mountain, so a well-cited range keeps its green
 * further towards the summit. That is a second reading of the same
 * signal, but it arrives as geography rather than as a repeat — the
 * range's silhouette changes, not just its colour.
 *
 * @param {number} height [0, 1]
 * @param {number} [lushness] [0, 1] from lushness.js
 */
export function treelineFactor(height, lushness = 0) {
  const lift = ALTITUDE.treelineLushnessLift * Math.min(1, Math.max(0, Number(lushness) || 0))
  return 1 - smoothstep(ALTITUDE.treelineStart + lift, ALTITUDE.treelineEnd + lift, Number(height) || 0)
}

/**
 * Classifies a cell's biome from its height and its section's lushness.
 *
 * Pure and reusable so presentation layers can re-derive biome info
 * without re-running generation.
 *
 * Land is ALWAYS a lushness band now, at every altitude. Rock and snow
 * are cover applied over the top of that band by the two functions above,
 * so a cell keeps saying what its section cites even where stone or ice
 * is most of what you can see. Only the polar caps, which belong to no
 * section, are classified as snow outright (see sectionTerrain.js).
 *
 * @param {number} height [0, 1]
 * @param {number} lushness [0, 1] from lushness.js
 * @returns {number} BIOME enum value
 */
export function classifyBiome(height, lushness) {
  if (height < BIOME_THRESHOLDS.oceanMaxHeight) return BIOME.OCEAN
  if (height < BIOME_THRESHOLDS.beachMaxHeight) return BIOME.BEACH
  return lushnessBand(lushness)
}
