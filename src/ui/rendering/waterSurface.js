/**
 * The sea as a surface: how deep it is, what colour that makes it, and
 * how much of the floor it hides.
 *
 * WHAT WAS WRONG WITH ONE FLAT BLUE
 *
 * The water was a two-triangle plane in a single colour at a single
 * opacity, which gets three things wrong at once. A lagoon by the beach
 * read exactly as deep ocean, so the sea carried no depth cue at all
 * while the land beside it had been given occlusion, cast shadows and
 * aerial haze. It took no light of its own — a headland's shadow fell
 * across the bay and stopped at the waterline. And because its opacity
 * never changed, the place it MET the land was a hard geometric line:
 * the intersection of a flat plane with a grid of triangles, which is
 * the one part of the jagged-coast complaint that softening the ground's
 * colours could not reach. See SHORE in the generation config for the
 * other part.
 *
 * All three come back to the same missing number, which is how far the
 * floor is below the surface at each point.
 *
 * DEPTH DOES THE WORK THREE TIMES
 *
 * It sets the colour, from a shallow turquoise to a deep blue. It sets
 * the opacity, so shallows show the sand through them and the deep does
 * not. And because the opacity starts at ZERO where the depth does, the
 * waterline stops being an edge: the sea fades in over the shelf, and
 * the sharp line where the plane cuts the terrain now has nothing drawn
 * on it. The staircase is not smoothed, it is unpainted.
 *
 * Free of three.js, like the rest of ui/rendering that is not a mesh:
 * this returns typed arrays and the caller makes them attributes.
 */
import { BIOME_THRESHOLDS } from '../../engine/generation/config.js'

/**
 * The water's own palette, and why it is not in biomeColor.js with
 * everything else.
 *
 * That module answers "what colour is this biome", and the sea floor is
 * a biome — BIOME.OCEAN's deep blue is the colour of the GROUND down
 * there, which seaFloorCover already fades the sand into. This is a
 * different thing standing on top of it: the water itself, whose colour
 * is a function of depth rather than of any biome, and which is
 * composited over that floor rather than replacing it.
 *
 * Shallow is a turquoise because shallow water over pale sand is one,
 * and because it has to differ from the floor it is laid over or the
 * shelf shows nothing. Deep is darker than the floor's own blue, so that
 * depth reads as depth even where the floor stops getting deeper — the
 * height map bottoms out at 0.10 and a quarter of the ocean sits on that
 * floor, which would otherwise be one flat tone across the whole basin.
 */
const WATER_SHALLOW_RGB = Object.freeze([104, 194, 188])
const WATER_DEEP_RGB = Object.freeze([12, 44, 102])

/**
 * The depths the ramps run over, in the height map's own [0, 1] units,
 * and every one of them measured against a generated world rather than
 * picked. Over the 83,026 ocean cells of the Grand Canyon realm, depth
 * below sea level runs:
 *
 *   p01     p10     p25     p50     p75     p90     max
 *   0.003   0.032   0.083   0.154   0.200   0.215   0.220
 *
 * The floor bottoms out 0.22 below the waterline and half the ocean is
 * past 0.154, so a ramp has to spend its range in the first third to
 * describe anything.
 */
export const WATER = Object.freeze({
  // Where the water reaches full opacity — the outer edge of the shelf.
  //
  // 0.08 is the ocean's p25, so a quarter of the sea is somewhere in
  // this fade and the rest is fully water. In cells that is the useful
  // way to read it: at the measured coastal gradient of 0.0075 of height
  // per cell, this band is about eleven cells wide, which is what turns
  // the waterline from an edge into a shore.
  opaqueDepth: 0.08,
  // Where the colour finishes darkening. Longer than the opacity ramp,
  // and deliberately: opacity has to finish early or the shelf would go
  // on showing the floor halfway out to sea, while colour has the whole
  // basin to describe and reaches the ocean's p90 before it stops.
  colorDepth: 0.18,
  // How much of the floor the deep sea hides. Not 1: water is not paint,
  // and leaving a fifth of the floor showing is what keeps the deep
  // reading as a volume with something at the bottom of it. The old flat
  // plane sat at 0.55 everywhere, which was too clear for the deep and
  // far too opaque at the shore.
  maxOpacity: 0.8,
})

/** Smooth 0→1 ramp with zero slope at both ends, as in terrain.js. */
function smoothstep(edge0, edge1, value) {
  if (edge1 <= edge0) return value >= edge1 ? 1 : 0
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/**
 * How far the floor lies below the waterline at this height, in [0, ~],
 * and 0 for any ground standing above it.
 *
 * @param {number} height01 the height map's own value for a cell
 */
export function waterDepth(height01) {
  return Math.max(0, BIOME_THRESHOLDS.oceanMaxHeight - (Number(height01) || 0))
}

/**
 * How much the water hides the floor at this depth, in [0, 1].
 *
 * Zero at zero depth, which is the whole trick: the sea is drawn as
 * nothing exactly where it meets the land, so the hard line where the
 * surface cuts through the terrain has no colour on it to show.
 */
export function waterOpacity(depth) {
  return WATER.maxOpacity * smoothstep(0, WATER.opaqueDepth, Math.max(0, Number(depth) || 0))
}

/**
 * The water's own colour at this depth, before any light.
 *
 * @returns {[number, number, number]} channels in [0, 255]
 */
export function waterRgbAt(depth) {
  const t = smoothstep(0, WATER.colorDepth, Math.max(0, Number(depth) || 0))
  return [
    WATER_SHALLOW_RGB[0] + (WATER_DEEP_RGB[0] - WATER_SHALLOW_RGB[0]) * t,
    WATER_SHALLOW_RGB[1] + (WATER_DEEP_RGB[1] - WATER_SHALLOW_RGB[1]) * t,
    WATER_SHALLOW_RGB[2] + (WATER_DEEP_RGB[2] - WATER_SHALLOW_RGB[2]) * t,
  ]
}

/**
 * Colour and opacity per cell, as one RGBA buffer for a vertex colour.
 *
 * Four components rather than three because that is how three decides a
 * mesh has per-vertex alpha: an itemSize of 4 on the colour attribute,
 * with vertexColors on, is what makes it define USE_COLOR_ALPHA. So the
 * opacity travels with the colour instead of needing an attribute and a
 * define of its own.
 *
 * Channels are already in [0, 1] for the GPU, as computeGroundAttributes
 * hands its colours over.
 *
 * @param {{ width: number, height: number, heightMap: Float64Array }} terrain
 * @returns {Float32Array} four values per cell, row-major
 */
export function computeWaterAttributes(terrain) {
  const { width, height, heightMap } = terrain
  const cells = width * height
  const colors = new Float32Array(cells * 4)

  for (let i = 0; i < cells; i += 1) {
    const depth = waterDepth(heightMap[i])
    const [r, g, b] = waterRgbAt(depth)
    colors[i * 4] = r / 255
    colors[i * 4 + 1] = g / 255
    colors[i * 4 + 2] = b / 255
    colors[i * 4 + 3] = waterOpacity(depth)
  }

  return colors
}

/**
 * Throws away the triangles of the water grid that have no water on
 * them, which is a third of it.
 *
 * The sea spans the whole footprint so that its boundary is never a
 * boundary — trimming it to the cells below sea level would give the
 * water an edge at cell resolution, which is the staircase this was
 * built to remove. But a triangle whose every corner is dry has an
 * opacity of zero at every corner, so it is a triangle that draws
 * nothing, and drawing nothing is not free: it is still transformed,
 * still shaded, and every one of its fragments still goes through the
 * blend.
 *
 * It is a small saving and worth being accurate about, because a GPU
 * timer's medians drift by more than the whole effect and the first
 * numbers this was measured with were noise. Interleaving the variants
 * frame by frame so the drift cancels, on integrated graphics at 1080p:
 * the sea costs 3.74ms a frame at full grid and 3.42ms with the dry
 * third dropped, against a 10.5ms scene without it. So 0.5ms, and the
 * useful thing the measurement says is that the cost is nearly all
 * FILL rather than vertices — a third fewer triangles bought 14% of the
 * water's time. There is no case here for thinning the grid: it would
 * cost the shore its resolution and buy almost nothing.
 *
 * Dropping them is not a compromise: the result is the same pixels. The
 * kept region still reaches a full cell PAST the waterline on the dry
 * side — any triangle touching a wet corner stays — so the fade still
 * has its zero to fade to, and the shore keeps every vertex it had.
 *
 * @param {Uint32Array|Uint16Array} indices triangles from buildWaterArrays
 * @param {{ heightMap: Float64Array }} terrain
 */
export function dropDryTriangles(indices, terrain) {
  const { heightMap } = terrain
  const kept = new indices.constructor(indices.length)
  let out = 0
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i]
    const b = indices[i + 1]
    const c = indices[i + 2]
    if (waterDepth(heightMap[a]) <= 0 && waterDepth(heightMap[b]) <= 0 && waterDepth(heightMap[c]) <= 0) continue
    kept[out] = a
    kept[out + 1] = b
    kept[out + 2] = c
    out += 3
  }
  return kept.subarray(0, out)
}
