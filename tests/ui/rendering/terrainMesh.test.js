import { describe, expect, it } from 'vitest'
import {
  computeHeightScale,
  computePeakFlagPosition,
  computePortalLocalPosition,
  computeVertexColors,
  computeWaterSurfaceHeight,
  parseRgbColor,
} from '../../../src/ui/rendering/terrainMesh.js'
import { BIOME } from '../../../src/engine/generation/terrain.js'

function makeTerrain(overrides = {}) {
  const width = 4
  const height = 4
  const cellCount = width * height
  return {
    width,
    height,
    heightMap: new Float64Array(cellCount).fill(0.5),
    biomeMap: new Uint8Array(cellCount).fill(BIOME.PLAINS),
    ...overrides,
  }
}

describe('parseRgbColor', () => {
  it('parses an rgb() string into a [r,g,b] tuple', () => {
    expect(parseRgbColor('rgb(10, 20, 30)')).toEqual([10, 20, 30])
  })

  it('returns black for an unparseable string', () => {
    expect(parseRgbColor('not-a-color')).toEqual([0, 0, 0])
  })
})

describe('computeVertexColors', () => {
  it('produces 3 float values per cell', () => {
    const terrain = makeTerrain()
    const colors = computeVertexColors(terrain)

    expect(colors).toHaveLength(terrain.width * terrain.height * 3)
  })

  it('normalizes color channels to [0, 1]', () => {
    const colors = computeVertexColors(makeTerrain())

    for (const channel of colors) {
      expect(channel).toBeGreaterThanOrEqual(0)
      expect(channel).toBeLessThanOrEqual(1)
    }
  })

  it('is deterministic and matches biomeColor for a given cell', () => {
    const terrain = makeTerrain({
      biomeMap: new Uint8Array([BIOME.OCEAN, BIOME.SNOW, BIOME.PLAINS, BIOME.FOREST]),
      heightMap: new Float64Array([0.1, 0.9, 0.5, 0.5]),
      width: 2,
      height: 2,
    })

    const colors = computeVertexColors(terrain)
    // ocean cell (index 0) should be bluer than the snow cell (index 1)
    expect(colors[0]).toBeLessThan(colors[3]) // r channel: ocean < snow
    expect(colors[2]).toBeLessThan(colors[5]) // b channel: ocean < snow (snow is near-white)
  })
})

describe('computeHeightScale', () => {
  it('scales proportionally to the smaller grid dimension', () => {
    expect(computeHeightScale(128, 128)).toBeCloseTo(128 * 0.18)
    expect(computeHeightScale(64, 128)).toBeCloseTo(64 * 0.18)
  })
})

describe('computePortalLocalPosition', () => {
  it('centers the portal position on the grid', () => {
    const terrain = makeTerrain()
    const position = computePortalLocalPosition({ gridX: 0, gridY: 0 }, terrain, 10)

    expect(position.x).toBe(0 - terrain.width / 2)
    expect(position.y).toBe(0 - terrain.height / 2)
  })

  it('floats above the terrain surface height at that cell', () => {
    const terrain = makeTerrain()
    terrain.heightMap[0] = 0.8 // gridX=0, gridY=0 -> index 0

    const position = computePortalLocalPosition({ gridX: 0, gridY: 0 }, terrain, 10, 1.5)

    expect(position.z).toBeCloseTo(0.8 * 10 + 1.5)
  })

  it('uses a default hover offset when not specified', () => {
    const terrain = makeTerrain()
    terrain.heightMap[0] = 0

    const position = computePortalLocalPosition({ gridX: 0, gridY: 0 }, terrain, 10)

    expect(position.z).toBeGreaterThan(0)
  })
})

describe('computePeakFlagPosition', () => {
  it('centers the flag position on the grid and includes the peak title', () => {
    const terrain = makeTerrain()
    const position = computePeakFlagPosition({ x: 0, y: 0, title: 'Early life' }, terrain, 10)

    expect(position.x).toBe(0 - terrain.width / 2)
    expect(position.y).toBe(0 - terrain.height / 2)
    expect(position.title).toBe('Early life')
  })

  it('rounds and clamps fractional/out-of-range peak coordinates to a valid grid cell', () => {
    const terrain = makeTerrain()
    terrain.heightMap[12] = 0.6 // gridX clamps to 0, gridY clamps to (height-1)=3 -> index 3*4+0=12

    const position = computePeakFlagPosition({ x: -3.7, y: 100, title: 'X' }, terrain, 10, 0)

    expect(position.z).toBeCloseTo(0.6 * 10)
  })
})

describe('computeWaterSurfaceHeight', () => {
  it('scales the ocean biome threshold by the height scale', () => {
    expect(computeWaterSurfaceHeight(100)).toBeCloseTo(0.32 * 100)
  })

  it('is deterministic', () => {
    expect(computeWaterSurfaceHeight(50)).toBe(computeWaterSurfaceHeight(50))
  })
})
