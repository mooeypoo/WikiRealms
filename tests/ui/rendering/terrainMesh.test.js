import { describe, expect, it } from 'vitest'
import {
  NEVER_SNOWED,
  computeGroundAttributes,
  computePeakFlagPosition,
  computePortalLocalPosition,
} from '../../../src/ui/rendering/terrainMesh.js'
import { biomeGroundRgb, biomeRgb } from '../../../src/ui/rendering/biomeColor.js'
import { BIOME, snowCover } from '../../../src/engine/generation/terrain.js'
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
  it('produces a colour per cell and a snow height per cell', () => {
    const terrain = makeTerrain()
    const { colors, snowHeights } = computeGroundAttributes(terrain)

    expect(colors).toHaveLength(terrain.width * terrain.height * 3)
    expect(snowHeights).toHaveLength(terrain.width * terrain.height)
  })

  it('leaves the snow out of the colour', () => {
    // A cell high enough to be fully covered: the ground buffer must
    // still carry its band colour, or a snowline could never move off it.
    const terrain = makeTerrain({
      heightMap: new Float64Array(16).fill(ALTITUDE.snowFull),
      biomeMap: new Uint8Array(16).fill(BIOME.JUNGLE),
    })
    const { colors } = computeGroundAttributes(terrain)
    const [r, g, b] = biomeGroundRgb(BIOME.JUNGLE, ALTITUDE.snowFull)

    expect(colors[0]).toBeCloseTo(r / 255, 5)
    expect(colors[1]).toBeCloseTo(g / 255, 5)
    expect(colors[2]).toBeCloseTo(b / 255, 5)
    // Not already white, which is what baking the two together gives.
    expect(colors[0]).toBeLessThan(0.9)
  })

  it('carries the cell height, not the cover, so the line can move', () => {
    const heights = [0.2, 0.85, 0.95]
    const terrain = makeTerrain({
      width: heights.length,
      height: 1,
      heightMap: Float64Array.from(heights),
      biomeMap: new Uint8Array(heights.length).fill(BIOME.WOODLAND),
    })
    const { snowHeights } = computeGroundAttributes(terrain)

    heights.forEach((h, i) => expect(snowHeights[i]).toBeCloseTo(h, 5))
  })

  it('reconstructs the baked colour when the shader rule is applied', () => {
    // The buffers plus the smoothstep the shader runs have to land on
    // what the 2D view draws. This is the assertion that catches the
    // GLSL and biomeColor drifting apart, since the shader itself cannot
    // be run here.
    const heights = [0.2, 0.5, 0.7, 0.85, 0.95, 1]
    const terrain = makeTerrain({
      width: heights.length,
      height: 1,
      heightMap: Float64Array.from(heights),
      biomeMap: new Uint8Array(heights.length).fill(BIOME.WOODLAND),
    })
    const { colors, snowHeights } = computeGroundAttributes(terrain)

    heights.forEach((h, i) => {
      // snowCover IS the smoothstep the shader runs between the two
      // snowline uniforms, so this compares against the authority.
      const cover = snowCover(snowHeights[i])
      const expected = biomeRgb(BIOME.WOODLAND, h)
      for (let channel = 0; channel < 3; channel += 1) {
        const ground = colors[i * 3 + channel]
        const white = [245, 245, 250][channel] / 255
        expect(ground + (white - ground) * cover).toBeCloseTo(expected[channel] / 255, 2)
      }
    })
  })

  it('opts water out at any altitude rather than relying on the line', () => {
    // A submerged cell is never snowed on, and says so by carrying a
    // height no threshold can reach — so the rule survives the snowline
    // being moved down to sea level.
    const terrain = makeTerrain({
      heightMap: new Float64Array(16).fill(1),
      biomeMap: new Uint8Array(16).fill(BIOME.OCEAN),
    })

    expect(computeGroundAttributes(terrain).snowHeights.every((value) => value === NEVER_SNOWED)).toBe(true)
    expect(NEVER_SNOWED).toBeLessThan(0)
  })
})

describe('computeGroundAttributes colours', () => {
  it('keeps every channel inside [0, 1]', () => {
    // Height shading multiplies by up to 1.3 and biomeGroundRgb does not
    // clamp, so an unclamped upload could hand the GPU a colour brighter
    // than white.
    const terrain = makeTerrain({
      biomeMap: new Uint8Array([BIOME.DUNES, BIOME.SNOW, BIOME.MEADOW, BIOME.OCEAN]),
      heightMap: new Float64Array([0.62, 0.3, 1, 0]),
      width: 2,
      height: 2,
    })

    for (const channel of computeGroundAttributes(terrain).colors) {
      expect(channel).toBeGreaterThanOrEqual(0)
      expect(channel).toBeLessThanOrEqual(1)
    }
  })

  it('distinguishes water from land at the same height', () => {
    const terrain = makeTerrain({
      biomeMap: new Uint8Array([BIOME.OCEAN, BIOME.MEADOW, BIOME.OCEAN, BIOME.MEADOW]),
      heightMap: new Float64Array([0.1, 0.1, 0.1, 0.1]),
      width: 2,
      height: 2,
    })
    const { colors } = computeGroundAttributes(terrain)

    // Ocean is blue-dominant, the meadow band green-dominant.
    expect(colors[2]).toBeGreaterThan(colors[0])
    expect(colors[4]).toBeGreaterThan(colors[5])
  })

  it('is deterministic for a given terrain', () => {
    const terrain = makeTerrain()
    const first = computeGroundAttributes(terrain)
    const second = computeGroundAttributes(terrain)

    expect(Array.from(first.colors)).toEqual(Array.from(second.colors))
    expect(Array.from(first.snowHeights)).toEqual(Array.from(second.snowHeights))
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

