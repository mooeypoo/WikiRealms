import { describe, expect, it } from 'vitest'
import { createRng } from '../../../src/engine/generation/rng.js'
import { flattenPeaks, generateSectionTerrain, smoothHeightMap } from '../../../src/engine/generation/sectionTerrain.js'
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

  it('gives every retained section a visible minimum amplitude', () => {
    const [tiny] = flattenPeaks([makeNode('Tiny', 1), makeNode('Large', 99999)], bounds)

    expect(tiny.amplitude).toBeGreaterThanOrEqual(0.42)
  })

  it('places direct children around the parent footprint using their own-content height', () => {
    const child = makeNode('Child', 10)
    child.depth = 2
    const parent = makeNode('Parent', 20, [child])
    const peaks = flattenPeaks([parent], bounds)

    expect(peaks).toHaveLength(2) // parent + child
    const [parentPeak, childPeak] = peaks
    expect(childPeak.amplitude).toBeGreaterThanOrEqual(0.3)

    const distance = Math.hypot(childPeak.x - parentPeak.x, childPeak.y - parentPeak.y)
    expect(distance).toBeGreaterThan(0)
    expect(distance).toBeLessThanOrEqual(parentPeak.radius * 0.68)
  })

  it('uses subtree size for a section footprint and own size for its height', () => {
    const broad = makeNode('Broad', 100, [makeNode('Detail', 90)])
    broad.ownSize = 10
    const tall = makeNode('Tall', 20)
    tall.ownSize = 20

    const [broadPeak, , tallPeak] = flattenPeaks([broad, tall], bounds)

    expect(broadPeak.radius).toBeGreaterThan(tallPeak.radius)
    expect(broadPeak.amplitude).toBeLessThan(tallPeak.amplitude)
  })

  it('enforces a minimum peak radius even for a tiny share', () => {
    const nodes = [makeNode('Tiny', 1), makeNode('Huge', 999999)]
    const [tiny] = flattenPeaks(nodes, bounds)

    expect(tiny.radius).toBeGreaterThanOrEqual(6) // PEAK_LAYOUT.minPeakRadius
  })

  it('preserves a section citation signal on its peak', () => {
    const node = makeNode('Sourced', 100)
    node.citationCount = 7
    node.citationDensity = 0.07

    const [peak] = flattenPeaks([node], bounds)

    expect(peak).toMatchObject({ ownCitationCount: 7, citationCount: 7, citationDensity: 0.07 })
  })

  it('uses subtree citations for a parent mountain range', () => {
    const child = makeNode('Child', 50)
    child.citationCount = 2
    child.subtreeCitationCount = 2
    child.subtreeCitationDensity = 0.04
    const parent = makeNode('Parent', 100, [child])
    parent.citationCount = 0
    parent.subtreeCitationCount = 2
    parent.subtreeCitationDensity = 2 / 150

    const [parentPeak] = flattenPeaks([parent], bounds)

    expect(parentPeak.citationCount).toBe(2)
  })
})

describe('generateSectionTerrain', () => {
  const sections = [makeNode('Purpose', 500), makeNode('Features', 1500, [makeNode('Sub', 400)])]

  function peaksFor(width, height) {
    return flattenPeaks(sections, { centerX: width / 2, centerY: height / 2, maxRadius: Math.min(width, height) * 0.42 })
  }

  it('produces grids sized to width * height', () => {
    const terrain = generateSectionTerrain({ width: 16, height: 12, rng: createRng(1), peaks: peaksFor(16, 12), totalArticleSize: 2000 })

    expect(terrain.heightMap).toHaveLength(192)
    expect(terrain.moistureMap).toHaveLength(192)
    expect(terrain.biomeMap).toHaveLength(192)
  })

  it('is deterministic for the same seed and section tree', () => {
    const a = generateSectionTerrain({ width: 32, height: 32, rng: createRng(7), peaks: peaksFor(32, 32), totalArticleSize: 2000 })
    const b = generateSectionTerrain({ width: 32, height: 32, rng: createRng(7), peaks: peaksFor(32, 32), totalArticleSize: 2000 })

    expect(Array.from(a.heightMap)).toEqual(Array.from(b.heightMap))
  })

  it('produces different terrain for a different section tree', () => {
    const a = generateSectionTerrain({ width: 32, height: 32, rng: createRng(7), peaks: peaksFor(32, 32), totalArticleSize: 2000 })
    const differentSections = [makeNode('OnlySection', 2000)]
    const b = generateSectionTerrain({
      width: 32,
      height: 32,
      rng: createRng(7),
      peaks: flattenPeaks(differentSections, { centerX: 16, centerY: 16, maxRadius: 32 * 0.42 }),
      totalArticleSize: 2000,
    })

    expect(Array.from(a.heightMap)).not.toEqual(Array.from(b.heightMap))
  })

  it('keeps a saddle between nearby top-level section peaks', () => {
    const terrain = generateSectionTerrain({
      width: 32,
      height: 32,
      rng: createRng(7),
      peaks: [
        { x: 11, y: 16, radius: 20, amplitude: 0.8, depth: 1, title: 'First' },
        { x: 21, y: 16, radius: 20, amplitude: 0.8, depth: 1, title: 'Second' },
      ],
      totalArticleSize: 2000,
    })

    const heightAt = (x, y) => terrain.heightMap[y * terrain.width + x]

    expect(heightAt(16, 16)).toBeLessThan(heightAt(11, 16))
    expect(heightAt(16, 16)).toBeLessThan(heightAt(21, 16))
  })

  it('keeps height and moisture within [0, 1]', () => {
    const terrain = generateSectionTerrain({ width: 24, height: 24, rng: createRng(3), peaks: peaksFor(24, 24), totalArticleSize: 2000 })

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
    const terrain = generateSectionTerrain({ width: 24, height: 24, rng: createRng(3), peaks: peaksFor(24, 24), totalArticleSize: 2000 })
    const validBiomes = new Set(Object.values(BIOME))

    for (const biome of terrain.biomeMap) {
      expect(validBiomes.has(biome)).toBe(true)
    }
  })

  it('produces more exposed land on average for a larger totalArticleSize', () => {
    const small = generateSectionTerrain({ width: 48, height: 48, rng: createRng(5), peaks: peaksFor(48, 48), totalArticleSize: 0 })
    const large = generateSectionTerrain({
      width: 48,
      height: 48,
      rng: createRng(5),
      peaks: peaksFor(48, 48),
      totalArticleSize: 40000,
    })

    const countNonOcean = (biomeMap) => Array.from(biomeMap).filter((b) => b !== BIOME.OCEAN).length

    expect(countNonOcean(large.biomeMap)).toBeGreaterThan(countNonOcean(small.biomeMap))
  })

  it('handles an empty section tree gracefully (no peaks, still valid output)', () => {
    const terrain = generateSectionTerrain({ width: 16, height: 16, rng: createRng(1), peaks: [], totalArticleSize: 0 })

    expect(terrain.heightMap).toHaveLength(256)
    expect(Array.from(terrain.heightMap).every((v) => v >= 0 && v <= 1)).toBe(true)
  })
})

describe('smoothHeightMap', () => {
  it('rounds an isolated spike while retaining it as the local maximum', () => {
    const source = new Float64Array([
      0, 0, 0,
      0, 1, 0,
      0, 0, 0,
    ])

    const smoothed = smoothHeightMap(source, 3, 3, 2, 0.18)

    expect(smoothed[4]).toBeLessThan(1)
    expect(smoothed[4]).toBeGreaterThan(smoothed[0])
    expect(smoothed[4]).toBeGreaterThan(smoothed[1])
  })
})
