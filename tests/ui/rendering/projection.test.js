import { describe, expect, it } from 'vitest'
import {
  HEIGHT_SCALE_RATIO,
  SPHERE_VIEW,
  flatProjection,
  getProjection,
  latitudeForRow,
  planetRadius,
  rowForLatitude,
  sphereProjection,
} from '../../../src/ui/rendering/projection.js'
import { BIOME_THRESHOLDS, GRID } from '../../../src/engine/generation/config.js'

/** A small equirectangular grid: 2:1, like the real GRID. */
function makeTerrain(overrides = {}) {
  const width = 16
  const height = 8
  return {
    width,
    height,
    heightMap: new Float64Array(width * height).fill(0.5),
    ...overrides,
  }
}

function length({ x, y, z }) {
  return Math.hypot(x, y, z)
}

describe('getProjection', () => {
  it('resolves the two known view modes', () => {
    expect(getProjection('flat')).toBe(flatProjection)
    expect(getProjection('sphere')).toBe(sphereProjection)
  })

  it('falls back to the flat map for an unknown or missing mode', () => {
    expect(getProjection(undefined)).toBe(flatProjection)
    expect(getProjection('torus')).toBe(flatProjection)
  })
})

describe('flatProjection', () => {
  it('scales height by the smaller grid dimension', () => {
    expect(flatProjection.heightScale(makeTerrain())).toBeCloseTo(8 * HEIGHT_SCALE_RATIO)
  })

  it('centers the grid on the origin and flips Y', () => {
    const terrain = makeTerrain()
    expect(flatProjection.toLocal(0, 0, 0, terrain, 10)).toEqual({ x: -8, y: 4, z: 0 })
  })

  it('displaces height along +Z and adds the offset', () => {
    const terrain = makeTerrain()
    expect(flatProjection.toLocal(0, 0, 0.5, terrain, 10, 2).z).toBeCloseTo(7)
  })

  it('has a constant up normal', () => {
    expect(flatProjection.normalAt(3, 2, makeTerrain())).toEqual({ x: 0, y: 0, z: 1 })
  })

  it('round-trips every cell through toLocal and fromLocal', () => {
    const terrain = makeTerrain()
    for (let gridY = 0; gridY < terrain.height; gridY++) {
      for (let gridX = 0; gridX < terrain.width; gridX++) {
        const local = flatProjection.toLocal(gridX, gridY, 0.5, terrain, 10)
        expect(flatProjection.fromLocal(local.x, local.y, local.z, terrain)).toEqual({ gridX, gridY })
      }
    }
  })

  it('rejects points outside the terrain footprint', () => {
    expect(flatProjection.fromLocal(-99, 0, 0, makeTerrain())).toBeNull()
  })
})

describe('sphereProjection', () => {
  it('derives a radius that makes the equator exactly `width` units around', () => {
    const terrain = makeTerrain()
    expect(2 * Math.PI * planetRadius(terrain)).toBeCloseTo(terrain.width)
  })

  it('places every vertex at planetRadius + scaled height', () => {
    const terrain = makeTerrain()
    const heightScale = sphereProjection.heightScale(terrain)
    const expected = planetRadius(terrain) + 0.5 * heightScale

    for (let gridY = 0; gridY < terrain.height; gridY++) {
      for (let gridX = 0; gridX < terrain.width; gridX++) {
        const local = sphereProjection.toLocal(gridX, gridY, 0.5, terrain, heightScale)
        expect(length(local)).toBeCloseTo(expected)
      }
    }
  })

  it('emits unit-length surface normals', () => {
    const terrain = makeTerrain()
    for (let gridY = 0; gridY < terrain.height; gridY++) {
      expect(length(sphereProjection.normalAt(5, gridY, terrain))).toBeCloseTo(1)
    }
  })

  it('points the normal along the position vector', () => {
    const terrain = makeTerrain()
    const heightScale = sphereProjection.heightScale(terrain)
    const local = sphereProjection.toLocal(6, 3, 0.7, terrain, heightScale)
    const normal = sphereProjection.normalAt(6, 3, terrain)
    const radius = length(local)

    expect(normal.x).toBeCloseTo(local.x / radius)
    expect(normal.y).toBeCloseTo(local.y / radius)
    expect(normal.z).toBeCloseTo(local.z / radius)
  })

  it('round-trips every cell through toLocal and fromLocal', () => {
    const terrain = makeTerrain()
    const heightScale = sphereProjection.heightScale(terrain)
    for (let gridY = 0; gridY < terrain.height; gridY++) {
      for (let gridX = 0; gridX < terrain.width; gridX++) {
        const local = sphereProjection.toLocal(gridX, gridY, 0.5, terrain, heightScale)
        expect(sphereProjection.fromLocal(local.x, local.y, local.z, terrain)).toEqual({ gridX, gridY })
      }
    }
  })

  it('wraps longitude instead of rejecting it — there is no edge on a planet', () => {
    const terrain = makeTerrain()
    const heightScale = sphereProjection.heightScale(terrain)
    // One full turn past column 0 is column 0 again.
    const atZero = sphereProjection.toLocal(0, 4, 0.5, terrain, heightScale)
    const wrapped = sphereProjection.toLocal(terrain.width, 4, 0.5, terrain, heightScale)

    expect(wrapped.x).toBeCloseTo(atZero.x)
    expect(wrapped.y).toBeCloseTo(atZero.y)
    expect(sphereProjection.fromLocal(wrapped.x, wrapped.y, wrapped.z, terrain).gridX).toBe(0)
  })

  it('keeps the last column adjacent to the first, so the seam closes', () => {
    const terrain = makeTerrain()
    const heightScale = sphereProjection.heightScale(terrain)
    const first = sphereProjection.toLocal(0, 4, 0.5, terrain, heightScale)
    const last = sphereProjection.toLocal(terrain.width - 1, 4, 0.5, terrain, heightScale)
    const second = sphereProjection.toLocal(1, 4, 0.5, terrain, heightScale)

    const seamGap = Math.hypot(first.x - last.x, first.y - last.y, first.z - last.z)
    const ordinaryGap = Math.hypot(first.x - second.x, first.y - second.y, first.z - second.z)
    expect(seamGap).toBeCloseTo(ordinaryGap)
  })

  it('clamps latitude short of the poles so polar rows are not coincident', () => {
    const terrain = makeTerrain()
    const maxLatitude = Math.PI / 2 - SPHERE_VIEW.poleClampRadians
    expect(latitudeForRow(0, terrain.height)).toBeCloseTo(maxLatitude)
    expect(latitudeForRow(terrain.height - 1, terrain.height)).toBeCloseTo(-maxLatitude)

    const heightScale = sphereProjection.heightScale(terrain)
    const a = sphereProjection.toLocal(0, 0, 0.5, terrain, heightScale)
    const b = sphereProjection.toLocal(terrain.width / 2, 0, 0.5, terrain, heightScale)
    // Opposite sides of the polar cap ring must not collapse onto each
    // other — coincident vertices make zero-area faces and NaN normals.
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(0)
  })

  it('inverts latitudeForRow for interior rows', () => {
    const height = 8
    for (let gridY = 1; gridY < height - 1; gridY++) {
      expect(rowForLatitude(latitudeForRow(gridY, height), height)).toBeCloseTo(gridY)
    }
  })


  it('puts sea level a radius above the centre, not a height above zero', () => {
    const terrain = makeTerrain()
    const heightScale = sphereProjection.heightScale(terrain)
    expect(sphereProjection.waterSurface(terrain, heightScale)).toBeCloseTo(
      planetRadius(terrain) + BIOME_THRESHOLDS.oceanMaxHeight * heightScale,
    )
  })
})

describe('buildWaterArrays', () => {
  it('lays the sea out on the same grid as the ground beneath it', () => {
    const terrain = makeTerrain()
    for (const projection of [flatProjection, sphereProjection]) {
      const heightScale = projection.heightScale(terrain)
      const surface = projection.buildSurfaceArrays(terrain, heightScale)
      const water = projection.buildWaterArrays(terrain, heightScale)
      // Vertex for vertex and triangle for triangle, so heightMap and
      // both light maps index into the water with no remapping.
      expect(water.positions).toHaveLength(surface.positions.length)
      expect([...water.indices]).toEqual([...surface.indices])
    }
  })

  it('puts every one of its vertices exactly at sea level', () => {
    const terrain = makeTerrain({ heightMap: new Float64Array(16 * 8).map((_, i) => i / 128) })

    const flat = flatProjection.buildWaterArrays(terrain, 10)
    const expectedZ = BIOME_THRESHOLDS.oceanMaxHeight * 10
    for (let i = 2; i < flat.positions.length; i += 3) {
      expect(flat.positions[i]).toBeCloseTo(expectedZ, 5)
    }

    // On the globe sea level is a radius, not a height.
    const heightScale = sphereProjection.heightScale(terrain)
    const sphere = sphereProjection.buildWaterArrays(terrain, heightScale)
    const expectedRadius = length(sphereProjection.toLocal(0, 0, BIOME_THRESHOLDS.oceanMaxHeight, terrain, heightScale))
    for (let i = 0; i < sphere.positions.length; i += 3) {
      expect(length({ x: sphere.positions[i], y: sphere.positions[i + 1], z: sphere.positions[i + 2] }))
        .toBeCloseTo(expectedRadius, 5)
    }
  })

  it('carries the sea across the antimeridian and not across the flat map\u2019s edge', () => {
    const terrain = makeTerrain()
    expect(sphereProjection.buildWaterArrays(terrain, 1).indices)
      .toHaveLength(terrain.width * (terrain.height - 1) * 6)
    expect(flatProjection.buildWaterArrays(terrain, 1).indices)
      .toHaveLength((terrain.width - 1) * (terrain.height - 1) * 6)
  })
})

describe('buildSurfaceArrays', () => {
  it('emits one vertex per grid cell in heightMap index order', () => {
    const terrain = makeTerrain()
    for (const projection of [flatProjection, sphereProjection]) {
      const heightScale = projection.heightScale(terrain)
      const { positions } = projection.buildSurfaceArrays(terrain, heightScale)
      expect(positions).toHaveLength(terrain.width * terrain.height * 3)

      // Vertex N must match toLocal for the cell at index N, or the
      // per-vertex biome colors would land on the wrong vertices.
      const index = 3 * terrain.width + 5
      const expected = projection.toLocal(5, 3, terrain.heightMap[index], terrain, heightScale)
      expect(positions[index * 3]).toBeCloseTo(expected.x, 3)
      expect(positions[index * 3 + 1]).toBeCloseTo(expected.y, 3)
      expect(positions[index * 3 + 2]).toBeCloseTo(expected.z, 3)
    }
  })

  it('leaves the flat map open at its edges', () => {
    const terrain = makeTerrain()
    const { indices } = flatProjection.buildSurfaceArrays(terrain, 10)
    expect(indices).toHaveLength((terrain.width - 1) * (terrain.height - 1) * 6)
  })

  it('stitches the planet closed with one extra column of quads', () => {
    const terrain = makeTerrain()
    const { indices } = sphereProjection.buildSurfaceArrays(terrain, 1)
    expect(indices).toHaveLength(terrain.width * (terrain.height - 1) * 6)
    // Some triangle must join the last column back to the first.
    expect([...indices]).toContain(terrain.width - 1)
    expect([...indices]).toContain(0)
  })

  it('keeps every index inside the vertex buffer', () => {
    const terrain = makeTerrain()
    for (const projection of [flatProjection, sphereProjection]) {
      const { indices } = projection.buildSurfaceArrays(terrain, projection.heightScale(terrain))
      for (const index of indices) {
        expect(index).toBeLessThan(terrain.width * terrain.height)
      }
    }
  })

  it('sinks polar rows to sea on the real grid so the medallion can cover them', () => {
    // Fixture grids are too short for POLAR_CAPS.reachRows; use the
    // production height so the sink actually fires.
    const width = 32
    const height = GRID.height
    const heightMap = new Float64Array(width * height).fill(0.7)
    const terrain = { width, height, heightMap }
    const heightScale = sphereProjection.heightScale(terrain)
    const { positions } = sphereProjection.buildSurfaceArrays(terrain, heightScale)
    const seaRadius = planetRadius(terrain) + BIOME_THRESHOLDS.oceanMaxHeight * heightScale
    const landRadius = planetRadius(terrain) + 0.7 * heightScale

    // North pole row sits at sea, mid-latitude keeps the authored height.
    expect(Math.hypot(positions[0], positions[1], positions[2])).toBeCloseTo(seaRadius, 5)
    const mid = (height / 2) * width * 3
    expect(Math.hypot(positions[mid], positions[mid + 1], positions[mid + 2])).toBeCloseTo(
      landRadius,
      5,
    )
  })
})
