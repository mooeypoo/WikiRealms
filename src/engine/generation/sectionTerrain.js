import { createNoise2D } from 'simplex-noise'
import { PEAK_LAYOUT, TERRAIN_DETAIL, WATER_LEVEL, TERRAIN_GENERATION } from './config.js'
import { classifyBiomeWithSentenceAwareness, sampleFractalNoise } from './terrain.js'
import { computeSpiralLayout } from './layout.js'

function clamp01(value) {
  return Math.min(1, Math.max(0, value))
}

function smoothstep(edge0, edge1, x) {
  const t = clamp01((x - edge0) / Math.max(edge1 - edge0, 1e-6))
  return t * t * (3 - 2 * t)
}

/**
 * Proper Gaussian falloff at distance `dist` with standard deviation `sigma`.
 * Value = 1 at the center, drops smoothly to ~0.61 at dist=sigma, ~0.14 at
 * dist=2σ, ~0.01 at dist=3σ. This is the shape that gives connected
 * landmasses instead of pointy sticks.
 */
function gaussian(distSq, sigma) {
  return Math.exp(-distSq / (2 * sigma * sigma))
}

/**
 * Box-blur smoothing. Wider neighborhood + more passes = more geological
 * feel (fewer visible grid artifacts, smoother slopes).
 */
export function smoothHeightMap(heightMap, width, height, passes, strength) {
  let current = heightMap
  for (let pass = 0; pass < passes; pass++) {
    const next = new Float64Array(current.length)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let total = 0
        let count = 0
        for (let offsetY = -1; offsetY <= 1; offsetY++) {
          for (let offsetX = -1; offsetX <= 1; offsetX++) {
            const neighborX = x + offsetX
            const neighborY = y + offsetY
            if (neighborX < 0 || neighborX >= width || neighborY < 0 || neighborY >= height) continue
            total += current[neighborY * width + neighborX]
            count++
          }
        }
        const index = y * width + x
        next[index] = current[index] * (1 - strength) + (total / count) * strength
      }
    }
    current = next
  }
  return current
}

/**
 * Textbook thermal erosion (Musgrave et al.): each iteration transfers
 * a fraction of the excess slope from a cell to its steepest cardinal
 * neighbor. Over many iterations pointy summits get worn down into
 * rounded, weathered shapes — the visual difference vs. raw Gaussian
 * bumps. Cardinal-only neighbors keep the flow diagonal-free and
 * artifact-free.
 */
function thermalErosion(heightMap, width, height, iterations, strength, slopeThreshold) {
  let current = new Float64Array(heightMap)
  for (let iter = 0; iter < iterations; iter++) {
    const next = new Float64Array(current)
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x
        const h = current[idx]

        // Find steepest downhill cardinal neighbor.
        let maxSlope = 0
        let steepestIdx = -1
        const neighborIndices = [idx + 1, idx - 1, idx + width, idx - width]
        for (const nIdx of neighborIndices) {
          const slope = h - current[nIdx]
          if (slope > maxSlope) {
            maxSlope = slope
            steepestIdx = nIdx
          }
        }

        if (maxSlope > slopeThreshold && steepestIdx >= 0) {
          const transfer = (maxSlope - slopeThreshold) * strength
          next[idx] -= transfer
          next[steepestIdx] += transfer
        }
      }
    }
    current = next
  }
  return current
}

/**
 * Recursively turns a (peak-limited) section tree into a flat list of
 * radial height bumps ("peaks") for a section and its direct subsections.
 * A section's subtree size controls the breadth of its mountain range;
 * its own prose controls the height of the base. Direct children form the
 * sharper summits that reveal the range's internal article structure.
 *
 * @param {object[]} nodes section tree nodes (title, subtreeSize, children, ...)
 * @param {{ centerX: number, centerY: number, maxRadius: number, minRadius?: number }} bounds
 * @returns {{ x: number, y: number, radius: number, amplitude: number, title: string, depth: number, citationsPerSentence: number, subtreeCitationsPerSentence: number }[]}
 */
export function flattenPeaks(nodes, { centerX, centerY, maxRadius, minRadius = 0 }) {
  if (!nodes || nodes.length === 0) return []

  const totalSubtreeSize = nodes.reduce((sum, node) => sum + node.subtreeSize, 0) || 1
  const totalOwnSize = nodes.reduce((sum, node) => sum + node.ownSize, 0) || 1
  const positions = computeSpiralLayout(nodes.length, { centerX, centerY, maxRadius, minRadius })

  const peaks = []
  nodes.forEach((node, index) => {
    const breadthShare = node.subtreeSize / totalSubtreeSize
    const heightShare = node.ownSize / totalOwnSize
    const radius = Math.max(maxRadius * Math.sqrt(breadthShare), PEAK_LAYOUT.minPeakRadius)
    const minimumAmplitude = node.depth <= 1 ? PEAK_LAYOUT.minTopLevelAmplitude : PEAK_LAYOUT.minSubsectionAmplitude
    const nodeAmplitude = Math.max(Math.sqrt(heightShare), minimumAmplitude)
    const position = positions[index]

    peaks.push({
      x: position.x,
      y: position.y,
      radius,
      amplitude: nodeAmplitude,
      title: node.title,
      depth: node.depth,
      ownSize: node.ownSize ?? 0,
      subtreeSize: node.subtreeSize ?? node.ownSize ?? 0,
      ownCitationCount: node.citationCount ?? 0,
      citationCount: node.subtreeCitationCount ?? node.citationCount ?? 0,
      citationDensity: node.subtreeCitationDensity ?? node.citationDensity ?? 0,
      citationsPerSentence: node.citationsPerSentence ?? 0,
      subtreeCitationsPerSentence: node.subtreeCitationsPerSentence ?? 0,
    })

    if (node.children.length > 0) {
      peaks.push(
        ...flattenPeaks(node.children, {
          centerX: position.x,
          centerY: position.y,
          maxRadius: radius * PEAK_LAYOUT.childRadiusRatio,
          minRadius: radius * PEAK_LAYOUT.childInnerRadiusRatio,
        }),
      )
    }
  })

  return peaks
}

/**
 * Stamps every peak with the peaks-array index of its owning top-level
 * section — top-level peaks own themselves, subsection peaks inherit
 * their parent's index. Relies on flattenPeaks emitting a depth-first
 * order (parent immediately followed by its subtree).
 *
 * Enables O(1) "which section does this marker belong to" lookups for
 * portals, faeries, halos, hover state, etc. Kept as a separate pass so
 * flattenPeaks stays free of index-bookkeeping state.
 *
 * @param {object[]} peaks output of flattenPeaks (mutated in place)
 * @returns {object[]} the same peaks array, for chaining
 */
export function annotateSectionIndices(peaks) {
  let currentTopLevel = -1
  for (let i = 0; i < peaks.length; i++) {
    if ((peaks[i].depth ?? 0) <= 1) currentTopLevel = i
    peaks[i].sectionIndex = currentTopLevel
  }
  return peaks
}

/**
 * Derives a sea-level height shift from the article's total section text
 * size (see WATER_LEVEL in config.js): stub-like articles get a higher
 * effective sea level, long/detailed ones get a lower one.
 * @param {number} totalArticleSize
 */
function computeWaterLevelShift(totalArticleSize) {
  const sizeFactor = clamp01((totalArticleSize ?? 0) / WATER_LEVEL.articleSizeSoftCap)
  return (sizeFactor - 0.5) * WATER_LEVEL.maxShift
}

/**
 * Generates continental topography from a pre-flattened peak list.
 * Pipeline (see TERRAIN_GENERATION in config.js for tunables):
 *   1. Continental base — very wide overlapping Gaussians (σ ≈ 2× peak
 *      radius) summed and passed through 1 − exp(−sum) to soft-cap the
 *      total. This merges sections into ONE connected landmass instead
 *      of a scatter of islands.
 *   2. Mountain ranges — narrower Gaussians per section, gated so they
 *      only appear where the continental base is already land. Adds
 *      elevated regions on top of the base.
 *   3. Subsection peaks — even narrower Gaussians per subsection, gated
 *      so they only appear on top of a range. This is what stops the
 *      "floating pointy stick" artifact — a peak in the ocean is
 *      literally impossible because the gate is zero there.
 *   4. Fractal noise (land-gated) for natural surface detail.
 *   5. Water-level height shift from article size.
 *   6. Pre-erosion smoothing pass.
 *   7. Thermal erosion — the step that actually turns pointy summits
 *      into rounded, weathered shapes. Runs enough iterations to be
 *      visually obvious.
 *   8. Post-erosion smoothing polish.
 *
 * Each cell's biome uses the section whose continent contribution was
 * largest at that cell (tracked in sectionOwnershipMap during pass 1), fed
 * through classifyBiomeWithSentenceAwareness so under-cited articles
 * lean toward barren as a whole rather than by rank.
 *
 * Output shape (heightMap/moistureMap/biomeMap/peaks) is unchanged; the
 * 2D and 3D renderers do not need updating.
 *
 * @param {{ width: number, height: number, rng: () => number, peaks: object[], totalArticleSize: number }} options
 * @returns {{ width: number, height: number, heightMap: Float64Array, moistureMap: Float64Array, biomeMap: Uint8Array, sectionOwnershipMap: Int32Array, peaks: object[] }}
 */
export function generateSectionTerrain({ width, height, rng, peaks, totalArticleSize }) {
  const cellCount = width * height
  const waterLevelShift = computeWaterLevelShift(totalArticleSize)

  const sections = peaks.filter((p) => p.depth <= 1)
  const subsections = peaks.filter((p) => p.depth > 1)

  // Map filtered-sections index back to peaks-array index so
  // sectionOwnershipMap stores the SAME index space as peak.sectionIndex.
  const sectionPeakIndices = []
  for (let i = 0; i < peaks.length; i++) {
    if ((peaks[i].depth ?? 0) <= 1) sectionPeakIndices.push(i)
  }

  const cfg = TERRAIN_GENERATION
  const heightMap = new Float64Array(cellCount)
  // Per-cell peaks-array index of the section whose continental-base
  // Gaussian was strongest here. -1 for cells beyond any section's reach.
  const sectionOwnershipMap = new Int32Array(cellCount).fill(-1)

  // Precompute per-peak σ² (the /2σ² denominator) so the inner loop is a
  // single exp() call per (cell × peak) with no per-cell reallocation.
  const sectionSigmaSq = sections.map((s) => 2 * (s.radius * cfg.continent.sigmaMultiplier) ** 2)
  const rangeSigmaSq = sections.map((s) => 2 * (s.radius * cfg.ranges.sigmaMultiplier) ** 2)
  const peakSigmaSq = subsections.map((s) => 2 * (s.radius * cfg.peaks.sigmaMultiplier) ** 2)

  // === PASS 1: Continental base ===
  // MAX blend of very-wide Gaussians. MAX (not SUM) is what preserves
  // section identity — with SUM, the midpoint of two overlapping
  // Gaussians actually rises ABOVE either center (a mathematical
  // property of Gaussian summation), which would kill saddles. MAX
  // still gives a connected continent because Gaussians overlap at ~1.0
  // wherever peaks are within ~1σ of each other, so the "at least one
  // peak is nearby" region reads as one landmass.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x
      let maxContrib = 0
      let dominantIdx = -1
      for (let i = 0; i < sections.length; i++) {
        const dx = x - sections[i].x
        const dy = y - sections[i].y
        const contrib = Math.exp(-(dx * dx + dy * dy) / sectionSigmaSq[i])
        if (contrib > maxContrib) {
          maxContrib = contrib
          dominantIdx = i
        }
      }
      heightMap[idx] = cfg.continent.softCeiling * maxContrib
      sectionOwnershipMap[idx] = dominantIdx >= 0 ? sectionPeakIndices[dominantIdx] : -1
    }
  }

  // === PASS 2: Mountain ranges (gated by land) ===
  // MAX blend, not SUM: overlapping ranges must preserve saddles between
  // their summits, not fuse into a single plateau. SUM'ing here would
  // literally put the midpoint above both peaks.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x
      const base = heightMap[idx]
      const gate = smoothstep(cfg.ranges.landGateMin, cfg.ranges.landGateMin + cfg.ranges.landGateWidth, base)
      if (gate <= 0) continue

      let rangeMax = 0
      for (let i = 0; i < sections.length; i++) {
        const dx = x - sections[i].x
        const dy = y - sections[i].y
        const contrib = sections[i].amplitude * Math.exp(-(dx * dx + dy * dy) / rangeSigmaSq[i])
        if (contrib > rangeMax) rangeMax = contrib
      }
      heightMap[idx] = base + rangeMax * cfg.ranges.heightMultiplier * gate
    }
  }

  // === PASS 3: Subsection peaks (gated by range) ===
  // Also MAX — see PASS 2. Sub-peaks close together should each show as a
  // summit with a low col between, not additively pile up.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x
      const current = heightMap[idx]
      const gate = smoothstep(cfg.peaks.rangeGateMin, cfg.peaks.rangeGateMin + cfg.peaks.rangeGateWidth, current)
      if (gate <= 0) continue

      let peakMax = 0
      for (let i = 0; i < subsections.length; i++) {
        const dx = x - subsections[i].x
        const dy = y - subsections[i].y
        const contrib = subsections[i].amplitude * Math.exp(-(dx * dx + dy * dy) / peakSigmaSq[i])
        if (contrib > peakMax) peakMax = contrib
      }
      heightMap[idx] = current + peakMax * cfg.peaks.heightMultiplier * gate
    }
  }

  // === PASS 4: Fractal noise (land-gated) ===
  const heightNoise = createNoise2D(rng)
  const detailParams = {
    octaves: TERRAIN_DETAIL.noiseOctaves,
    persistence: TERRAIN_DETAIL.noisePersistence,
    scale: TERRAIN_DETAIL.noiseScale,
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x
      const current = heightMap[idx]
      const gate = smoothstep(cfg.noise.landGateMin, cfg.noise.landGateMin + cfg.noise.landGateWidth, current)
      if (gate <= 0) continue
      const detail = sampleFractalNoise(heightNoise, x, y, detailParams)
      heightMap[idx] = clamp01(current + (detail - 0.5) * cfg.noise.weight * gate)
    }
  }

  // === PASS 5: Water-level shift ===
  for (let i = 0; i < cellCount; i++) {
    heightMap[i] = clamp01(heightMap[i] + waterLevelShift)
  }

  // === PASS 6: Pre-erosion smoothing ===
  let terrain = smoothHeightMap(heightMap, width, height, cfg.preErosionSmoothing.passes, cfg.preErosionSmoothing.strength)

  // === PASS 7: Thermal erosion ===
  if (cfg.erosion.iterations > 0) {
    terrain = thermalErosion(terrain, width, height, cfg.erosion.iterations, cfg.erosion.strength, cfg.erosion.slopeThreshold)
  }

  // === PASS 8: Post-erosion polish ===
  terrain = smoothHeightMap(terrain, width, height, cfg.postErosionSmoothing.passes, cfg.postErosionSmoothing.strength)

  // Biome pass: each land cell picks up its dominant section's
  // citations-per-sentence for the sentence-aware classifier.
  const totalCitationsPerSentence = peaks.reduce((sum, p) => sum + (p.subtreeCitationsPerSentence ?? 0), 0)
  const averageCitationsPerSentence = totalCitationsPerSentence / Math.max(peaks.length, 1)

  const moistureMap = new Float64Array(cellCount)
  const biomeMap = new Uint8Array(cellCount)
  for (let i = 0; i < cellCount; i++) {
    const ownerIdx = sectionOwnershipMap[i]
    const cps = ownerIdx >= 0 && ownerIdx < peaks.length
      ? peaks[ownerIdx].subtreeCitationsPerSentence ?? 0
      : 0
    moistureMap[i] = cps
    biomeMap[i] = classifyBiomeWithSentenceAwareness(terrain[i], cps, averageCitationsPerSentence)
  }

  return { width, height, heightMap: terrain, moistureMap, biomeMap, sectionOwnershipMap, peaks }
}
