import { BIOME } from '../../engine/generation/terrain.js'

/**
 * Base RGB color per biome, before height-based shading is applied.
 * Lushness variants (desert through jungle) reflect citation density of the section:
 * higher citation = more lush/green. Water/mountain/snow are altitude-based.
 */
const BIOME_BASE_COLORS = {
  [BIOME.OCEAN]: [20, 70, 160],
  [BIOME.BEACH]: [214, 194, 145],
  [BIOME.DESERT]: [220, 185, 120], // sparse citations: warm sand/tan
  [BIOME.LIGHT_VEG]: [140, 170, 90], // 10-25% citations: pale green, scattered vegetation
  [BIOME.MEADOW]: [96, 158, 74], // 25-50% citations: mid green, open meadow
  [BIOME.WOODLAND]: [60, 110, 60], // 50-75% citations: dense forest green
  [BIOME.JUNGLE]: [30, 80, 40], // 75%+ citations: deep emerald jungle
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
