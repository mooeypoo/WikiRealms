/**
 * Stylised ice plates that mark the poles on the planet view.
 *
 * WHY THIS EXISTS
 *
 * The terrain grid is equirectangular: every longitude meets at the
 * poles. Even with poleClampRadians leaving a tiny cap ring (so normals
 * stay finite), those rows read as a puckered mouth — skinny meridional
 * triangles converging on a pinprick, often sand-coloured where land
 * heights stretch. The generation still paints polar ice into the height
 * map for the flat view and the legend; the globe replaces that
 * presentation with a separate low-poly disc that does not use the
 * lat/long ring at all.
 *
 * Sized from POLAR_CAPS.reachRows so the plate covers the same angular
 * footprint the ragged ice used to occupy. Flat map: nothing — the grid
 * ice stays.
 */
import * as THREE from 'three'
import { BIOME_THRESHOLDS, GRID, POLAR_CAPS } from '../../engine/generation/config.js'
import { SNOW_RGB } from './biomeColor.js'
import { GROUND_SPECULAR, createStylizedMaterial } from './stylizedMaterial.js'

export const POLAR_MEDALLION = Object.freeze({
  /**
   * How far past the authored reach the disc extends, so the ragged
   * shoreline the height map still carries cannot peek around the rim.
   */
  reachPadding: 1.12,
  /** Facets around the rim — a cut plate, not a smooth circle. */
  segments: 12,
  /**
   * Plate thickness as a fraction of disc radius. Enough to read as ice
   * from the side; from above the top face is a solid polygon — not a
   * dome, which from the pole looks like another starburst.
   */
  thicknessRatio: 0.12,
  /**
   * Hairline above sea level so the underside does not z-fight the water
   * mesh. Small enough to read as flush with the water line.
   */
  waterClearance: 0.02,
})

/**
 * How many grid rows from a pole the sphere mesh should treat as under
 * the medallion, for a terrain of this height.
 *
 * POLAR_CAPS.reachRows is authored against GRID.height; small fixture
 * grids scale down so a 8-row test planet is not all "polar".
 *
 * @param {number} gridHeight
 * @returns {number}
 */
export function polarSinkRows(gridHeight) {
  const height = Math.max(1, Math.floor(Number(gridHeight) || 0))
  if (height <= 1) return 0
  return Math.max(
    0,
    Math.round((POLAR_CAPS.reachRows * (height - 1)) / (GRID.height - 1)),
  )
}

/**
 * Angular half-angle of the ice plate, from the planet centre to the rim.
 *
 * @param {number} gridHeight
 * @returns {number} radians
 */
export function polarMedallionHalfAngle(gridHeight) {
  const height = Math.max(2, Math.floor(Number(gridHeight) || GRID.height))
  const reach = polarSinkRows(height) * POLAR_MEDALLION.reachPadding
  return (reach / (height - 1)) * Math.PI
}

/**
 * Disc radius in the plane perpendicular to the polar axis.
 *
 * @param {number} radius planetRadius(terrain)
 * @param {number} gridHeight
 */
export function polarMedallionRadius(radius, gridHeight) {
  const r = Number(radius) || 0
  return r * Math.sin(polarMedallionHalfAngle(gridHeight))
}

/**
 * Distance from the planet centre to the medallion's underside — the
 * water surface radius. The plate sits on the sea, not hovering above it.
 *
 * @param {number} radius planetRadius(terrain)
 * @param {number} heightScale
 */
export function polarMedallionRadial(radius, heightScale) {
  const r = Number(radius) || 0
  const relief = Number.isFinite(heightScale) ? Math.max(0, heightScale) : 0
  return r + BIOME_THRESHOLDS.oceanMaxHeight * relief + POLAR_MEDALLION.waterClearance
}

/**
 * Height the sphere surface should use under the medallion — sea level,
 * so the puckered land ring no longer paints sand triangles through the
 * plate, and the sea/terrain sit below the disc.
 *
 * @param {number} gridY
 * @param {number} gridHeight
 * @param {number} height01 the cell's real heightMap value
 * @returns {number}
 */
export function sphereSurfaceHeightAt(gridY, gridHeight, height01) {
  const sink = polarSinkRows(gridHeight)
  if (sink <= 0) return height01
  const rowsFromPole = Math.min(gridY, gridHeight - 1 - gridY)
  if (rowsFromPole > sink) return height01
  return BIOME_THRESHOLDS.oceanMaxHeight
}

function buildOneMedallion(sign, radius, heightScale, gridHeight) {
  const discRadius = polarMedallionRadius(radius, gridHeight)
  const radial = polarMedallionRadial(radius, heightScale)
  const thickness = Math.max(discRadius * POLAR_MEDALLION.thicknessRatio, 0.15)

  // Cylinder defaults to +Y; rotate onto the polar ±Z axis. Flat top and
  // bottom faces are solid N-gons — from the pole you see a plate, not
  // triangles meeting at a point.
  const geometry = new THREE.CylinderGeometry(
    discRadius,
    discRadius,
    thickness,
    POLAR_MEDALLION.segments,
    1,
    false,
  )
  geometry.rotateX(Math.PI / 2)
  geometry.computeVertexNormals()

  const vertexCount = geometry.attributes.position.count
  const colors = new Float32Array(vertexCount * 3)
  const snowHeights = new Float32Array(vertexCount)
  const r = SNOW_RGB[0] / 255
  const g = SNOW_RGB[1] / 255
  const b = SNOW_RGB[2] / 255
  for (let i = 0; i < vertexCount; i++) {
    colors[i * 3] = r
    colors[i * 3 + 1] = g
    colors[i * 3 + 2] = b
    // Fully eligible for the snow glitter lobe; the albedo is already ice.
    snowHeights[i] = 1
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.setAttribute('snowHeight', new THREE.BufferAttribute(snowHeights, 1))

  const material = createStylizedMaterial({
    vertexColors: true,
    flatShading: true,
    spherical: true,
    // Ice glitter — same lobe the ground snow uses.
    specular: GROUND_SPECULAR,
  })

  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = sign > 0 ? 'polarMedallionNorth' : 'polarMedallionSouth'
  // Underside on the water line: midplane is half a thickness above sea.
  mesh.position.set(0, 0, sign * (radial + thickness * 0.5))
  return mesh
}

/**
 * North and south ice plates for one planet.
 *
 * @param {object} options
 * @param {number} options.radius planetRadius(terrain)
 * @param {number} options.heightScale projection height scale
 * @param {number} options.gridHeight terrain.height
 * @returns {THREE.Group}
 */
export function buildPolarMedallions({ radius, heightScale, gridHeight }) {
  const group = new THREE.Group()
  group.name = 'polarMedallions'
  group.add(
    buildOneMedallion(1, radius, heightScale, gridHeight),
    buildOneMedallion(-1, radius, heightScale, gridHeight),
  )
  return group
}
