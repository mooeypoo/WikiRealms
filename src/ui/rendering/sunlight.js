/**
 * Whether the sun reaches each cell of the terrain: cast shadows, baked
 * from the height map.
 *
 * THE SAME SCAN AS THE SKY, ASKED OF ONE DIRECTION
 *
 * occlusion.js traces eight bearings and asks what fraction of the sky
 * each cell can see. This traces ONE — the sun's — and asks whether
 * anything along it stands high enough to block a single light. The
 * argument for baking rather than using three's shadow maps is made in
 * full over there and applies here unchanged, with one addition that is
 * specific to shadows: a shadow map's frustum has to cover the whole
 * world, so at any texture size a shadow is several cells wide, and the
 * ridges worth showing are one cell. A height-field scan is exact at
 * cell resolution because the height map IS the resolution.
 *
 * The shader was built for this. Sky visibility attenuates the ambient
 * term and deliberately not the directional one, and says why: "The sun
 * is one direction and either reaches a surface or does not — that is a
 * shadow, a different question." This is that question, and it
 * multiplies the directional term alone.
 *
 * WHAT IT DOES NOT DO
 *
 * The height map is the terrain, so the terrain shadows itself and
 * nothing else. Mountains cast; trees do not, and neither do trees
 * receive a shadow that is any finer than the cell they stand in. A tree
 * casting its own shadow needs the vegetation in the occluder set, which
 * means a depth pass, which means reproducing the wind displacement in
 * it — the cost occlusion.js declined, for the same reasons.
 *
 * Free of three.js, like the rest of ui/rendering that is not a mesh.
 */

/**
 * How soft the shadow's edge is, as a width in SLOPE around the sun's.
 *
 * The scan produces the steepest slope anything reached along the sun's
 * bearing, and the sun's own slope is the threshold: steeper blocks,
 * shallower does not. This is how wide a band around that threshold the
 * transition takes.
 *
 * Slope space rather than distance or world units, because the width in
 * DISTANCE it implies then grows with distance from the occluder, which
 * is the direction a real penumbra grows in.
 *
 * A hard edge is the physically honest answer for a body half a degree
 * across, and it is the wrong one here. The attribute is per vertex and
 * the GPU interpolates it, so a field that steps between neighbours puts
 * the visible boundary wherever the interpolation happens to cross a
 * half — which is to say along the triangle edges, taking the shape of
 * the mesh rather than the shape of the ridge. That is precisely the
 * artefact the shore spent a commit removing; see SHORE in the
 * generation config.
 *
 * CENTRED on the sun's slope, not run outwards from it, and for the same
 * reason SHORE's sand band is centred. Softening from the threshold
 * outwards only ever removes shadow: it cannot reach full darkness until
 * the terrain out-climbs the sun by the whole width, so measured over a
 * generated world it cost a third of the shadowed area (4.7% of land
 * against 6.0%) and pulled every shadow back toward its occluder. A
 * centred band puts half darkness exactly where the geometry says the
 * edge is, so the two halves cancel and the shadow keeps its extent:
 * 6.1% of land, against 6.0% for a hard edge.
 *
 * 0.3 is what that costs. Measured on the same world it takes the edge
 * from 2.4 cells to 3.1, which is enough for the boundary to read as a
 * line across the ground rather than as a row of triangles, and short
 * of the 4.7 cells that 0.6 gives, where a small shadow is all edge.
 */
const SHADOW_SOFTNESS = 0.3

/**
 * How far along the sun's bearing to look, in cells.
 *
 * A shadow's length is the occluder's height over the sun's slope, so
 * the useful distance follows from the relief and the sun's elevation
 * and is computed per call rather than guessed. This is the ceiling on
 * that, for the case the arithmetic does not bound: near the terminator
 * on the globe the sun's slope approaches zero and the implied distance
 * runs away.
 *
 * 48 cells is past where the globe's own curvature has taken care of it
 * — the ground falls d²/2R below the tangent plane, which at 48 cells is
 * 14 units against a total relief of 12, so nothing that far away can
 * block anything. On the flat map the relief bound is the smaller of the
 * two at any sun elevation above about 35°.
 */
const MAX_SHADOW_CELLS = 48

/**
 * Sunlight per cell, in [0, 1]: 1 in full sun, 0 in shadow.
 *
 * `sunDirection` points TOWARD the sun, in the mesh's own local frame —
 * the frame heightMap indexes into, where +z is up and one cell is one
 * unit. Not world space: the shared worldGroup rotation stands between
 * the two, and passing a world vector here tilts every shadow in the
 * scene by 90°. The caller converts, because the caller is the one that
 * knows about the group.
 *
 * `heightScale`, `wrapX` and `curvatureRadius` mean exactly what they
 * mean in computeSkyVisibility, and for the same reasons: the flat map's
 * relief is genuinely five times the globe's, the planet's grid meets
 * itself at the antimeridian, and on a sphere a distant ridge has
 * already curved below the local tangent plane.
 *
 * WHAT IT PRODUCES AND WHAT IT COSTS, measured over a generated world
 * at 512x256, so that nobody downstream has to guess:
 *
 *              in shadow   mean   trace
 *   flat          6.1%     0.93    33ms
 *   globe        45.5% *   0.51 *  46ms
 *
 * The flat figures are over LAND, since two thirds of a world is ocean
 * and open water is level and shadows nothing. Read the 6% with the
 * geometry in mind rather than as a disappointment: the sun sits 59°
 * up, so a ridge shadows about 0.6 of its own height, and the shadows
 * that do land are 20 to 60 levels deep out of 255 where they fall.
 *
 * The globe's figures are starred because half of them are not shadow
 * at all: it is a sphere under a fixed sun, so 50% of the grid is simply
 * facing away and reads 0 for night. Its actual cast shadows are close
 * to nothing, and correctly so — the globe compresses the same relief
 * 5.4x (see SPHERE_VIEW.reliefRatio), which shortens every shadow by
 * the same factor to around a cell and a half.
 *
 * `spherical` is what makes the sun's elevation a per-cell quantity. On
 * the flat map there is one up for the whole world, so the sun sits at
 * one elevation and one bearing everywhere and both hoist out of the
 * loop. On the globe up is the radial, so the sun stands overhead at one
 * place, grazes the ground at the terminator, and is below the horizon
 * for half the cells — the elevation and the compass bearing have to be
 * recomputed per cell from that cell's own frame.
 *
 * @param {{ width: number, height: number, heightMap: Float64Array }} terrain
 * @param {{ sunDirection: { x: number, y: number, z: number }, heightScale: number,
 *   spherical?: boolean, wrapX?: boolean, curvatureRadius?: number }} options
 * @returns {Float32Array} one value per cell, row-major
 */
export function computeSunlight(terrain, {
  sunDirection,
  heightScale,
  spherical = false,
  wrapX = false,
  curvatureRadius = 0,
}) {
  const { width, height, heightMap } = terrain
  const sunlight = new Float32Array(width * height).fill(1)

  const sun = normalize(sunDirection)
  // A sun with no direction lights nothing in particular; leaving the
  // buffer at 1 is the answer that changes no pixel.
  if (!sun) return sunlight

  if (spherical) {
    traceSphere({ heightMap, width, height, heightScale, wrapX, curvatureRadius, sun, sunlight })
  } else {
    traceFlat({ heightMap, width, height, heightScale, wrapX, curvatureRadius, sun, sunlight })
  }

  return sunlight
}

/**
 * The flat map: one sun bearing and one elevation for the whole grid.
 *
 * Local +x is +gridX and local +y is -gridY (the flat projection mirrors
 * rows so that row 0 lands at the top), which is the whole of the
 * conversion from a local direction to a direction across the grid.
 */
function traceFlat({ heightMap, width, height, heightScale, wrapX, curvatureRadius, sun, sunlight }) {
  const horizontal = Math.hypot(sun.x, sun.y)

  // Straight overhead. Nothing can stand between a surface and a light
  // directly above it except terrain that overhangs, and a height field
  // has none by construction.
  if (horizontal < 1e-6) return

  const stepX = sun.x / horizontal
  const stepY = -sun.y / horizontal
  const sunSlope = sun.z / horizontal
  const reach = shadowReach(sunSlope, heightScale)

  for (let gridY = 0; gridY < height; gridY += 1) {
    for (let gridX = 0; gridX < width; gridX += 1) {
      const index = gridY * width + gridX
      const steepest = steepestToward({
        heightMap, width, height, wrapX, curvatureRadius, heightScale,
        gridX, gridY, stepX, stepY, reach, originHeight: heightMap[index],
      })
      sunlight[index] = litFraction(steepest, sunSlope)
    }
  }
}

/**
 * The globe: the sun's elevation and bearing per cell, from that cell's
 * own tangent frame.
 *
 * The sun is fixed and the ground curves away underneath it, so a cell's
 * frame is the only thing that changes. Up is the radial. East is the
 * direction longitude increases in, which is +gridX; north is the
 * direction latitude increases in, which is MINUS gridY, since row 0 is
 * the north pole. One cell is one unit of arc along either — the grid is
 * sized for that (see planetRadius) — so a bearing in east/north is
 * already a bearing in cells and needs no scaling.
 */
function traceSphere({ heightMap, width, height, heightScale, wrapX, curvatureRadius, sun, sunlight }) {
  const TAU = Math.PI * 2

  for (let gridY = 0; gridY < height; gridY += 1) {
    // Latitude is a property of the row, so its trigonometry hoists out
    // of the 512 cells in it.
    const latitude = Math.PI / 2 - (height > 1 ? gridY / (height - 1) : 0.5) * Math.PI
    const sinLatitude = Math.sin(latitude)
    const cosLatitude = Math.cos(latitude)

    for (let gridX = 0; gridX < width; gridX += 1) {
      const index = gridY * width + gridX
      const longitude = (gridX / width) * TAU
      const cosLongitude = Math.cos(longitude)
      const sinLongitude = Math.sin(longitude)

      // The cell's own axes, matching sphereProjection.normalAt and its
      // derivatives with respect to longitude and latitude.
      const upX = cosLatitude * cosLongitude
      const upY = cosLatitude * sinLongitude
      const upZ = sinLatitude

      const sinElevation = sun.x * upX + sun.y * upY + sun.z * upZ

      // The sun's bearing across the ground: its direction with the
      // vertical part removed, read against east and north.
      const eastX = -sinLongitude
      const eastY = cosLongitude
      const northX = -sinLatitude * cosLongitude
      const northY = -sinLatitude * sinLongitude
      const northZ = cosLatitude

      const tangentX = sun.x - sinElevation * upX
      const tangentY = sun.y - sinElevation * upY
      const tangentZ = sun.z - sinElevation * upZ

      const east = tangentX * eastX + tangentY * eastY
      const north = tangentX * northX + tangentY * northY + tangentZ * northZ
      const horizontal = Math.hypot(east, north)

      if (horizontal < 1e-6) {
        // The sun is on this cell's own axis: straight overhead, where a
        // height field can hide nothing, or straight underfoot, which is
        // the middle of the night.
        sunlight[index] = sinElevation > 0 ? 1 : 0
        continue
      }

      const sunSlope = sinElevation / horizontal

      // THE TERMINATOR, and why it is not a branch on the sign.
      //
      // A slope is a tangent, so an elevation below the horizon is a
      // NEGATIVE slope and the same soft threshold keeps working through
      // zero: flat ground reads half lit exactly at the terminator and
      // falls to nothing about eight degrees past it. Cutting to 0 the
      // moment the sun dips instead put a hard line around the planet at
      // precisely the place the half-Lambert term goes out of its way to
      // keep soft — see the wrapped diffuse in stylizedMaterial.
      //
      // Which makes this early-out exact rather than an approximation:
      // below the band the smoothstep has already saturated, so the scan
      // could only return the same 0. It is also what keeps the night
      // side free, and the night side is half the world.
      if (sunSlope <= -SHADOW_SOFTNESS / 2) {
        sunlight[index] = 0
        continue
      }

      const steepest = steepestToward({
        heightMap, width, height, wrapX, curvatureRadius, heightScale,
        gridX, gridY,
        stepX: east / horizontal,
        stepY: -north / horizontal,
        reach: shadowReach(sunSlope, heightScale),
        originHeight: heightMap[index],
      })
      sunlight[index] = litFraction(steepest, sunSlope)
    }
  }
}

/**
 * The steepest slope anything reaches along one bearing, as seen from
 * one cell — the same quantity computeSkyVisibility's inner loop finds,
 * for an arbitrary bearing rather than one of eight compass points.
 *
 * Every cell along the way, rather than the lengthening ladder the sky
 * scan can afford. Occlusion is an average over a hemisphere, so a
 * sample missed at distance barely moves it; a shadow is a yes or a no,
 * and stepping over the one ridge that was blocking the sun puts a hole
 * of daylight in the middle of it.
 */
function steepestToward({
  heightMap, width, height, wrapX, curvatureRadius, heightScale,
  gridX, gridY, stepX, stepY, reach, originHeight,
}) {
  let steepest = 0

  for (let step = 1; step <= reach; step += 1) {
    // Rounded to a cell, so a sample reads a height rather than
    // interpolating four of them. The bearing is arbitrary here, unlike
    // the sky scan's integer compass steps, so this is where that
    // difference is paid for: at a shallow angle two consecutive steps
    // can land on the same cell, which costs a repeated sample and
    // changes no answer.
    const sampleY = Math.round(gridY + stepY * step)
    // A ray leaving the grid has run out of terrain, not met a cliff.
    if (sampleY < 0 || sampleY >= height) break

    let sampleX = Math.round(gridX + stepX * step)
    if (wrapX) {
      sampleX = ((sampleX % width) + width) % width
    } else if (sampleX < 0 || sampleX >= width) {
      break
    }

    // On a sphere the ground falls away from the local tangent plane
    // with distance, so a ridge this far off is already lower than a
    // flat reading of the height map claims.
    const drop = curvatureRadius > 0 ? (step * step) / (2 * curvatureRadius) : 0
    const rise = (heightMap[sampleY * width + sampleX] - originHeight) * heightScale - drop
    if (rise <= 0) continue

    const slope = rise / step
    if (slope > steepest) steepest = slope
  }

  return steepest
}

/**
 * How far a shadow can possibly reach, in cells: the tallest thing in
 * the world over the sun's slope, capped.
 *
 * The height map is normalised to [0, 1], so the tallest possible
 * occluder is `heightScale` units and no ray needs following past the
 * point where even that could not still be overhead.
 */
function shadowReach(sunSlope, heightScale) {
  if (sunSlope <= 0) return MAX_SHADOW_CELLS
  return Math.max(1, Math.min(MAX_SHADOW_CELLS, Math.ceil(heightScale / sunSlope)))
}

/**
 * The soft threshold: lit until something out-climbs the sun, half dark
 * exactly where it does. See SHADOW_SOFTNESS for why it straddles.
 */
function litFraction(steepest, sunSlope) {
  const half = SHADOW_SOFTNESS / 2
  return 1 - smoothstep(sunSlope - half, sunSlope + half, steepest)
}

/** Smooth 0→1 ramp with zero slope at both ends, as in terrain.js. */
function smoothstep(edge0, edge1, value) {
  if (edge1 <= edge0) return value >= edge1 ? 1 : 0
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/** A unit vector, or null if there was no direction to normalise. */
function normalize({ x = 0, y = 0, z = 0 } = {}) {
  const length = Math.hypot(x, y, z)
  if (!(length > 1e-9)) return null
  return { x: x / length, y: y / length, z: z / length }
}
