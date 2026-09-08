import { describe, expect, it } from 'vitest'
import {
  computeGroundAttributes,
  computePeakFlagPosition,
  computePortalLocalPosition,
  computeVertexColors,
} from '../../../src/ui/rendering/terrainMesh.js'
import { biomeGroundRgb, biomeRgb } from '../../../src/ui/rendering/biomeColor.js'
import { BIOME } from '../../../src/engine/generation/terrain.js'
import { ALTITUDE } from '../../../src/engine/generation/config.js'

function makeTerrain(overrides = {}) {
  const width = 4
  const height = 4
  const cellCount = width * height
  return {
    width,
    height,
    heightMap: new Float64Array(cellCount).fill(0.5),
    biomeMap: new Uint8Array(cellCount).fill(BIOME.MEADOW),
    ...overrides,
  }
}

describe('computeGroundAttributes', () => {
  it('produces a colour per cell and a snow amount per cell', () => {
    const terrain = makeTerrain()
    const { colors, snow } = computeGroundAttributes(terrain)

    expect(colors).toHaveLength(terrain.width * terrain.height * 3)
    expect(snow).toHaveLength(terrain.width * terrain.height)
  })

  it('leaves the snow out of the colour', () => {
    // A cell high enough to be fully covered: the ground buffer must
    // still carry its band colour, or a snowline could never move off it.
    const terrain = makeTerrain({
      heightMap: new Float64Array(16).fill(ALTITUDE.snowFull),
      biomeMap: new Uint8Array(16).fill(BIOME.JUNGLE),
    })
    const { colors, snow } = computeGroundAttributes(terrain)
    const [r, g, b] = biomeGroundRgb(BIOME.JUNGLE, ALTITUDE.snowFull)

    expect(snow[0]).toBeCloseTo(1, 5)
    expect(colors[0]).toBeCloseTo(r / 255, 5)
    expect(colors[1]).toBeCloseTo(g / 255, 5)
    expect(colors[2]).toBeCloseTo(b / 255, 5)
    // Not already white, which is what baking the two together gives.
    expect(colors[0]).toBeLessThan(0.9)
  })

  it('reconstructs the baked colour when mixed back with snow', () => {
    // The two halves have to add back up to what the 2D view draws, or
    // the snowline moving would also silently reshade the world.
    const heights = [0.2, 0.5, 0.7, 0.85, 0.95, 1]
    const terrain = makeTerrain({
      width: heights.length,
      height: 1,
      heightMap: Float64Array.from(heights),
      biomeMap: new Uint8Array(heights.length).fill(BIOME.WOODLAND),
    })
    const { colors, snow } = computeGroundAttributes(terrain)

    heights.forEach((h, i) => {
      const expected = biomeRgb(BIOME.WOODLAND, h)
      for (let channel = 0; channel < 3; channel += 1) {
        const ground = colors[i * 3 + channel]
        const white = [245, 245, 250][channel] / 255
        expect(ground + (white - ground) * snow[i]).toBeCloseTo(expected[channel] / 255, 2)
      }
    })
  })

  it('gives water no snow, however the thresholds move', () => {
    const terrain = makeTerrain({
      heightMap: new Float64Array(16).fill(1),
      biomeMap: new Uint8Array(16).fill(BIOME.OCEAN),
    })

    expect(computeGroundAttributes(terrain).snow.every((value) => value === 0)).toBe(true)
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
      biomeMap: new Uint8Array([BIOME.OCEAN, BIOME.SNOW, BIOME.MEADOW, BIOME.WOODLAND]),
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

describe('computePortalLocalPosition', () => {
  it('centers the portal position on the grid', () => {
    const terrain = makeTerrain()
    const position = computePortalLocalPosition({ gridX: 0, gridY: 0 }, terrain, 10)

    expect(position.x).toBe(0 - terrain.width / 2)
    // Y is flipped to match three.js PlaneGeometry (see terrainMesh.js).
    expect(position.y).toBe(terrain.height / 2)
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

    expect(position.z).toBeCloseTo(0.32 * 10 + 6)
  })

  it('keeps a portal above the water surface when its cell is submerged', () => {
    const terrain = makeTerrain()
    terrain.heightMap[0] = 0.1

    const position = computePortalLocalPosition({ gridX: 0, gridY: 0 }, terrain, 10, 3)

    expect(position.z).toBeCloseTo(0.32 * 10 + 3)
  })
})

describe('computePeakFlagPosition', () => {
  it('centers the flag position on the grid and includes the peak title', () => {
    const terrain = makeTerrain()
    const position = computePeakFlagPosition({ x: 0, y: 0, title: 'Early life' }, terrain, 10)

    expect(position.x).toBe(0 - terrain.width / 2)
    expect(position.y).toBe(terrain.height / 2)
    expect(position.title).toBe('Early life')
  })

  it('rounds and clamps fractional/out-of-range peak coordinates to a valid grid cell', () => {
    const terrain = makeTerrain()
    terrain.heightMap[12] = 0.6 // gridX clamps to 0, gridY clamps to (height-1)=3 -> index 3*4+0=12

    const position = computePeakFlagPosition({ x: -3.7, y: 100, title: 'X' }, terrain, 10, 0)

    expect(position.z).toBeCloseTo(0.6 * 10)
  })
})

