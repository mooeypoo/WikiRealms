import { BIOME } from '../../engine/generation/terrain.js'

/**
 * Base RGB color per biome, before height-based shading is applied.
 *
 * The six land colours are the lushness bands, least to most cited. They
 * are a ramp in three channels at once — hue from sand through olive to
 * green, saturation up, lightness down — because a ramp in hue alone left
 * the top two bands (two dark greens 16 units apart) indistinguishable on
 * screen. Water, mountain and snow are altitude, not citations.
 *
 * DUNES is deliberately the palest, most bleached tone in the set: it
 * means a section cites nothing, and it should read as absence rather
 * than as one more shade of dry.
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
  [BIOME.MOUNTAIN]: [120, 110, 102],
  [BIOME.SNOW]: [245, 245, 250],
}

const FALLBACK_COLOR = [128, 128, 128]

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

/**
 * Maps a terrain cell's biome and height to a CSS color, for use by the
 * 2D heatmap renderer (or any other presentation). Pure and deterministic:
 * the same biome/height always produces the same color.
 * @param {number} biome one of the BIOME ids
 * @param {number} height [0, 1]
 * @returns {string} CSS `rgb(...)` color
 */
export function biomeColor(biome, height) {
  const base = BIOME_BASE_COLORS[biome] ?? FALLBACK_COLOR
  const shade = clamp(0.7 + height * 0.5, 0.5, 1.3)
  const [r, g, b] = base.map((channel) => Math.round(clamp(channel * shade, 0, 255)))
  return `rgb(${r}, ${g}, ${b})`
}
