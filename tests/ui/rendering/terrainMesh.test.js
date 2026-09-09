import { describe, expect, it } from 'vitest'
import {
  NEVER_SNOWED,
  computeGroundAttributes,
  computePeakFlagPosition,
  computePortalLocalPosition,
} from '../../../src/ui/rendering/terrainMesh.js'
import { SNOW_RGB, biomeGroundRgb, groundRgbAt } from '../../../src/ui/rendering/biomeColor.js'
import { BIOME, lushnessBand, snowCover } from '../../../src/engine/generation/terrain.js'
import { ALTITUDE, SHORE } from '../../../src/engine/generation/config.js'

/**
 * Lushness scalars that land in a known band, asserted rather than
 * assumed — the cuts are config and could move.
 */
const LUSH = { meadow: 0.5, woodland: 0.7, jungle: 0.95 }

function makeTerrain(overrides = {}) {
  const width = 4
  const height = 4
  const cellCount = width * height
  return {
    width,
    height,
    heightMap: new Float64Array(cellCount).fill(0.5),
    biomeMap: new Uint8Array(cellCount).fill(BIOME.MEADOW),
    lushnessMap: new Float32Array(cellCount).fill(LUSH.meadow),
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
    expect(lushnessBand(LUSH.jungle)).toBe(BIOME.JUNGLE)
    const terrain = makeTerrain({
      heightMap: new Float64Array(16).fill(ALTITUDE.snowFull),
      biomeMap: new Uint8Array(16).fill(BIOME.JUNGLE),
      lushnessMap: new Float32Array(16).fill(LUSH.jungle),
    })
    const { colors } = computeGroundAttributes(terrain)
    const [r, g, b] = groundRgbAt(BIOME.JUNGLE, LUSH.jungle, ALTITUDE.snowFull)

    expect(colors[0]).toBeCloseTo(r / 255, 5)
    expect(colors[1]).toBeCloseTo(g / 255, 5)
    expect(colors[2]).toBeCloseTo(b / 255, 5)
    // Not already white, which is what baking the two together gives.
    expect(colors[0]).toBeLessThan(0.9)
  })

  it('takes its band from the lushness scalar, not the biome id', () => {
    // The mesh interpolates, so it reads the scalar; see groundRgbAt.
    // Two cells that agree on biome and height but differ in lushness
    // have to come out different colours, or the plumbing is not wired.
    const terrain = makeTerrain({
      width: 2,
      height: 1,
      heightMap: new Float64Array([0.5, 0.5]),
      biomeMap: new Uint8Array([BIOME.MEADOW, BIOME.MEADOW]),
      lushnessMap: new Float32Array([LUSH.meadow, LUSH.jungle]),
    })
    const { colors } = computeGroundAttributes(terrain)

    expect([colors[0], colors[1], colors[2]]).not.toEqual([colors[3], colors[4], colors[5]])
    // The jungle band is the darker, more saturated green of the two.
    expect(colors[4]).toBeLessThan(colors[1])
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

  it('reconstructs the ground plus snow when the shader rule is applied', () => {
    // The buffers plus the smoothstep the shader runs have to land on
    // the colour the palette says. This is the assertion that catches the
    // GLSL and biomeColor drifting apart, since the shader itself cannot
    // be run here.
    expect(lushnessBand(LUSH.woodland)).toBe(BIOME.WOODLAND)
    const heights = [0.5, 0.7, 0.85, 0.95, 1]
    const terrain = makeTerrain({
      width: heights.length,
      height: 1,
      heightMap: Float64Array.from(heights),
      biomeMap: new Uint8Array(heights.length).fill(BIOME.WOODLAND),
      lushnessMap: new Float32Array(heights.length).fill(LUSH.woodland),
    })
    const { colors, snowHeights } = computeGroundAttributes(terrain)

    heights.forEach((h, i) => {
      // snowCover IS the smoothstep the shader runs between the two
      // snowline uniforms, so this compares against the authority.
      const cover = snowCover(snowHeights[i])
      const expected = groundRgbAt(BIOME.WOODLAND, LUSH.woodland, h)
      for (let channel = 0; channel < 3; channel += 1) {
        const ground = colors[i * 3 + channel]
        const white = SNOW_RGB[channel] / 255
        const white_over = ground + (white - ground) * cover
        const bakedGround = expected[channel] / 255
        expect(white_over).toBeCloseTo(bakedGround + (white - bakedGround) * cover, 2)
      }
    })
  })

  it('agrees with the 2D map on open land, away from the coast', () => {
    // The two paths answer different questions (see groundRgbAt) and are
    // allowed to differ over the shore and, slightly, over rock. Between
    // those they must not: the flat map and the mesh are the same world,
    // and a reader switching views should not see the palette change.
    const heights = [0.45, 0.5, 0.55, 0.6]
    const terrain = makeTerrain({
      width: heights.length,
      height: 1,
      heightMap: Float64Array.from(heights),
      biomeMap: new Uint8Array(heights.length).fill(BIOME.WOODLAND),
      lushnessMap: new Float32Array(heights.length).fill(LUSH.woodland),
    })
    const { colors } = computeGroundAttributes(terrain)

    heights.forEach((h, i) => {
      expect(h).toBeGreaterThan(SHORE.sandFadeTo)
      expect(h).toBeLessThan(ALTITUDE.rockStart)
      const flat = biomeGroundRgb(BIOME.WOODLAND, h)
      for (let channel = 0; channel < 3; channel += 1) {
        expect(colors[i * 3 + channel]).toBeCloseTo(flat[channel] / 255, 5)
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

  it('distinguishes the sea floor from open land', () => {
    // Heights that a real world would actually produce for these biomes:
    // classifyBiome cannot return a land band below the waterline, so a
    // meadow at 0.1 is not a case worth defending, and this path now
    // takes the surface's height as the authority on where it is.
    const terrain = makeTerrain({
      biomeMap: new Uint8Array([BIOME.OCEAN, BIOME.MEADOW, BIOME.OCEAN, BIOME.MEADOW]),
      heightMap: new Float64Array([0.1, 0.5, 0.1, 0.5]),
      width: 2,
      height: 2,
    })
    const { colors } = computeGroundAttributes(terrain)

    // Ocean is blue-dominant, the meadow band green-dominant.
    expect(colors[2]).toBeGreaterThan(colors[0])
    expect(colors[4]).toBeGreaterThan(colors[5])
  })

  it('puts a land band under the water when the height says so', () => {
    // The consequence of height being the authority, stated so it is a
    // decision rather than a surprise: a submerged cell reads as sea
    // floor whatever its biome id claims, which is what keeps the
    // coastline a contour of the surface instead of of the biome map.
    const terrain = makeTerrain({
      width: 2,
      height: 1,
      biomeMap: new Uint8Array([BIOME.MEADOW, BIOME.MEADOW]),
      heightMap: new Float64Array([0.15, 0.5]),
      lushnessMap: new Float32Array([LUSH.meadow, LUSH.meadow]),
    })
    const { colors } = computeGroundAttributes(terrain)

    expect(colors[2]).toBeGreaterThan(colors[1]) // submerged: blue over green
    expect(colors[4]).toBeGreaterThan(colors[5]) // dry land: green over blue
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

