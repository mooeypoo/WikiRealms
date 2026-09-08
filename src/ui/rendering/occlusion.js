/**
 * How much of the sky each cell of the terrain can see.
 *
 * WHY NOT THREE'S SHADOW MAPS, WHICH THIS REPLACES THE NEED FOR
 *
 * Ambient occlusion and shadow are the same question asked of two
 * different light sources — what is between this point and the light —
 * and a shadow map answers it by re-rendering the scene from the light's
 * side every frame. That is the right tool when the scene can change.
 * Here it is a poor one, for three reasons that all point the same way:
 *
 *   - The terrain and the vegetation are drawn with a hand-written
 *     ShaderMaterial. Receiving a shadow map means maintaining a copy of
 *     three's shadowmap chunks, and CASTING one means a second depth
 *     material that reproduces the wind displacement exactly, or every
 *     plant's shadow stands still while the plant sways.
 *   - A directional shadow frustum has to cover the whole world — 512 by
 *     256 units flat, or a planet — so at any texture size a shadow is
 *     several cells wide. The features worth showing are one cell.
 *   - It is a per-frame cost, and on the phones that most need help it
 *     is the largest one available. The commit before this one existed
 *     to stop paying per-frame for detail nobody can see.
 *
 * The terrain, meanwhile, is a HEIGHT FIELD under a fixed sun. Nothing
 * about the occlusion changes after the world is generated, so it can be
 * computed once, from the height map, and carried as a vertex attribute.
 * Deterministic, free per frame, and exact at cell resolution rather
 * than blurred across several.
 *
 * WHAT IT COMPUTES
 *
 * For each cell, the fraction of a cosine-weighted sky hemisphere that
 * is not blocked by the terrain around it — a horizon scan. Rays are
 * traced outward along a few compass bearings; each one reports the
 * steepest thing it climbed, and that becomes a horizon angle.
 *
 * The closed form is the pleasant part. For one bearing whose horizon
 * sits at angle h, the visible share of a cosine-weighted hemisphere is
 * cos²(h) — and since the scan produces a SLOPE rather than an angle,
 * and cos²(atan(s)) is 1/(1 + s²), the whole thing is one divide. No
 * trigonometry runs anywhere in this file.
 *
 * WHY IT IS WORTH THE BUILD COST
 *
 * A directional light alone cannot describe a shape that is enclosed.
 * The floor of a ravine and the top of a plateau face the same way, so
 * half-Lambert gives them the same colour, and the ravine reads as a
 * painted line on flat ground. Sky visibility is the term that separates
 * them, and it is why this reads as terrain rather than as a relief map.
 *
 * Free of three.js, like the rest of ui/rendering that is not a mesh:
 * this returns a Float32Array, and the caller makes it an attribute.
 */

/**
 * How the scan is shaped: how many bearings, and how far out along each.
 *
 * `bearings` is 8 — the compass points. Fewer starts to show as
 * directional streaking on smooth slopes, since a cell's darkness then
 * depends visibly on which few directions happened to be sampled.
 *
 * `steps` are DISTANCES IN CELLS, not a stride, and they lengthen as
 * they go out. That is the whole reason this is affordable: occlusion is
 * dominated by what is close, so the first few cells are sampled every
 * one, while the far end — where a ridge subtends a small angle and only
 * matters if it is genuinely large — is sampled coarsely. Nine steps
 * reach 20 cells at the cost of nine samples rather than twenty.
 *
 * 20 cells is about a third of the way up a typical range at this grid
 * size, which is far enough to catch a valley wall and not so far that
 * every cell in a basin sees the same distant rim and the whole basin
 * flattens to one tone.
 */
export const SKY_SCAN = Object.freeze({
  bearings: 8,
  steps: Object.freeze([1, 2, 3, 4, 6, 8, 11, 15, 20]),
})

/**
 * The eight compass bearings, as integer cell steps.
 *
 * Integers rather than a unit circle, so a step lands exactly on a cell
 * and needs no interpolation or filtering.
 */
const BEARINGS = Object.freeze([
  Object.freeze([1, 0]),
  Object.freeze([1, 1]),
  Object.freeze([0, 1]),
  Object.freeze([-1, 1]),
  Object.freeze([-1, 0]),
  Object.freeze([-1, -1]),
  Object.freeze([0, -1]),
  Object.freeze([1, -1]),
])

/**
 * Sky visibility per cell, in [0, 1]: 1 is an open plain, lower is
 * enclosed.
 *
 * `heightScale` is what makes this a geometric answer rather than an
 * arbitrary one, and it is NOT the same for both views: the flat map
 * exaggerates relief to 0.26 of its short axis, about 67 units, while
 * the globe compresses the same height map into 0.15 of its radius,
 * about 12. The flat map's terrain is genuinely five times steeper, so
 * it is genuinely more occluded, and passing the projection's own scale
 * is what keeps that true instead of picking one and being wrong on the
 * other.
 *
 * `wrapX` follows the mesh: the planet's grid meets itself at the
 * antimeridian, so a cell on the last column is shadowed by the first.
 * The flat map has an edge there, and a cell at the edge simply sees
 * more sky.
 *
 * `curvatureRadius` is the globe's radius in the same units, or 0 for a
 * plane. On a sphere the ground falls away from the local tangent plane
 * with distance — about d²/2R — so a ridge 20 cells off is 2.5 units
 * lower than a flat reading of the height map suggests, against a total
 * relief of only 12. Ignoring it would report distant terrain as
 * blocking sky that it has already curved below, and basins would come
 * out uniformly dark.
 *
 * THE RANGE THIS ACTUALLY RETURNS, measured over a generated world, so
 * that nobody has to guess at it downstream:
 *
 *              min    p01    p10    median   p90
 *   flat      0.407  0.536  0.696   0.869   0.993
 *   sphere    0.742  0.865  0.974   0.997   1.000
 *
 * Two things worth reading off that. It never comes near 0 — a cell has
 * to be walled in on all eight bearings for that, and terrain generated
 * from a height map is not — so there is no need to hold it off black.
 * And the high medians are not the term failing: most of a world is
 * ocean and plain, which genuinely sees the whole sky. The work happens
 * in the tail, which is exactly the ravines and valley walls that a
 * directional light alone renders identically to flat ground.
 *
 * @param {{ width: number, height: number, heightMap: Float64Array }} terrain
 * @param {{ heightScale: number, wrapX?: boolean, curvatureRadius?: number }} options
 * @returns {Float32Array} one value per cell, row-major
 */
export function computeSkyVisibility(terrain, { heightScale, wrapX = false, curvatureRadius = 0 }) {
  const { width, height, heightMap } = terrain
  const cells = width * height
  const visibility = new Float32Array(cells)
  const { steps } = SKY_SCAN
  const stepCount = steps.length

  // One bearing at a time in the OUTER loop, accumulating into the
  // result. Every per-bearing constant then hoists out of the 131,072
  // cells beneath it, which is most of why this is fast enough to run
  // on a rebuild: the first draft walked cells outermost and destructured
  // a fresh [dx, dy] and a {distance, drop} object per sample, and spent
  // more time on iterator protocol than on height samples.
  for (let b = 0; b < BEARINGS.length; b += 1) {
    const dx = BEARINGS[b][0]
    const dy = BEARINGS[b][1]
    // A diagonal step of 1 has travelled 1.414 cells. Calling it 1 would
    // report every diagonal slope 41% too steep and darken every
    // hillside along four of the eight bearings.
    const cellsPerStep = dx !== 0 && dy !== 0 ? Math.SQRT2 : 1

    // Reciprocals, so the inner loop divides nothing.
    const inverseDistance = new Float64Array(stepCount)
    const drop = new Float64Array(stepCount)
    for (let s = 0; s < stepCount; s += 1) {
      const distance = steps[s] * cellsPerStep
      inverseDistance[s] = 1 / distance
      drop[s] = curvatureRadius > 0 ? (distance * distance) / (2 * curvatureRadius) : 0
    }

    for (let gridY = 0; gridY < height; gridY += 1) {
      for (let gridX = 0; gridX < width; gridX += 1) {
        const index = gridY * width + gridX
        const originHeight = heightMap[index]
        let steepest = 0

        for (let s = 0; s < stepCount; s += 1) {
          const step = steps[s]

          // The poles are not a wall. A ray leaving the top row has run
          // out of terrain, not met a cliff, so it stops looking rather
          // than clamping to the edge row and reading whatever height is
          // there over and over.
          const sampleY = gridY + dy * step
          if (sampleY < 0 || sampleY >= height) break

          let sampleX = gridX + dx * step
          if (wrapX) {
            sampleX = ((sampleX % width) + width) % width
          } else if (sampleX < 0 || sampleX >= width) {
            break
          }

          const rise = (heightMap[sampleY * width + sampleX] - originHeight) * heightScale - drop[s]
          if (rise <= 0) continue

          const slope = rise * inverseDistance[s]
          if (slope > steepest) steepest = slope
        }

        // cos²(atan(slope)): the cosine-weighted share of this bearing's
        // slice of sky still above the horizon it found.
        visibility[index] += 1 / (1 + steepest * steepest)
      }
    }
  }

  const perBearing = 1 / BEARINGS.length
  for (let i = 0; i < cells; i += 1) visibility[i] *= perBearing

  return visibility
}
