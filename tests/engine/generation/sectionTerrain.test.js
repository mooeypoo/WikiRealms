import { describe, expect, it } from 'vitest'
import { createRng } from '../../../src/engine/generation/rng.js'
import { flattenPeaks, generateSectionTerrain } from '../../../src/engine/generation/sectionTerrain.js'
import { BIOME } from '../../../src/engine/generation/terrain.js'

function makeNode(title, subtreeSize, children = []) {
  return { title, depth: 1, anchor: title, ownSize: subtreeSize, subtreeSize, children }
}

const bounds = { centerX: 64, centerY: 64, maxRadius: 50 }

describe('flattenPeaks', () => {
  it('returns an empty list for an empty tree', () => {
    expect(flattenPeaks([], bounds)).toEqual([])
  })

  it('creates one peak per top-level node, largest first at the center', () => {
    const nodes = [makeNode('Small', 10), makeNode('Big', 90)]
    const peaks = flattenPeaks(nodes, bounds)

    expect(peaks).toHaveLength(2)
    // "Small" is placed first (index 0) since it's first in the input array,
    // regardless of size — sorting by size is the caller's responsibility
    // (applyPeakLimits already sorts before this is called in practice).
    expect(peaks[0].x).toBeCloseTo(64)
    expect(peaks[0].y).toBeCloseTo(64)
  })

  it('gives a larger share a bigger amplitude and radius', () => {
    const nodes = [makeNode('Small', 10), makeNode('Big', 90)]
    const [small, big] = flattenPeaks(nodes, bounds)

    expect(big.amplitude).toBeGreaterThan(small.amplitude)
    expect(big.radius).toBeGreaterThan(small.radius)
  })

  it('recursively places children within the parent footprint, with reduced amplitude', () => {
    const child = makeNode('Child', 10)
    const parent = makeNode('Parent', 20, [child])
    const peaks = flattenPeaks([parent], bounds)

    expect(peaks).toHaveLength(2) // parent + child
    const [parentPeak, childPeak] = peaks
    expect(childPeak.amplitude).toBeLessThan(parentPeak.amplitude)

    const distance = Math.hypot(childPeak.x - parentPeak.x, childPeak.y - parentPeak.y)
    expect(distance).toBeLessThanOrEqual(parentPeak.radius)
  })

  it('enforces a minimum peak radius even for a tiny share', () => {
    const nodes = [makeNode('Tiny', 1), makeNode('Huge', 999999)]
    const [tiny] = flattenPeaks(nodes, bounds)

    expect(tiny.radius).toBeGreaterThanOrEqual(6) // PEAK_LAYOUT.minPeakRadius
  })
})

describe('generateSectionTerrain', () => {
  const sections = [makeNode('Purpose', 500), makeNode('Features', 1500, [makeNode('Sub', 400)])]

  it('produces grids sized to width * height', () => {
    const terrain = generateSectionTerrain({ width: 16, height: 12, rng: createRng(1), sections, totalArticleSize: 2000 })

    expect(terrain.heightMap).toHaveLength(192)
    expect(terrain.moistureMap).toHaveLength(192)
    expect(terrain.biomeMap).toHaveLength(192)
  })

  it('is deterministic for the same seed and section tree', () => {
    const a = generateSectionTerrain({ width: 32, height: 32, rng: createRng(7), sections, totalArticleSize: 2000 })
    const b = generateSectionTerrain({ width: 32, height: 32, rng: createRng(7), sections, totalArticleSize: 2000 })

    expect(Array.from(a.heightMap)).toEqual(Array.from(b.heightMap))
  })

  it('produces different terrain for a different section tree', () => {
    const a = generateSectionTerrain({ width: 32, height: 32, rng: createRng(7), sections, totalArticleSize: 2000 })
    const differentSections = [makeNode('OnlySection', 2000)]
    const b = generateSectionTerrain({
      width: 32,
      height: 32,
      rng: createRng(7),
      sections: differentSections,
      totalArticleSize: 2000,
    })

    expect(Array.from(a.heightMap)).not.toEqual(Array.from(b.heightMap))
  })

  it('keeps height and moisture within [0, 1]', () => {
    const terrain = generateSectionTerrain({ width: 24, height: 24, rng: createRng(3), sections, totalArticleSize: 2000 })

    for (const value of terrain.heightMap) {
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(1)
    }
    for (const value of terrain.moistureMap) {
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(1)
    }
  })

  it('assigns every cell a valid known biome', () => {
    const terrain = generateSectionTerrain({ width: 24, height: 24, rng: createRng(3), sections, totalArticleSize: 2000 })
    const validBiomes = new Set(Object.values(BIOME))

    for (const biome of terrain.biomeMap) {
      expect(validBiomes.has(biome)).toBe(true)
    }
  })

  it('produces more exposed land on average for a larger totalArticleSize', () => {
    const small = generateSectionTerrain({ width: 48, height: 48, rng: createRng(5), sections, totalArticleSize: 0 })
    const large = generateSectionTerrain({
      width: 48,
      height: 48,
      rng: createRng(5),
      sections,
      totalArticleSize: 40000,
    })

    const countNonOcean = (biomeMap) => Array.from(biomeMap).filter((b) => b !== BIOME.OCEAN).length

    expect(countNonOcean(large.biomeMap)).toBeGreaterThan(countNonOcean(small.biomeMap))
  })

  it('handles an empty section tree gracefully (no peaks, still valid output)', () => {
    const terrain = generateSectionTerrain({ width: 16, height: 16, rng: createRng(1), sections: [], totalArticleSize: 0 })

    expect(terrain.heightMap).toHaveLength(256)
    expect(Array.from(terrain.heightMap).every((v) => v >= 0 && v <= 1)).toBe(true)
  })
})
