/**
 * The colour grade as a lookup texture — the seam seasons act through.
 *
 * WHY A LUT AND NOT ANOTHER UNIFORM TINT
 *
 * A single tint multiplies every surface the same way, so a winter wash
 * that cools a meadow also cools the snow and the sea in lockstep, and
 * there is no room for "greens go olive, sand goes pale, whites stay
 * white". A lookup keyed on the colour itself can say different things
 * about different colours, which is the whole of what a season is: the
 * same light, a different palette.
 *
 * WHY IT SITS AFTER THE ALBEDO AND BEFORE THE LIGHT
 *
 * Snow, foam and the sea's own depth colour have already been mixed into
 * the albedo by the time this runs. Grading that result means winter
 * leaves the snow white (near-white inputs stay near-white in the table)
 * and cools the greens under it, without also cooling the sun's glint or
 * the haze — those arrive later and are not a property of the surface.
 *
 * WHY THE ORIGINAL 9×256 BIOME LUT IS NOT THIS
 *
 * That idea was "bake groundRgbAt into a texture and sample it", which
 * the ground/snow colour split already made unnecessary: one JS function
 * feeds the 2D map, the legend and the vertex colours, and they cannot
 * drift. What is left of the plan is the seasons seam, and that is a
 * grade of the finished albedo, not a second authority for what the
 * ground is.
 *
 * The table is a 16³ RGB cube packed into a 256×16 DataTexture — sixteen
 * blue-slices of 16×16, left to right. Small enough to be a footnote on
 * a frame, large enough that a green and its neighbour do not posterise
 * when the season blend is only part-way on.
 */
import * as THREE from 'three'

/** Edge length of the cube. 16³ = 4096 texels; the packed texture is 256×16. */
export const COLOR_LUT_SIZE = 16

/**
 * How a winter realm remaps a working-space RGB colour.
 *
 * Exported so the texture builder and the unit tests share one function:
 * a LUT that disagreed with its own filler would be a silent defect.
 *
 * @param {number} r [0, 1]
 * @param {number} g [0, 1]
 * @param {number} b [0, 1]
 * @returns {[number, number, number]}
 */
export function winterGrade(r, g, b) {
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b
  // Soft olive sink — enough that a full-strength blend would read as
  // cooler leaves, not the concrete grey the first cut painted when
  // season often sat near 1.
  const coolR = y * 0.92
  const coolG = y * 0.98
  const coolB = Math.min(1, y * 1.06)

  // How vegetated this sample is. Pure grey scores 0; a saturated leaf
  // green scores near 1. Snow and rock sit near 0 and are left alone.
  const vegetated = clamp01(Math.max(0, g - r) * 2.2 + Math.max(0, g - b) * 1.4)
  // How warm/sandy. High for dunes and beaches, low for the sea.
  const warm = clamp01((r - b) * 1.6)

  let outR = r
  let outG = g
  let outB = b

  // Greens tip olive and lose a little saturation — a hint of cold,
  // not a climate change. Peak winter on a realm is altitude snow.
  const vegMix = vegetated * 0.28
  outR = mix(outR, coolR, vegMix)
  outG = mix(outG, coolG * 0.98, vegMix)
  outB = mix(outB, coolB, vegMix)

  // Warm ground cools and pales a little. Full desaturation would turn
  // a desert into concrete; a partial pull is enough for the season to
  // show without erasing the band.
  const warmMix = warm * 0.18
  outR = mix(outR, y * 1.02, warmMix)
  outG = mix(outG, y * 0.995, warmMix)
  outB = mix(outB, Math.min(1, y * 1.03), warmMix)

  // A light cool cast over everything, including the sea. Near-whites
  // barely move (their channels are already close), which is what keeps
  // snow looking like snow.
  outR *= 0.99
  outB = Math.min(1, outB * 1.015)

  return [clamp01(outR), clamp01(outG), clamp01(outB)]
}

/**
 * Identity grade: every colour maps to itself. The summer end of the
 * blend, and the reference the winter table is measured against.
 */
export function identityGrade(r, g, b) {
  return [clamp01(r), clamp01(g), clamp01(b)]
}

/**
 * Builds a packed DataTexture from a grade function.
 *
 * @param {(r: number, g: number, b: number) => [number, number, number]} grade
 * @returns {THREE.DataTexture}
 */
export function buildColorLut(grade) {
  const size = COLOR_LUT_SIZE
  const width = size * size
  const height = size
  const data = new Uint8Array(width * height * 4)

  for (let bi = 0; bi < size; bi++) {
    for (let gi = 0; gi < size; gi++) {
      for (let ri = 0; ri < size; ri++) {
        const r = ri / (size - 1)
        const g = gi / (size - 1)
        const b = bi / (size - 1)
        const [outR, outG, outB] = grade(r, g, b)
        // Slice `bi` sits at columns [bi*size, (bi+1)*size); within it,
        // R runs on X and G on Y — the layout sampleColorLut in the
        // shader mirrors exactly.
        const x = bi * size + ri
        const y = gi
        const index = (y * width + x) * 4
        data[index] = Math.round(outR * 255)
        data[index + 1] = Math.round(outG * 255)
        data[index + 2] = Math.round(outB * 255)
        data[index + 3] = 255
      }
    }
  }

  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat)
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearFilter
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.needsUpdate = true
  // Working-space colours go in and working-space colours come out; the
  // renderer must not re-interpret the table as sRGB display data.
  texture.colorSpace = THREE.NoColorSpace
  return texture
}

/** Shared winter table. One texture for every stylized material. */
let winterLut = null

/**
 * The winter LUT, created once and reused. Materials share it so a
 * season change is one uniform write rather than a texture rebuild.
 */
export function winterColorLut() {
  if (!winterLut) winterLut = buildColorLut(winterGrade)
  return winterLut
}

/**
 * Samples the same packing the shader uses, in JS. Tests confirm the
 * texture bytes agree with winterGrade at the lattice points, and that
 * the layout the GLSL reads is the layout that was written.
 *
 * @param {THREE.DataTexture} texture
 * @param {number} r [0, 1]
 * @param {number} g [0, 1]
 * @param {number} b [0, 1]
 * @returns {[number, number, number]}
 */
export function sampleColorLut(texture, r, g, b) {
  const size = COLOR_LUT_SIZE
  const width = size * size
  const data = texture.image.data
  const scaledR = clamp01(r) * (size - 1)
  const scaledG = clamp01(g) * (size - 1)
  const scaledB = clamp01(b) * (size - 1)
  const ri = Math.round(scaledR)
  const gi = Math.round(scaledG)
  const bi = Math.round(scaledB)
  const index = (gi * width + bi * size + ri) * 4
  return [data[index] / 255, data[index + 1] / 255, data[index + 2] / 255]
}

function clamp01(value) {
  return Math.min(1, Math.max(0, Number(value) || 0))
}

function mix(from, to, amount) {
  return from + (to - from) * amount
}
