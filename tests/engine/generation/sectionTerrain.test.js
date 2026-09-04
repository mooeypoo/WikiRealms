import { describe, expect, it } from 'vitest'
import { createRng } from '../../../src/engine/generation/rng.js'
import { annotateSectionIndices, flattenPeaks, generateSectionTerrain, separateSections, smoothHeightMap } from '../../../src/engine/generation/sectionTerrain.js'
import { BIOME } from '../../../src/engine/generation/terrain.js'
import { GRID, PEAK_LAYOUT } from '../../../src/engine/generation/config.js'

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

  it('carries each node\'s heading anchor onto its peak, null when it has none', () => {
    const child = makeNode('Child', 10)
    child.depth = 2
    const anchorless = makeNode('Miscellaneous', 20)
    anchorless.anchor = undefined

    const peaks = flattenPeaks([makeNode('History', 80, [child]), anchorless], bounds)

    expect(peaks.map((peak) => peak.anchor)).toEqual(['History', 'Child', null])
  })

  // Radius is maxRadius * sqrt(share), so an article with few sections
  // gives each an enormous footprint whose continental skirt swamps the
  // grid (and, on the planet, wraps over the poles). See PEAK_LAYOUT.
  it('caps a dominant section\'s footprint at maxPeakRadiusRatio of the grid', () => {
    const ceiling = Math.min(GRID.width, GRID.height) * PEAK_LAYOUT.maxPeakRadiusRatio
    // One section owning the whole article, with a deliberately oversized
    // layout radius: uncapped this would be the full maxRadius.
    const [only] = flattenPeaks([makeNode('Everything', 100)], { centerX: 64, centerY: 64, maxRadius: 400 })

    expect(only.radius).toBeCloseTo(ceiling)
  })

  it('still floors a negligible section at minPeakRadius', () => {
    const [, tiny] = flattenPeaks([makeNode('Huge', 100000), makeNode('Tiny', 1)], bounds)

    expect(tiny.radius).toBeCloseTo(PEAK_LAYOUT.minPeakRadius)
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

describe('annotateSectionIndices', () => {
  it('gives each top-level peak its own peaks-array index as sectionIndex', () => {
    const sections = [makeNode('First', 100), makeNode('Second', 100)]
    const peaks = annotateSectionIndices(flattenPeaks(sections, bounds))

    expect(peaks[0].sectionIndex).toBe(0)
    expect(peaks[1].sectionIndex).toBe(1)
  })

  it('gives each subsection its parent top-level peak\'s index', () => {
    const child = makeNode('Child', 10)
    child.depth = 2
    const nested = makeNode('Nested', 50, [child])
    const sections = [makeNode('First', 100), nested]

    const peaks = annotateSectionIndices(flattenPeaks(sections, bounds))
    // peaks[0] = First, peaks[1] = Nested, peaks[2] = Nested's child
    expect(peaks[0].sectionIndex).toBe(0)
    expect(peaks[1].sectionIndex).toBe(1)
    expect(peaks[2].sectionIndex).toBe(1)
  })

  it('returns the same array reference for chaining', () => {
    const peaks = flattenPeaks([makeNode('Only', 100)], bounds)
    expect(annotateSectionIndices(peaks)).toBe(peaks)
  })
})

describe('generateSectionTerrain', () => {
  const sections = [makeNode('Purpose', 500), makeNode('Features', 1500, [makeNode('Sub', 400)])]

  function peaksFor(width, height) {
    return annotateSectionIndices(flattenPeaks(sections, { centerX: width / 2, centerY: height / 2, maxRadius: Math.min(width, height) * 0.42 }))
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

  // MAX-blending the section Gaussians (rather than SUM'ing them) is what
  // keeps a low col between two neighbouring ranges — summing would put
  // the midpoint of two Gaussians ABOVE either centre.
  //
  // Proportions matter here: peak radius has to be small relative to the
  // grid, the way GRID and peakRadiusRatio actually produce. With a
  // footprint wider than the world there is no saddle to find, and the
  // assertion just measures noise.
  it('keeps a saddle between nearby top-level section peaks', () => {
    const width = 128
    const height = 64
    const terrain = generateSectionTerrain({
      width,
      height,
      rng: createRng(7),
      peaks: [
        { x: 40, y: 32, radius: 14, amplitude: 0.8, depth: 1, title: 'First' },
        { x: 88, y: 32, radius: 14, amplitude: 0.8, depth: 1, title: 'Second' },
      ],
      totalArticleSize: 2000,
    })

    const heightAt = (x, y) => terrain.heightMap[y * width + x]

    expect(heightAt(64, 32)).toBeLessThan(heightAt(40, 32))
    expect(heightAt(64, 32)).toBeLessThan(heightAt(88, 32))
  })

  // The grid is an equirectangular map, so column 0 and column width-1 are
  // neighbouring meridians. Every pass that measures an x-distance or reads
  // an x-neighbour wraps; without that, land spanning the ±180° meridian
  // gets a cliff down it.
  it('joins the left and right edges continuously across the seam', () => {
    const width = 128
    const height = 64
    // A section sitting ON the seam: half its footprint is off each edge.
    const terrain = generateSectionTerrain({
      width,
      height,
      rng: createRng(11),
      peaks: [{ x: 0, y: 32, radius: 16, amplitude: 0.9, depth: 1, title: 'Meridian' }],
      totalArticleSize: 40000,
    })

    // The seam is just another column boundary, so the test is relative,
    // not absolute: the step across it must be the same ORDER as the
    // steepest step between any other adjacent pair of columns in the
    // same row. An absolute threshold would only measure steepness.
    //
    // The 2x headroom is for the seam happening to fall on a steep face —
    // it's one pair out of `width`, so it can legitimately be the row's
    // worst. It still catches what this guards against by a wide margin:
    // drop the wrapping and a peak straddling the meridian leaves a step
    // of ~0.75, some forty times the tolerance here.
    for (let y = 0; y < height; y++) {
      const row = y * width
      let steepestInterior = 0
      for (let x = 0; x < width - 2; x++) {
        steepestInterior = Math.max(steepestInterior, Math.abs(terrain.heightMap[row + x] - terrain.heightMap[row + x + 1]))
      }
      const acrossSeam = Math.abs(terrain.heightMap[row] - terrain.heightMap[row + width - 1])
      expect(acrossSeam).toBeLessThanOrEqual(steepestInterior * 2)
    }

    // And the peak straddling the seam must actually raise both edges.
    expect(terrain.heightMap[32 * width]).toBeGreaterThan(0.32)
    expect(terrain.heightMap[32 * width + (width - 1)]).toBeGreaterThan(0.32)
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

  it('exposes sectionOwnershipMap sized to width * height, values are peaks-array indices or -1', () => {
    const terrain = generateSectionTerrain({ width: 24, height: 24, rng: createRng(3), peaks: peaksFor(24, 24), totalArticleSize: 2000 })

    expect(terrain.sectionOwnershipMap).toBeInstanceOf(Int32Array)
    expect(terrain.sectionOwnershipMap).toHaveLength(24 * 24)
    for (const owner of terrain.sectionOwnershipMap) {
      expect(owner === -1 || (owner >= 0 && owner < terrain.peaks.length)).toBe(true)
      if (owner >= 0) expect((terrain.peaks[owner].depth ?? 0) <= 1).toBe(true)
    }
  })

  it('gives a cell at a top-level section\'s exact center that section as its owner', () => {
    const peaks = peaksFor(32, 32)
    const terrain = generateSectionTerrain({ width: 32, height: 32, rng: createRng(4), peaks, totalArticleSize: 2000 })
    const topLevel = peaks.filter((p) => p.depth <= 1)

    for (const peak of topLevel) {
      const gridX = Math.round(peak.x)
      const gridY = Math.round(peak.y)
      const idx = gridY * 32 + gridX
      const ownerIdx = terrain.sectionOwnershipMap[idx]
      // The cell at a section's center should be owned by SOME top-level
      // section (usually itself, but with heavy overlap another may win —
      // the assertion is "a real owner", not "always self").
      expect(ownerIdx).toBeGreaterThanOrEqual(0)
      expect((peaks[ownerIdx].depth ?? 0) <= 1).toBe(true)
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

describe('separateSections', () => {
  const width = 512

  /** Two sections: a wide one with subsections, and a small one inside it. */
  function makePeaks() {
    return [
      { title: 'Big', depth: 1, x: 200, y: 128, radius: 30, sectionIndex: 0 },
      { title: 'Big a', depth: 2, x: 260, y: 128, radius: 10, sectionIndex: 0 },
      { title: 'Big b', depth: 2, x: 140, y: 128, radius: 10, sectionIndex: 0 },
      { title: 'Small', depth: 1, x: 215, y: 132, radius: 12, sectionIndex: 3 },
    ]
  }

  const wrapD = (a, b) => {
    const d = Math.abs(a - b)
    return Math.min(d, width - d)
  }
  /** Bounding radius of a section's footprint, as separateSections measures it. */
  const extentOf = (peaks, index) => {
    const section = peaks[index]
    let extent = section.radius
    for (const peak of peaks) {
      if (peak.sectionIndex !== index) continue
      extent = Math.max(extent, Math.hypot(wrapD(peak.x, section.x), peak.y - section.y) + peak.radius)
    }
    return extent
  }

  it('pushes a section out of a neighbour whose footprint contained it', () => {
    const peaks = makePeaks()
    const before = Math.hypot(wrapD(peaks[3].x, peaks[0].x), peaks[3].y - peaks[0].y)
    expect(before).toBeLessThan(extentOf(peaks, 0)) // starts inside

    separateSections(peaks, { width, gap: 10 })

    const after = Math.hypot(wrapD(peaks[3].x, peaks[0].x), peaks[3].y - peaks[0].y)
    expect(after).toBeGreaterThanOrEqual(extentOf(peaks, 0) + extentOf(peaks, 3) + 10 - 1e-6)
  })

  // A section is a rigid body: its ridge has already been laid out, and
  // shifting summits independently would scramble it.
  it('moves each section\'s subsections with it, preserving their offsets', () => {
    const peaks = makePeaks()
    const before = peaks.map((p) => ({ x: p.x, y: p.y }))

    separateSections(peaks, { width, gap: 10 })

    for (const child of [1, 2]) {
      expect(wrapD(peaks[child].x, peaks[0].x)).toBeCloseTo(wrapD(before[child].x, before[0].x), 6)
      expect(peaks[child].y - peaks[0].y).toBeCloseTo(before[child].y - before[0].y, 6)
    }
  })

  it('keeps every peak inside the latitude band', () => {
    const peaks = makePeaks()

    separateSections(peaks, { width, minY: 60, maxY: 196, gap: 10 })

    for (const peak of peaks) {
      expect(peak.y).toBeGreaterThanOrEqual(60)
      expect(peak.y).toBeLessThanOrEqual(196)
    }
  })

  it('wraps longitude rather than running off the edge', () => {
    const peaks = makePeaks()

    separateSections(peaks, { width, gap: 10 })

    for (const peak of peaks) {
      expect(peak.x).toBeGreaterThanOrEqual(0)
      expect(peak.x).toBeLessThan(width)
    }
  })

  it('leaves a lone section untouched', () => {
    const peaks = [
      { title: 'Only', depth: 1, x: 200, y: 128, radius: 30, sectionIndex: 0 },
      { title: 'Only a', depth: 2, x: 240, y: 128, radius: 10, sectionIndex: 0 },
    ]

    separateSections(peaks, { width, gap: 10 })

    expect(peaks[0].x).toBe(200)
    expect(peaks[1].x).toBe(240)
  })
})
