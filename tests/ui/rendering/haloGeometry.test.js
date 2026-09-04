import { describe, expect, it } from 'vitest'
import {
  buildHaloFillArrays,
  buildHaloRingArrays,
  buildHaloWallArrays,
  computeMarkerRadii,
  footprintOutline,
  updateHaloWallHeights,
} from '../../../src/ui/rendering/haloGeometry.js'
import { flatProjection, planetRadius, sphereProjection } from '../../../src/ui/rendering/projection.js'

/** A grid with a broad hill, so "draped" is distinguishable from "flat". */
function makeTerrain(width = 64, height = 32) {
  const heightMap = new Float64Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = (x - width / 2) / 10
      const dy = (y - height / 2) / 6
      heightMap[y * width + x] = 0.3 + 0.5 * Math.exp(-(dx * dx + dy * dy))
    }
  }
  return { width, height, heightMap }
}

const peak = { x: 32, y: 16, radius: 8, orientation: 0.7, elongation: 2.2, markerRadius: 8 }
const ringMargins = { inner: 3.4, outer: 5 }

function vertices(positions) {
  const out = []
  for (let i = 0; i < positions.length; i += 3) out.push({ x: positions[i], y: positions[i + 1], z: positions[i + 2] })
  return out
}

/** Terrain surface radius/height directly beneath a marker vertex. */
function surfaceUnder(point, terrain, heightScale, projection) {
  const cell = projection.fromLocal(point.x, point.y, point.z, terrain)
  if (!cell) return null
  const h01 = terrain.heightMap[cell.gridY * terrain.width + cell.gridX]
  const ground = projection.toLocal(cell.gridX, cell.gridY, h01, terrain, heightScale, 0)
  return { ground, point }
}

describe('buildHaloRingArrays', () => {
  it('emits a closed band with two vertices per segment', () => {
    const terrain = makeTerrain()
    const { positions, indices } = buildHaloRingArrays(
      peak, terrain, flatProjection.heightScale(terrain), flatProjection, ringMargins, 0.4, null, 12,
    )

    expect(positions).toHaveLength((12 + 1) * 2 * 3)
    expect(indices).toHaveLength(12 * 6)
    for (const index of indices) expect(index).toBeLessThan(positions.length / 3)
  })

  it('closes the loop — the last rim vertex meets the first', () => {
    const terrain = makeTerrain()
    const { positions } = buildHaloRingArrays(
      peak, terrain, flatProjection.heightScale(terrain), flatProjection, ringMargins, 0.4, null, 24,
    )
    const verts = vertices(positions)

    expect(verts[verts.length - 2].x).toBeCloseTo(verts[0].x, 4)
    expect(verts[verts.length - 1].y).toBeCloseTo(verts[1].y, 4)
  })

  // The whole point of draping: a ring pinned to one height sinks into
  // any terrain along its perimeter that happens to be higher.
  it('never dips below the terrain under it, on either projection', () => {
    const terrain = makeTerrain()
    for (const projection of [flatProjection, sphereProjection]) {
      const heightScale = projection.heightScale(terrain)
      const { positions } = buildHaloRingArrays(peak, terrain, heightScale, projection, ringMargins, 0.4, null, 64)

      for (const point of vertices(positions)) {
        const under = surfaceUnder(point, terrain, heightScale, projection)
        if (!under) continue
        if (projection.isSpherical) {
          // Distance from the planet centre must exceed the ground's.
          expect(Math.hypot(point.x, point.y, point.z)).toBeGreaterThan(Math.hypot(under.ground.x, under.ground.y, under.ground.z) - 1e-6)
        } else {
          expect(point.z).toBeGreaterThan(under.ground.z - 1e-6)
        }
      }
    }
  })

  it('follows the terrain rather than sitting in one plane', () => {
    const terrain = makeTerrain()
    const { positions } = buildHaloRingArrays(
      peak, terrain, flatProjection.heightScale(terrain), flatProjection, ringMargins, 0.4, null, 64,
    )
    const zs = vertices(positions).map((v) => v.z)

    expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThan(0.5)
  })

  it('stretches along the peak axis by its elongation', () => {
    const terrain = makeTerrain()
    const round = { ...peak, orientation: 0, elongation: 1 }
    const long = { ...peak, orientation: 0, elongation: 3 }
    const spanX = (p) => {
      const xs = vertices(
        buildHaloRingArrays(p, terrain, flatProjection.heightScale(terrain), flatProjection, ringMargins, 0.4, null, 48).positions,
      ).map((v) => v.x)
      return Math.max(...xs) - Math.min(...xs)
    }

    expect(spanX(long)).toBeGreaterThan(spanX(round) * 2.5)
  })

  it('keeps a planet-scale ring on the surface where a flat disc could not', () => {
    // A footprint spanning tens of degrees: the case where a chorded flat
    // ring passes far under the sphere.
    const terrain = makeTerrain()
    const heightScale = sphereProjection.heightScale(terrain)
    const wide = { x: 32, y: 16, radius: 14, orientation: 0.4, elongation: 2.5, markerRadius: 14 }
    const { positions } = buildHaloRingArrays(
      wide, terrain, heightScale, sphereProjection, ringMargins, 0.4, null, 64,
    )

    const radii = vertices(positions).map((v) => Math.hypot(v.x, v.y, v.z))
    // Every vertex sits outside the planet's base radius, i.e. above sea
    // level rather than buried inside the globe.
    expect(Math.min(...radii)).toBeGreaterThan(planetRadius(terrain))
  })
})

describe('footprint shape', () => {
  // A section whose subsections string out along a line: the boundary
  // must enclose all of them, not circle the section's own summit.
  const section = { x: 32, y: 16, radius: 5, markerRadius: 5, depth: 1, orientation: 0, elongation: 1 }
  const children = [-14, -7, 0, 7, 14].map((dx) => ({
    x: 32 + dx, y: 16, radius: 3, markerRadius: 3, depth: 2, orientation: 0, elongation: 1,
  }))
  const context = { width: 64, smoothing: 4, childrenOf: () => children }

  it('encloses every subsection it contains, with margin', () => {
    const outline = footprintOutline(section, 5, context, 96)

    for (const child of children) {
      // The boundary must be outside this child's disc in every direction.
      let nearest = Infinity
      for (const point of outline) {
        nearest = Math.min(nearest, Math.hypot(point.gridX - child.x, point.gridY - child.y))
      }
      expect(nearest).toBeGreaterThan(child.markerRadius)
    }
  })

  it('takes the shape of the run of subsections, not of the summit', () => {
    const outline = footprintOutline(section, 5, context, 96)
    const xs = outline.map((p) => p.gridX)
    const ys = outline.map((p) => p.gridY)

    // Spans the whole line of children horizontally, stays tight vertically.
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(30)
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(Math.max(...xs) - Math.min(...xs))
  })

  it('is smooth — no spikes between neighbouring boundary samples', () => {
    const outline = footprintOutline(section, 5, context, 96)
    const steps = outline.slice(1).map((p, i) =>
      Math.hypot(p.gridX - outline[i].gridX, p.gridY - outline[i].gridY),
    )
    const mean = steps.reduce((a, b) => a + b, 0) / steps.length

    // A jagged or self-intersecting offset shows up as one step far
    // larger than its neighbours.
    expect(Math.max(...steps)).toBeLessThan(mean * 3)
  })

  it('falls back to a closed ellipse for a peak with no ridge', () => {
    const terrain = makeTerrain()
    const { positions } = buildHaloRingArrays(
      peak, terrain, flatProjection.heightScale(terrain), flatProjection, ringMargins, 0.4, null, 32,
    )
    const verts = vertices(positions)

    expect(verts[verts.length - 2].x).toBeCloseTo(verts[0].x, 4)
  })

  it('keeps the ring above sea level even where its footprint crosses water', () => {
    // Terrain that is entirely ocean: nothing to stand on.
    const width = 64
    const height = 32
    const drowned = { width, height, heightMap: new Float64Array(width * height).fill(0.05) }
    const heightScale = flatProjection.heightScale(drowned)
    const waterZ = flatProjection.waterSurface(drowned, heightScale)
    const { positions } = buildHaloRingArrays(peak, drowned, heightScale, flatProjection, ringMargins, 0.4, null, 32)

    // Every vertex floats at or above the water plane rather than sinking
    // under it, where it would be invisible and unhoverable.
    for (const point of vertices(positions)) expect(point.z).toBeGreaterThanOrEqual(waterZ)
  })
})

describe('buildHaloWallArrays', () => {
  const build = (projection, scale = 1) => {
    const terrain = makeTerrain()
    const heightScale = projection.heightScale(terrain)
    return {
      terrain,
      heightScale,
      geometry: buildHaloWallArrays(peak, terrain, heightScale, projection, 5, 5, 0.4, scale, null, 16),
    }
  }

  it('emits a base and top vertex per segment, plus its animation data', () => {
    const { geometry } = build(flatProjection)

    expect(geometry.positions).toHaveLength((16 + 1) * 2 * 3)
    expect(geometry.basePositions).toHaveLength((16 + 1) * 3)
    expect(geometry.upVectors).toHaveLength((16 + 1) * 3)
    expect(geometry.indices).toHaveLength(16 * 6)
  })

  it('stands each post along its own local up direction', () => {
    for (const projection of [flatProjection, sphereProjection]) {
      const { geometry } = build(projection)
      const { positions, basePositions, upVectors } = geometry

      for (let i = 0; i <= 16; i++) {
        const base = i * 3
        const top = (i * 2 + 1) * 3
        // top - base must be 5 units along that post's up vector.
        expect(positions[top] - basePositions[base]).toBeCloseTo(upVectors[base] * 5, 4)
        expect(positions[top + 1] - basePositions[base + 1]).toBeCloseTo(upVectors[base + 1] * 5, 4)
        expect(positions[top + 2] - basePositions[base + 2]).toBeCloseTo(upVectors[base + 2] * 5, 4)
      }
    }
  })

  it('starts the curtain at the requested fraction of full height', () => {
    const { geometry } = build(flatProjection, 0.25)

    expect(geometry.positions[1 * 3 + 2] - geometry.basePositions[2]).toBeCloseTo(5 * 0.25, 4)
  })
})

describe('updateHaloWallHeights', () => {
  it('moves the top edge and leaves the base pinned to the terrain', () => {
    const terrain = makeTerrain()
    const heightScale = flatProjection.heightScale(terrain)
    const geometry = buildHaloWallArrays(peak, terrain, heightScale, flatProjection, 5, 5, 0.4, 1, null, 16)
    const baseBefore = Float32Array.from(geometry.positions.filter((_, i) => Math.floor(i / 3) % 2 === 0))

    updateHaloWallHeights(geometry, 5, 0.2)

    const baseAfter = geometry.positions.filter((_, i) => Math.floor(i / 3) % 2 === 0)
    expect(Array.from(baseAfter)).toEqual(Array.from(baseBefore))
    expect(geometry.positions[1 * 3 + 2] - geometry.basePositions[2]).toBeCloseTo(1, 4)
  })

  it('is reversible — the same scale always yields the same top edge', () => {
    const terrain = makeTerrain()
    const heightScale = flatProjection.heightScale(terrain)
    const geometry = buildHaloWallArrays(peak, terrain, heightScale, flatProjection, 5, 5, 0.4, 1, null, 16)
    const full = Float32Array.from(geometry.positions)

    updateHaloWallHeights(geometry, 5, 0.3)
    updateHaloWallHeights(geometry, 5, 1)

    expect(Array.from(geometry.positions)).toEqual(Array.from(full))
  })
})

describe('computeMarkerRadii', () => {
  const width = 512
  /** Three subsections of one section, 15 cells apart — a dense ridge. */
  const peaks = [
    { depth: 1, x: 100, y: 128, radius: 30, sectionIndex: 0 },
    { depth: 2, x: 85, y: 128, radius: 10, sectionIndex: 0 },
    { depth: 2, x: 100, y: 128, radius: 10, sectionIndex: 0 },
    { depth: 2, x: 115, y: 128, radius: 10, sectionIndex: 0 },
  ]

  it('leaves top-level sections at their own radius', () => {
    expect(computeMarkerRadii(peaks, width, 2.2)[0]).toBeCloseTo(30)
  })

  // The cap has to account for the margin the boundary is DRAWN at, or
  // the two margins eat the gap between neighbouring summits.
  it('keeps neighbouring DRAWN boundaries clear of each other', () => {
    const margin = 2.2
    const radii = computeMarkerRadii(peaks, width, margin)

    for (let i = 1; i < peaks.length; i++) {
      for (let j = i + 1; j < peaks.length; j++) {
        const distance = Math.abs(peaks[i].x - peaks[j].x)
        expect(radii[i] + margin + radii[j] + margin).toBeLessThanOrEqual(distance + 1e-6)
      }
    }
  })

  it('shrinks harder as the ridge gets denser', () => {
    const tight = [peaks[0], { ...peaks[1], x: 96 }, { ...peaks[2] }, { ...peaks[3], x: 104 }]

    expect(computeMarkerRadii(tight, width, 2.2)[1]).toBeLessThan(computeMarkerRadii(peaks, width, 2.2)[1])
  })

  it('never shrinks a marker away entirely', () => {
    const crushed = [
      { depth: 1, x: 100, y: 128, radius: 30, sectionIndex: 0 },
      { depth: 2, x: 100, y: 128, radius: 10, sectionIndex: 0 },
      { depth: 2, x: 100.5, y: 128, radius: 10, sectionIndex: 0 },
    ]

    for (const radius of computeMarkerRadii(crushed, width, 2.2).slice(1)) {
      expect(radius).toBeGreaterThan(0)
    }
  })

  it('ignores subsections belonging to a different section', () => {
    const separate = [
      { depth: 1, x: 100, y: 128, radius: 30, sectionIndex: 0 },
      { depth: 2, x: 100, y: 128, radius: 10, sectionIndex: 0 },
      { depth: 1, x: 108, y: 128, radius: 30, sectionIndex: 2 },
      { depth: 2, x: 108, y: 128, radius: 10, sectionIndex: 2 },
    ]

    // Nothing to crowd it within its own section, so it keeps its radius.
    expect(computeMarkerRadii(separate, width, 2.2)[1]).toBeCloseTo(10)
  })
})

describe('buildHaloFillArrays', () => {
  // Without a fill a marker is only its outline, so pointing at the middle
  // of a subsection falls through to the terrain and selects its section.
  it('fans the whole footprint from the summit to the boundary', () => {
    const terrain = makeTerrain()
    const { positions, indices } = buildHaloFillArrays(
      peak, terrain, flatProjection.heightScale(terrain), flatProjection, 5, 0.4, null, 32,
    )

    // One centre vertex plus the closed rim.
    expect(positions).toHaveLength((32 + 1 + 1) * 3)
    expect(indices).toHaveLength(32 * 3)
    // Every triangle starts at the centre vertex.
    for (let i = 0; i < indices.length; i += 3) expect(indices[i]).toBe(0)
    for (const index of indices) expect(index).toBeLessThan(positions.length / 3)
  })

  it('covers the same ground as the ring that outlines it', () => {
    const terrain = makeTerrain()
    const heightScale = flatProjection.heightScale(terrain)
    const fill = buildHaloFillArrays(peak, terrain, heightScale, flatProjection, ringMargins.outer, 0.4, null, 48)
    const ring = buildHaloRingArrays(peak, terrain, heightScale, flatProjection, ringMargins, 0.4, null, 48)

    const spanX = (positions) => {
      const xs = vertices(positions).map((v) => v.x)
      return Math.max(...xs) - Math.min(...xs)
    }
    expect(spanX(fill.positions)).toBeCloseTo(spanX(ring.positions), 3)
  })

  it('sits above the terrain, like the ring', () => {
    const terrain = makeTerrain()
    const heightScale = flatProjection.heightScale(terrain)
    const { positions } = buildHaloFillArrays(peak, terrain, heightScale, flatProjection, 5, 0.4, null, 48)

    for (const point of vertices(positions)) {
      const under = surfaceUnder(point, terrain, heightScale, flatProjection)
      if (under) expect(point.z).toBeGreaterThan(under.ground.z - 1e-6)
    }
  })
})
