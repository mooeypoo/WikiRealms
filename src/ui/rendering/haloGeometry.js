/**
 * Section halo geometry, built in GRID space and projected cell by cell
 * so it lies ON the terrain.
 *
 * The obvious implementation — a flat RingGeometry and a CylinderGeometry
 * parked at the summit — breaks in two ways that compound:
 *
 *  1. On the planet a section's footprint spans real arc. A 13-subsection
 *     range reaches ~69° of longitude, and a flat disc chorded across 69°
 *     of a sphere passes tens of units UNDER the surface at its rim: most
 *     of the marker ends up inside the planet.
 *  2. Even on the flat map, a marker pinned to the summit's height is
 *     below every piece of terrain that happens to be higher along its
 *     perimeter, so the ring disappears into hillsides.
 *
 * Sampling the footprint's perimeter in grid coordinates and asking the
 * projection where each of those cells is fixes both at once, and it
 * makes the elongated footprint exact rather than an ellipse
 * approximated by a non-uniform scale. The ring becomes a ribbon draped
 * on the ground; the wall becomes a curtain standing on it.
 *
 * Pure: returns typed arrays of plain numbers, no three.js, so it tests
 * without a WebGL context — same convention as terrainMesh.js.
 */

import { BIOME_THRESHOLDS } from '../../engine/generation/config.js'

const TAU = Math.PI * 2

/**
 * Terrain height at a grid cell, wrapping in x (longitude is periodic)
 * and clamping in y (the poles are not).
 *
 * Floored at sea level: a marker whose footprint crosses water would
 * otherwise dip beneath the water surface and become both invisible and
 * unclickable, which is exactly what made subsection halos impossible to
 * hover.
 */
function sampleHeight(terrain, gridX, gridY) {
  const { width, height, heightMap } = terrain
  const x = ((Math.round(gridX) % width) + width) % width
  const y = Math.min(Math.max(Math.round(gridY), 0), height - 1)
  return Math.max(heightMap[y * width + x] ?? 0, BIOME_THRESHOLDS.oceanMaxHeight)
}

/** Shortest signed x-distance on a grid whose left and right edges meet. */
function wrapDeltaX(dx, width) {
  const wrapped = ((dx % width) + width) % width
  return wrapped > width / 2 ? wrapped - width : wrapped
}

/** Clear grid cells left between two neighbouring subsection boundaries. */
const SUBSECTION_CLEARANCE = 2

/** A marker never shrinks below this, however crowded its neighbours are. */
const MIN_MARKER_RADIUS = 2

/**
 * Marker radius for every peak: its own footprint, shrunk where needed so
 * neighbouring subsection markers stop short of each other.
 *
 * A subsection's footprint radius has nothing to do with how close its
 * siblings ended up, so a dense ridge produced boundaries that swallowed
 * one another and left nothing individually clickable.
 *
 * The cap is computed against the DRAWN boundary — radius plus the margin
 * the ring is offset by — not the bare radius. Sizing against the radius
 * alone leaves the two margins to overlap each other, which on a ridge
 * whose summits are 15 cells apart is most of the gap.
 *
 * @param {object[]} peaks
 * @param {number} width grid width, for wrapped distances
 * @param {number} margin grid cells the boundary is drawn outside the footprint
 * @returns {Float64Array} one radius per peak
 */
export function computeMarkerRadii(peaks, width, margin = 0) {
  const radii = new Float64Array(peaks.length)


  for (let i = 0; i < peaks.length; i++) {
    const peak = peaks[i]
    radii[i] = peak.radius

    if ((peak.depth ?? 0) <= 1) continue

    let nearest = Infinity
    for (let j = 0; j < peaks.length; j++) {
      if (j === i || (peaks[j].depth ?? 0) <= 1) continue
      if (peaks[j].sectionIndex !== peak.sectionIndex) continue
      const dx = wrapDeltaX(peaks[j].x - peak.x, width)
      const dy = peaks[j].y - peak.y
      nearest = Math.min(nearest, Math.hypot(dx, dy))
    }
    if (Number.isFinite(nearest)) {
      // Both neighbours shrink, so each may claim half the gap, less its
      // own margin and half the clear water between them.
      const room = nearest / 2 - margin - SUBSECTION_CLEARANCE / 2
      radii[i] = Math.max(Math.min(radii[i], room), MIN_MARKER_RADIUS)
    }
  }

  return radii
}

/**
 * Farthest point at which a ray from the origin, in direction (dx, dy),
 * leaves a disc — or 0 if it never enters one.
 */
function rayExit(dirX, dirY, centerX, centerY, radius) {
  const projection = dirX * centerX + dirY * centerY
  const discriminant = projection * projection - (centerX * centerX + centerY * centerY) + radius * radius
  if (discriminant <= 0) return 0
  return Math.max(projection + Math.sqrt(discriminant), 0)
}

/**
 * The outline of a SECTION: a smooth boundary drawn around the outside of
 * the discs its subsections actually occupy, plus a margin.
 *
 * Offsetting the ridge path directly (the previous approach) produced a
 * jagged, self-intersecting boundary — offsetting any curve by more than
 * its radius of curvature makes cusps, and a wandering spine is full of
 * tight turns. Worse, the path is where the subsections were *placed*,
 * which after clamping and jitter is not quite where they *are*, so the
 * boundary looked unattached to the range it was supposed to enclose.
 *
 * Sweeping a ray from the section's summit and taking the farthest exit
 * from any subsection disc gives a boundary that is, by construction,
 * outside every subsection; a wrapped moving average then takes the
 * corners off. The result follows the range's real shape.
 */
function sectionOutline(peak, children, margin, width, samples, smoothing) {
  const cx = []
  const cy = []
  const cr = []
  // The section's own footprint anchors the shape, so a section whose
  // subsections all sit to one side still has a body at its summit.
  cx.push(0)
  cy.push(0)
  cr.push((peak.markerRadius ?? peak.radius) + margin)
  for (const child of children) {
    cx.push(wrapDeltaX(child.x - peak.x, width))
    cy.push(child.y - peak.y)
    cr.push((child.markerRadius ?? child.radius) + margin)
  }

  const raw = new Float64Array(samples)
  for (let i = 0; i < samples; i++) {
    const angle = (i / samples) * TAU
    const dirX = Math.cos(angle)
    const dirY = Math.sin(angle)
    let far = 0
    for (let d = 0; d < cx.length; d++) {
      const exit = rayExit(dirX, dirY, cx[d], cy[d], cr[d])
      if (exit > far) far = exit
    }
    raw[i] = far
  }

  // Wrapped moving average: the ray sweep steps between discs abruptly,
  // and those steps read as dents in the finished ribbon.
  const smoothed = new Float64Array(samples)
  let deficit = 0
  for (let i = 0; i < samples; i++) {
    let total = 0
    for (let k = -smoothing; k <= smoothing; k++) total += raw[(i + k + samples) % samples]
    smoothed[i] = total / (smoothing * 2 + 1)
    // Averaging shaves the maxima hardest, which are exactly the far ends
    // of a long ridge — left alone it pulls the boundary INSIDE the
    // outermost subsections it is supposed to contain.
    if (raw[i] - smoothed[i] > deficit) deficit = raw[i] - smoothed[i]
  }

  // Lifting every sample by the worst deficit restores containment while
  // keeping the curve smooth: adding a constant changes no derivative.
  const points = []
  for (let i = 0; i <= samples; i++) {
    const index = i % samples
    const radius = smoothed[index] + deficit
    const angle = (index / samples) * TAU
    points.push({ gridX: peak.x + Math.cos(angle) * radius, gridY: peak.y + Math.sin(angle) * radius })
  }
  return points
}

/**
 * The closed grid-space outline of a peak's footprint, `margin` grid
 * cells outside it: the smoothed envelope of its subsections when it has
 * any, otherwise a plain ellipse around the peak itself.
 */
export function footprintOutline(peak, margin, context, segments = 96) {
  const children = context?.childrenOf?.(peak) ?? []
  if (children.length > 0) {
    return sectionOutline(peak, children, margin, context.width, segments, context.smoothing ?? 5)
  }

  const points = []
  for (let i = 0; i <= segments; i++) {
    points.push(ellipsePoint(peak, (peak.markerRadius ?? peak.radius) + margin, (i / segments) * TAU))
  }
  return points
}

/**
 * A point on a peak's footprint ellipse, in (fractional) grid
 * coordinates — the fallback shape for a peak with no ridge of its own
 * (a subsection, or a section with no subsections). Honours `elongation`
 * if one is set, matching the anisotropic Gaussian the terrain uses.
 */
function ellipsePoint(peak, radius, angle) {
  const elongation = peak.elongation ?? 1
  const orientation = peak.orientation ?? 0
  const cos = Math.cos(orientation)
  const sin = Math.sin(orientation)
  const along = Math.cos(angle) * radius * elongation
  const across = Math.sin(angle) * (radius / elongation)
  return {
    gridX: peak.x + along * cos - across * sin,
    gridY: peak.y + along * sin + across * cos,
  }
}

/**
 * Ground ring: a closed ribbon between the footprint's inner and outer
 * radii, every vertex sitting `clearance` above the terrain under it.
 *
 * @param {object} peak flattened peak (grid x/y, radius, orientation, elongation)
 * @param {object} terrain
 * @param {number} heightScale
 * @param {object} projection see projection.js
 * @param {{ inner: number, outer: number }} ringRadii grid units
 * @param {number} clearance world units above the surface
 * @param {number} [segments] perimeter subdivisions
 * @returns {{ positions: Float32Array, indices: Uint32Array }}
 */
export function buildHaloRingArrays(peak, terrain, heightScale, projection, ringRadii, clearance, context, segments = 96) {
  const inner = footprintOutline(peak, ringRadii.inner, context, segments)
  const outer = footprintOutline(peak, ringRadii.outer, context, segments)
  const ringCount = inner.length
  const quads = ringCount - 1
  const positions = new Float32Array(ringCount * 2 * 3)
  const indices = new Uint32Array(quads * 6)

  for (let i = 0; i < ringCount; i++) {
    for (const [slot, outline] of [
      [0, inner],
      [1, outer],
    ]) {
      const { gridX, gridY } = outline[i]
      // Height is sampled at the nearest cell, but the POSITION uses the
      // fractional coordinate — otherwise the ribbon would visibly
      // staircase around its perimeter.
      const h01 = sampleHeight(terrain, gridX, gridY)
      const point = projection.toLocal(gridX, gridY, h01, terrain, heightScale, clearance)
      const at = (i * 2 + slot) * 3
      positions[at] = point.x
      positions[at + 1] = point.y
      positions[at + 2] = point.z
    }
  }

  let cursor = 0
  for (let i = 0; i < quads; i++) {
    const innerVertex = i * 2
    const outerVertex = i * 2 + 1
    const nextInner = (i + 1) * 2
    const nextOuter = (i + 1) * 2 + 1
    indices[cursor++] = innerVertex
    indices[cursor++] = outerVertex
    indices[cursor++] = nextInner
    indices[cursor++] = outerVertex
    indices[cursor++] = nextOuter
    indices[cursor++] = nextInner
  }

  return { positions, indices }
}

/**
 * Invisible hit area filling a peak's whole footprint: a triangle fan
 * from its summit out to the boundary, draped like the ring.
 *
 * Without it a marker is only its outline, so a section is selectable
 * exactly on its boundary line and nowhere else — hovering the middle of
 * a subsection falls through to the terrain, which reports the owning
 * SECTION. Filling the footprint makes "point at the thing" work: the
 * raycaster checks subsection fills first, so a subsection wins inside
 * its own disc and its section wins in the gaps between them.
 *
 * The fan is valid because both outline shapes are star-shaped about the
 * peak: the section boundary is swept radially from the summit, and the
 * fallback ellipse is centred on it.
 *
 * @returns {{ positions: Float32Array, indices: Uint32Array }}
 */
export function buildHaloFillArrays(peak, terrain, heightScale, projection, margin, clearance, context, segments = 96) {
  const outline = footprintOutline(peak, margin, context, segments)
  const rim = outline.length
  const positions = new Float32Array((rim + 1) * 3)

  const center = projection.toLocal(
    peak.x,
    peak.y,
    sampleHeight(terrain, peak.x, peak.y),
    terrain,
    heightScale,
    clearance,
  )
  positions[0] = center.x
  positions[1] = center.y
  positions[2] = center.z

  for (let i = 0; i < rim; i++) {
    const { gridX, gridY } = outline[i]
    const h01 = sampleHeight(terrain, gridX, gridY)
    const point = projection.toLocal(gridX, gridY, h01, terrain, heightScale, clearance)
    const at = (i + 1) * 3
    positions[at] = point.x
    positions[at + 1] = point.y
    positions[at + 2] = point.z
  }

  const indices = new Uint32Array(Math.max(rim - 1, 0) * 3)
  let cursor = 0
  for (let i = 0; i < rim - 1; i++) {
    indices[cursor++] = 0
    indices[cursor++] = i + 1
    indices[cursor++] = i + 2
  }

  return { positions, indices }
}

/**
 * Energy wall: a curtain standing on the footprint's perimeter, each
 * post rising along its own local up direction — radially outward on the
 * planet, straight up on the flat map.
 *
 * Also returns the base ring and its up vectors so the per-frame height
 * animation can move the top edge without rebuilding the geometry (see
 * updateHaloWallHeights).
 *
 * @returns {{
 *   positions: Float32Array,
 *   indices: Uint32Array,
 *   basePositions: Float32Array,
 *   upVectors: Float32Array,
 *   segments: number,
 * }}
 */
export function buildHaloWallArrays(
  peak,
  terrain,
  heightScale,
  projection,
  wallRadius,
  wallHeight,
  clearance,
  initialScale,
  context,
  segments = 96,
) {
  const outline = footprintOutline(peak, wallRadius, context, segments)
  const ringCount = outline.length
  const quads = ringCount - 1
  const positions = new Float32Array(ringCount * 2 * 3)
  const basePositions = new Float32Array(ringCount * 3)
  const upVectors = new Float32Array(ringCount * 3)
  const indices = new Uint32Array(quads * 6)

  for (let i = 0; i < ringCount; i++) {
    const { gridX, gridY } = outline[i]
    const h01 = sampleHeight(terrain, gridX, gridY)
    const base = projection.toLocal(gridX, gridY, h01, terrain, heightScale, clearance)
    const up = projection.normalAt(gridX, gridY, terrain)

    basePositions[i * 3] = base.x
    basePositions[i * 3 + 1] = base.y
    basePositions[i * 3 + 2] = base.z
    upVectors[i * 3] = up.x
    upVectors[i * 3 + 1] = up.y
    upVectors[i * 3 + 2] = up.z

    const bottom = i * 2 * 3
    positions[bottom] = base.x
    positions[bottom + 1] = base.y
    positions[bottom + 2] = base.z
  }

  let cursor = 0
  for (let i = 0; i < quads; i++) {
    const bottom = i * 2
    const top = i * 2 + 1
    const nextBottom = (i + 1) * 2
    const nextTop = (i + 1) * 2 + 1
    indices[cursor++] = bottom
    indices[cursor++] = top
    indices[cursor++] = nextBottom
    indices[cursor++] = top
    indices[cursor++] = nextTop
    indices[cursor++] = nextBottom
  }

  const geometry = { positions, indices, basePositions, upVectors, segments: quads }
  updateHaloWallHeights(geometry, wallHeight, initialScale)
  return geometry
}

/**
 * Rewrites a curtain's top edge for a new height scale, leaving its base
 * pinned to the terrain. Cheap enough to call per frame on the handful of
 * walls actually mid-animation — a wall is only ~50 vertices.
 *
 * @param {{ positions: Float32Array, basePositions: Float32Array, upVectors: Float32Array, segments: number }} geometry
 * @param {number} wallHeight full height in world units
 * @param {number} scale 0..1 of that height
 */
export function updateHaloWallHeights(geometry, wallHeight, scale) {
  const { positions, basePositions, upVectors, segments } = geometry
  const rise = wallHeight * scale

  for (let i = 0; i <= segments; i++) {
    const base = i * 3
    const top = (i * 2 + 1) * 3
    positions[top] = basePositions[base] + upVectors[base] * rise
    positions[top + 1] = basePositions[base + 1] + upVectors[base + 1] * rise
    positions[top + 2] = basePositions[base + 2] + upVectors[base + 2] * rise
  }
}
