/**
 * View projections: how one generated terrain grid becomes 3D geometry.
 *
 * The generation engine (sectionTerrain.js) is topology-agnostic — it
 * emits a plain width × height grid of heights and biomes and says
 * nothing about how that grid sits in space. Everything that assumes
 * "flat plane" lives here, behind a single interface, so the same
 * `worldId` can be rendered either as a flat 3D map or as a planet
 * WITHOUT regenerating anything. Switching views is a re-render, not a
 * re-roll.
 *
 * The grid is read as an equirectangular map: `width` columns span 360°
 * of longitude, `height` rows span 180° of latitude (hence GRID's 2:1
 * aspect — see config.js).
 *
 * The planet radius is DERIVED, not tuned: width / 2π makes the equator
 * exactly `width` world units around, so one grid cell equals one world
 * unit of arc in BOTH projections. That is what lets every marker size
 * tuned in grid units (SECTION_MARKERS ring/wall radii, portal hover
 * offsets, foliage spacing) carry over to the planet untouched.
 *
 * Deliberately free of three.js: everything here returns plain numbers
 * and typed arrays, so it unit-tests without a WebGL context — same
 * convention as terrainMesh.js and sectionHalos.js.
 */
import { BIOME_THRESHOLDS } from '../../engine/generation/config.js'

const TAU = Math.PI * 2

/** Vertical exaggeration factor: heightMap[0..1] * this = flat-mode mesh Z units. */
export const HEIGHT_SCALE_RATIO = 0.26

/** Flat-view render parameters that have a spherical counterpart below. */
export const FLAT_VIEW = Object.freeze({
  ambientLightIntensity: 0.6,
  // Camera pull-back as a fraction of the larger grid axis.
  cameraDistanceRatio: 0.9,
  // Keeps the flat camera above the horizon — a plane viewed edge-on or
  // from beneath is just a line and a backface.
  maxPolarAngle: Math.PI / 2.1,
})

/** Planet-view render parameters. Ratios, so they hold at any grid size. */
export const SPHERE_VIEW = Object.freeze({
  // Vertical exaggeration as a fraction of the planet radius. Real
  // planets have imperceptible relief (Everest is 0.14% of Earth's
  // radius); this is the "readable globe" exaggeration, tuned so ranges
  // show up in silhouette from orbit without turning into spikes.
  reliefRatio: 0.15,
  // Latitude is clamped this far short of the true poles so the top and
  // bottom vertex rows form a tiny cap ring instead of collapsing to a
  // single point. Coincident vertices make zero-area triangles, and
  // computeVertexNormals() turns those into NaN normals, which poison
  // the lighting of every triangle that shares them.
  poleClampRadians: 0.01,
  // Camera framing, in multiples of the planet radius.
  cameraDistanceRatio: 3.2,
  minDistanceRatio: 1.15,
  maxDistanceRatio: 9,
  // A directional sun on a globe gives a real day/night terminator,
  // which looks great — but at the flat view's 0.6 ambient the night
  // side goes to pure black and half the planet is unreadable.
  ambientLightIntensity: 0.85,
})

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

/**
 * Shared grid → indexed-triangle-mesh builder. Both projections lay out
 * exactly width × height vertices in row-major order, so a vertex index
 * is always `gridY * width + gridX` — the same index space as heightMap,
 * biomeMap and computeVertexColors' output. Only the vertex POSITIONS
 * and whether the last column stitches back to the first differ.
 *
 * Winding matches three.js PlaneGeometry's (a, b, d) / (b, c, d) order so
 * the flat mesh is face-for-face identical to the PlaneGeometry it
 * replaces; on the sphere the same order comes out front-face-outward.
 *
 * @param {{ width: number, height: number, heightMap: Float64Array }} terrain
 * @param {(gridX: number, gridY: number, h01: number) => {x: number, y: number, z: number}} project
 * @param {boolean} wrapX whether column width-1 joins back to column 0
 * @returns {{ positions: Float32Array, indices: Uint32Array }}
 */
function buildGridArrays(terrain, project, wrapX) {
  const { width, height, heightMap } = terrain
  const positions = new Float32Array(width * height * 3)

  for (let gridY = 0; gridY < height; gridY++) {
    for (let gridX = 0; gridX < width; gridX++) {
      const index = gridY * width + gridX
      const point = project(gridX, gridY, heightMap[index] ?? 0)
      positions[index * 3] = point.x
      positions[index * 3 + 1] = point.y
      positions[index * 3 + 2] = point.z
    }
  }

  const columns = Math.max(wrapX ? width : width - 1, 0)
  const rows = Math.max(height - 1, 0)
  // Uint32 is required, not defensive: a 512×256 grid is 131072 vertices,
  // twice what a Uint16 index buffer can address.
  const indices = new Uint32Array(columns * rows * 6)

  let cursor = 0
  for (let gridY = 0; gridY < rows; gridY++) {
    for (let column = 0; column < columns; column++) {
      const nextColumn = wrapX ? (column + 1) % width : column + 1
      const a = gridY * width + column
      const b = (gridY + 1) * width + column
      const c = (gridY + 1) * width + nextColumn
      const d = gridY * width + nextColumn
      indices[cursor++] = a
      indices[cursor++] = b
      indices[cursor++] = d
      indices[cursor++] = b
      indices[cursor++] = c
      indices[cursor++] = d
    }
  }

  return { positions, indices }
}

/**
 * The flat map: the original presentation. Grid X/Y become mesh X/Y at
 * one unit per cell, height displaces along +Z, and the whole thing is
 * carried into world-Y-up by the shared worldGroup rotation.
 *
 * Note this lays vertices out at exact integer spacing, so the mesh spans
 * (width - 1) units rather than PlaneGeometry's `width`. That's a 0.4%
 * difference at 256 cells, and it removes a small pre-existing drift
 * between the terrain surface and the markers placed on it (markers were
 * always positioned on integer spacing).
 */
export const flatProjection = Object.freeze({
  id: 'flat',
  isSpherical: false,
  ambientLightIntensity: FLAT_VIEW.ambientLightIntensity,

  heightScale(terrain) {
    return Math.min(terrain.width, terrain.height) * HEIGHT_SCALE_RATIO
  },

  toLocal(gridX, gridY, h01, terrain, heightScale, offset = 0) {
    // Y is flipped: three.js lays out plane vertices with row 0 at
    // Y = +h/2, so a row-major (top-down) gridY must mirror to land on
    // its own vertex.
    return {
      x: gridX - terrain.width / 2,
      y: terrain.height / 2 - gridY,
      z: h01 * heightScale + offset,
    }
  },

  normalAt() {
    return { x: 0, y: 0, z: 1 }
  },


  fromLocal(x, y, _z, terrain) {
    const gridX = Math.round(x + terrain.width / 2)
    const gridY = Math.round(terrain.height / 2 - y)
    if (gridX < 0 || gridX >= terrain.width || gridY < 0 || gridY >= terrain.height) return null
    return { gridX, gridY }
  },


  waterSurface(terrain, heightScale) {
    return BIOME_THRESHOLDS.oceanMaxHeight * heightScale
  },

  buildSurfaceArrays(terrain, heightScale) {
    return buildGridArrays(terrain, (gx, gy, h01) => this.toLocal(gx, gy, h01, terrain, heightScale), false)
  },
})

/** Planet radius for a grid, in world units. See the module header. */
export function planetRadius(terrain) {
  return terrain.width / TAU
}

/**
 * Latitude (radians, +π/2 at the north pole) for a grid row, clamped
 * short of the poles — see SPHERE_VIEW.poleClampRadians.
 */
export function latitudeForRow(gridY, height) {
  const t = height > 1 ? gridY / (height - 1) : 0.5
  const maxLatitude = Math.PI / 2 - SPHERE_VIEW.poleClampRadians
  return clamp(Math.PI / 2 - t * Math.PI, -maxLatitude, maxLatitude)
}

/** Inverse of latitudeForRow, before rounding to an integer row. */
export function rowForLatitude(latitude, height) {
  if (height <= 1) return 0
  return ((Math.PI / 2 - latitude) / Math.PI) * (height - 1)
}

/**
 * The planet: the same grid wrapped onto a sphere. Longitude runs with
 * gridX, latitude with gridY, and height displaces radially outward from
 * the planet centre.
 *
 * The polar axis is local +Z, i.e. the same axis flat mode calls "up", so
 * the shared worldGroup rotation and every marker that orients to a
 * surface normal work identically in both projections.
 */
export const sphereProjection = Object.freeze({
  id: 'sphere',
  isSpherical: true,
  ambientLightIntensity: SPHERE_VIEW.ambientLightIntensity,

  heightScale(terrain) {
    return planetRadius(terrain) * SPHERE_VIEW.reliefRatio
  },

  toLocal(gridX, gridY, h01, terrain, heightScale, offset = 0) {
    const normal = this.normalAt(gridX, gridY, terrain)
    const radius = planetRadius(terrain) + h01 * heightScale + offset
    return { x: normal.x * radius, y: normal.y * radius, z: normal.z * radius }
  },

  normalAt(gridX, gridY, terrain) {
    const longitude = (gridX / terrain.width) * TAU
    const latitude = latitudeForRow(gridY, terrain.height)
    const cosLatitude = Math.cos(latitude)
    return {
      x: cosLatitude * Math.cos(longitude),
      y: cosLatitude * Math.sin(longitude),
      z: Math.sin(latitude),
    }
  },


  fromLocal(x, y, z, terrain) {
    const radius = Math.hypot(x, y, z)
    // The planet centre has no latitude/longitude; only reachable if a
    // ray somehow originates inside the globe.
    if (radius === 0) return null

    const latitude = Math.asin(clamp(z / radius, -1, 1))
    let longitude = Math.atan2(y, x)
    if (longitude < 0) longitude += TAU

    // Longitude wraps, so the column past the last one IS column 0 —
    // modulo rather than a bounds rejection. Unlike the flat map, there
    // is no "outside the terrain footprint": every direction hits land
    // or ocean.
    const gridX = Math.round((longitude / TAU) * terrain.width) % terrain.width
    const gridY = clamp(Math.round(rowForLatitude(latitude, terrain.height)), 0, terrain.height - 1)
    return { gridX, gridY }
  },


  /** Sea level as a RADIUS from the planet centre, not a Z height. */
  waterSurface(terrain, heightScale) {
    return planetRadius(terrain) + BIOME_THRESHOLDS.oceanMaxHeight * heightScale
  },

  buildSurfaceArrays(terrain, heightScale) {
    return buildGridArrays(terrain, (gx, gy, h01) => this.toLocal(gx, gy, h01, terrain, heightScale), true)
  },
})

/**
 * Resolves a view-mode preference string to a projection, defaulting to
 * the flat map for anything unrecognized (including a stale persisted
 * preference from an older build).
 * @param {string} [mode] 'flat' | 'sphere'
 */
export function getProjection(mode) {
  return mode === 'sphere' ? sphereProjection : flatProjection
}
