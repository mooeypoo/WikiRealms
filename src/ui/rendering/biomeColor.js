import { BIOME, LUSHNESS_BANDS, rockCover, snowCover } from '../../engine/generation/terrain.js'

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

/** Snow lying over whatever the rock band left. */
const SNOW_COLOR = [245, 245, 250]

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
 * heatmap renderer, the 3D mesh's vertex colors (via terrainMesh.js) and
 * the legend's swatches. Pure and deterministic: the same biome/height
 * always produces the same color.
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
  const base = BIOME_BASE_COLORS[biome] ?? FALLBACK_COLOR
  const shade = clamp(0.7 + height * 0.5, 0.5, 1.3)
  let color = base.map((channel) => channel * shade)

  // Water takes no rock and no snow: the bands sit far above sea level,
  // but skipping explicitly keeps a deep-ocean cell honest if they ever
  // move down.
  if (biome !== BIOME.OCEAN && biome !== BIOME.BEACH) {
    const rock = rockCover(height)
    if (rock > 0) {
      const lushness = LUSHNESS_BY_BAND.get(biome) ?? 0
      color = mixRgb(color, mixRgb(ROCK_DRY, ROCK_MOSSY, lushness), rock)
    }
    const snow = snowCover(height)
    if (snow > 0) color = mixRgb(color, SNOW_COLOR, snow)
  }

  const [r, g, b] = color.map((channel) => Math.round(clamp(channel, 0, 255)))
  return `rgb(${r}, ${g}, ${b})`
}

/** Swatch for the rock cover itself, at a given lushness. */
export function rockColor(lushness = 0) {
  const [r, g, b] = mixRgb(ROCK_DRY, ROCK_MOSSY, clamp(Number(lushness) || 0, 0, 1)).map((channel) =>
    Math.round(channel),
  )
  return `rgb(${r}, ${g}, ${b})`
}
