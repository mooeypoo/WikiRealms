import {
  BIOME,
  LUSHNESS_BANDS,
  lushnessBand,
  rockCover,
  sandCover,
  seaFloorCover,
  snowCover,
} from '../../engine/generation/terrain.js'

/**
 * Base RGB color per biome, before altitude cover and height shading.
 *
 * The six land colours are the lushness bands, least to most cited. They
 * are a ramp in three channels at once — hue from sand through olive to
 * green, saturation up, lightness down — because a ramp in hue alone left
 * the top two bands (two dark greens 16 units apart) indistinguishable on
 * screen.
 *
 * DUNES is deliberately the palest, most bleached tone in the set: it
 * means a section cites nothing, and it should read as absence rather
 * than as one more shade of dry.
 *
 * There is no MOUNTAIN entry, because there is no mountain biome. Rock is
 * cover over whichever band the cell already has — see ROCK_DRY below.
 * SNOW is here only for the polar caps, which belong to no section.
 */
const BIOME_BASE_COLORS = {
  [BIOME.OCEAN]: [20, 70, 160],
  [BIOME.BEACH]: [214, 194, 145],
  [BIOME.DUNES]: [231, 208, 156], // cites nothing: bleached sand, no green at all
  [BIOME.STEPPE]: [199, 176, 112], // below the article's rate: dry olive-tan
  [BIOME.LIGHT_VEG]: [154, 176, 96], // somewhat below: pale green, scattered cover
  [BIOME.MEADOW]: [100, 158, 74], // about the article's rate: open mid green
  [BIOME.WOODLAND]: [55, 116, 62], // above it: forest green
  [BIOME.JUNGLE]: [22, 74, 44], // far above it: deep, saturated green
  [BIOME.SNOW]: [245, 245, 250],
}

/**
 * The two stones, and the reason altitude no longer erases the citation
 * signal.
 *
 * Bare rock used to be one grey, applied past a threshold, so every
 * summit in every world looked identical — a well-cited section's peak
 * and a barren one's were the same colour. Real high ground is not one
 * colour either: stone on a wet mountain carries lichen, moss and alpine
 * turf and reads cool and green, while stone on a dry one reads warm and
 * pale. So the rock is a lerp between these by the section's lushness,
 * and even at complete cover a summit still says what its section cites.
 */
const ROCK_DRY = [156, 140, 120] // uncited: warm, pale scree
const ROCK_MOSSY = [92, 104, 86] // well-cited: cool, damp, lichened stone

/**
 * Snow lying over whatever the rock band left.
 *
 * Exported because snow is the one part of this palette that is not a
 * property of the terrain: the ground under it does not change when a
 * snowline moves, so a renderer that wants to move one needs the ground
 * colour and this white separately rather than the two already mixed.
 * See biomeGroundRgb and biomeSnowCover.
 */
export const SNOW_RGB = Object.freeze([245, 245, 250])

const FALLBACK_COLOR = [128, 128, 128]

/**
 * Lushness implied by a band, for tinting the rock. Quantized to the six
 * bands rather than read from lushnessMap, so `biomeColor` keeps working
 * from a biome id alone — the legend's swatches and the 2D canvas have no
 * scalar to hand. Six steps is more resolution than a rock tint needs.
 */
const LUSHNESS_BY_BAND = new Map(
  LUSHNESS_BANDS.map((biome, index) => [biome, index / (LUSHNESS_BANDS.length - 1)]),
)

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function mix(from, to, amount) {
  return from + (to - from) * amount
}

function mixRgb(from, to, amount) {
  return [mix(from[0], to[0], amount), mix(from[1], to[1], amount), mix(from[2], to[2], amount)]
}

/**
 * Maps a terrain cell's biome and height to a CSS color, for the 2D
 * heatmap renderer and the legend's swatches. Pure and deterministic:
 * the same biome/height always produces the same color.
 *
 * This is the CSS spelling of biomeRgb, which is where the arithmetic
 * lives. Anything drawing to a GPU wants that instead, or the ground and
 * snow separately — see biomeGroundRgb.
 *
 * Altitude is applied as COVER over the band colour, in two overlapping
 * smooth bands (see ALTITUDE in config.js) — rock first, then snow over
 * the top. Nothing switches at a threshold, so peaks no longer carry a
 * visible contour line at one height, and a cell keeps its band colour
 * showing through wherever the cover is partial.
 *
 * Polar-cap cells arrive as BIOME.SNOW at low height, so they get their
 * white base and no cover on top of it — the caps are flat ice, not
 * summits.
 *
 * @param {number} biome one of the BIOME ids
 * @param {number} height [0, 1]
 * @returns {string} CSS `rgb(...)` color
 */
export function biomeColor(biome, height) {
  const [r, g, b] = biomeRgb(biome, height)
  return `rgb(${r}, ${g}, ${b})`
}

/**
 * The colour UNDER the snow: band base, height shading and rock cover,
 * with no white mixed in. Unrounded, since callers either round once at
 * the end or upload the channels to a GPU.
 *
 * Split from the snow so a renderer can hold the two apart. Baked
 * together, a snowline cannot move without recomputing every vertex
 * colour in the world — and on the 3D mesh, uniform mixing is also the
 * wrong look: it whitens a tree's shaded underside as much as its crown,
 * where real snow lies on what faces the sky.
 *
 * @param {number} biome one of the BIOME ids
 * @param {number} height [0, 1]
 * @returns {[number, number, number]} channels in [0, 255], unrounded
 */
export function biomeGroundRgb(biome, height) {
  const base = BIOME_BASE_COLORS[biome] ?? FALLBACK_COLOR
  const shaded = shadeByHeight(base, height)

  // Water takes no rock: the bands sit far above sea level, but skipping
  // explicitly keeps a deep-ocean cell honest if they ever move down.
  if (biome === BIOME.OCEAN || biome === BIOME.BEACH) return shaded

  const lushness = LUSHNESS_BY_BAND.get(biome) ?? 0
  return mixRgb(shaded, mixRgb(ROCK_DRY, ROCK_MOSSY, lushness), rockCover(height))
}

/** Height shading, which every path applies before any cover. */
function shadeByHeight(base, height) {
  const shade = clamp(0.7 + height * 0.5, 0.5, 1.3)
  return base.map((channel) => channel * shade)
}

/**
 * The colour under the snow for a POINT on the surface, given the
 * section's lushness scalar rather than a biome id.
 *
 * WHY THERE ARE TWO OF THESE
 *
 * biomeGroundRgb answers "what colour is this biome", which is what a
 * legend swatch and the per-cell 2D map want: discrete, and readable
 * straight off a biome id. This answers "what colour is the ground
 * here", which is a different question, and the 3D mesh is the caller
 * that needs it — see lushnessBand's own note that a renderer able to
 * vary continuously should read the scalar and leave the bands to the
 * legend.
 *
 * The difference that matters is the shore. Given a biome id, sand is
 * all-or-nothing, and a mesh interpolating between an all and a nothing
 * draws its own triangles instead of a coastline. Given the height, sand
 * is cover like rock and snow, and the boundary is an iso-height line at
 * whatever resolution the screen has. See SHORE.
 *
 * Lushness still only chooses among the six bands, deliberately: those
 * are a designed signal with swatches in the legend, and making them a
 * continuous ramp here would quietly contradict it.
 *
 * @param {number} biome one of the BIOME ids, for the cases that are not
 *   a lushness band at all — polar ice is white at sea level
 * @param {number} lushness [0, 1] from lushness.js
 * @param {number} height [0, 1]
 * @returns {[number, number, number]} channels in [0, 255], unrounded
 */
export function groundRgbAt(biome, lushness, height) {
  // The caps belong to no section and are not high ground; they are flat
  // ice sitting at sea level, so they take neither a band nor cover.
  if (biome === BIOME.SNOW) return shadeByHeight(BIOME_BASE_COLORS[BIOME.SNOW], height)

  const band = BIOME_BASE_COLORS[lushnessBand(lushness)] ?? FALLBACK_COLOR
  const ground = shadeByHeight(band, height)

  // Rock first, because it is the land's own surface; then the shore
  // over the top of it, seaward. The bands do not overlap in practice —
  // rockCover is 0 anywhere near the water — so this order is for
  // reading rather than for arithmetic.
  const withRock = mixRgb(
    ground,
    mixRgb(ROCK_DRY, ROCK_MOSSY, clamp(Number(lushness) || 0, 0, 1)),
    rockCover(height),
  )
  const withSand = mixRgb(withRock, shadeByHeight(BIOME_BASE_COLORS[BIOME.BEACH], height), sandCover(height))
  return mixRgb(withSand, shadeByHeight(BIOME_BASE_COLORS[BIOME.OCEAN], height), seaFloorCover(height))
}

/**
 * How much snow lies on a cell, in [0, 1] — the mix amount between
 * biomeGroundRgb and SNOW_RGB.
 *
 * Water takes none, for the same reason it takes no rock.
 *
 * @param {number} biome one of the BIOME ids
 * @param {number} height [0, 1]
 */
export function biomeSnowCover(biome, height) {
  if (biome === BIOME.OCEAN || biome === BIOME.BEACH) return 0
  return snowCover(height)
}

/**
 * biomeColor's answer as numbers, which is what every renderer actually
 * wanted — the 3D mesh was parsing this function's own output back with
 * a regex, once per vertex, 131k times per world.
 *
 * @param {number} biome one of the BIOME ids
 * @param {number} height [0, 1]
 * @returns {[number, number, number]} channels in [0, 255], rounded
 */
export function biomeRgb(biome, height) {
  const ground = biomeGroundRgb(biome, height)
  const withSnow = mixRgb(ground, SNOW_RGB, biomeSnowCover(biome, height))
  return withSnow.map((channel) => Math.round(clamp(channel, 0, 255)))
}

/** Swatch for the rock cover itself, at a given lushness. */
export function rockColor(lushness = 0) {
  const [r, g, b] = mixRgb(ROCK_DRY, ROCK_MOSSY, clamp(Number(lushness) || 0, 0, 1)).map((channel) =>
    Math.round(channel),
  )
  return `rgb(${r}, ${g}, ${b})`
}
