import { createNoise3D } from 'simplex-noise'
import { BIOME_THRESHOLDS, GRID, PEAK_LAYOUT, POLAR_CAPS, TERRAIN_DETAIL, WATER_LEVEL, TERRAIN_GENERATION } from './config.js'
import { BIOME, classifyBiome, sampleFractalNoiseWrapped } from './terrain.js'
import { annotatePeakLushness } from './lushness.js'
import { computeRidgeLayout, computeSpiralLayout, relaxPlacements } from './layout.js'

/**
 * The grid is an equirectangular map: column 0 and column width-1 are
 * adjacent meridians, not opposite ends of the world. Every pass that
 * measures an x-distance or reads an x-neighbour has to say so, or a
 * landmass spanning the seam gets a cliff down the ±180° line.
 *
 * Latitude does NOT wrap — the top and bottom rows are the poles, so y
 * stays clamped throughout.
 */
function wrapDeltaX(dx, width) {
  // Full modular reduction, not a single ±width nudge. The bounding-box
  // passes walk x from `peak.x - reach`, which for a wide peak is many
  // widths away from the grid, so a one-step adjustment leaves the
  // distance wrong by whole multiples of the world.
  const wrapped = ((dx % width) + width) % width
  return wrapped > width / 2 ? wrapped - width : wrapped
}

/** Wraps a column index into [0, width). */
function wrapColumn(x, width) {
  return ((x % width) + width) % width
}

/**
 * Bounds a peak's footprint into [minPeakRadius, maxPeakRadiusRatio x grid].
 * See PEAK_LAYOUT in config.js for why the upper bound exists.
 */
function clampPeakRadius(radius) {
  const maximum = Math.min(GRID.width, GRID.height) * PEAK_LAYOUT.maxPeakRadiusRatio
  return Math.min(Math.max(radius, PEAK_LAYOUT.minPeakRadius), maximum)
}

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
            const neighborY = y + offsetY
            if (neighborY < 0 || neighborY >= height) continue
            total += current[neighborY * width + wrapColumn(x + offsetX, width)]
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
      for (let x = 0; x < width; x++) {
        const idx = y * width + x
        const h = current[idx]

        // Find steepest downhill cardinal neighbor. East/west wrap around
        // the seam; north/south don't, hence the polar rows sitting out.
        let maxSlope = 0
        let steepestIdx = -1
        const neighborIndices = [
          y * width + wrapColumn(x + 1, width),
          y * width + wrapColumn(x - 1, width),
          idx + width,
          idx - width,
        ]
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
 * Raises a small, noise-bitten icecap around each pole, in place.
 *
 * The cap's radius is measured in grid ROWS from the pole, which on the
 * equirectangular grid is true angular distance regardless of longitude —
 * so the result is a genuine circular cap on the globe even though it
 * spans every column at the top and bottom rows.
 *
 * @returns {Uint8Array} 1 for every cell the cap raised
 */
function applyPolarCaps(heightMap, width, height, rng) {
  const mask = new Uint8Array(width * height)
  const reach = POLAR_CAPS.reachRows
  if (reach <= 0) return mask

  const capNoise = createNoise3D(rng)
  const params = {
    octaves: POLAR_CAPS.noiseOctaves,
    persistence: POLAR_CAPS.noisePersistence,
    scale: POLAR_CAPS.noiseScale,
  }
  const seaLevel = BIOME_THRESHOLDS.oceanMaxHeight

  for (let y = 0; y < height; y++) {
    const rowsFromPole = Math.min(y, height - 1 - y)
    if (rowsFromPole > reach) continue
    // 1 at the pole itself, 0 at the cap's nominal edge.
    const closeness = 1 - rowsFromPole / reach

    for (let x = 0; x < width; x++) {
      const idx = y * width + x
      // Noise eats into the disc so the shoreline is ragged rather than a
      // drawn circle; at the pole itself `closeness` is 1 and no amount of
      // roughness can punch a hole through the middle.
      const bite = (1 - sampleFractalNoiseWrapped(capNoise, x, y, width, params)) * POLAR_CAPS.roughness
      const shape = closeness - bite
      if (shape <= 0) continue

      const lifted = seaLevel + smoothstep(0, 1, shape) * POLAR_CAPS.peakLift
      if (lifted > heightMap[idx]) {
        heightMap[idx] = clamp01(lifted)
        mask[idx] = 1
      }
    }
  }
  return mask
}

/**
 * Builds the per-cell displacement field used to domain-warp the
 * continental base. Two independent noise channels give an x and a y
 * offset; sampling them on the cylinder (see sampleFractalNoiseWrapped)
 * keeps the warp — and therefore the coastline it bends — continuous
 * across the ±180° seam.
 *
 * Latitude is tapered toward the poles: a warp that pushed land poleward
 * would undo the latitude band that keeps the polar caps open ocean.
 *
 * @returns {{ warpX: Float64Array, warpY: Float64Array }}
 */
function buildWarpField(width, height, rng, continentConfig) {
  const cellCount = width * height
  const warpX = new Float64Array(cellCount)
  const warpY = new Float64Array(cellCount)
  const amplitude = continentConfig.warpAmplitude
  if (!amplitude) return { warpX, warpY }

  const noiseA = createNoise3D(rng)
  const noiseB = createNoise3D(rng)
  const params = {
    octaves: continentConfig.warpOctaves,
    persistence: continentConfig.warpPersistence,
    scale: continentConfig.warpScale,
  }

  for (let y = 0; y < height; y++) {
    // 1 at the equator, 0 at either pole.
    const poleTaper = Math.sin((y / Math.max(height - 1, 1)) * Math.PI)
    for (let x = 0; x < width; x++) {
      const idx = y * width + x
      warpX[idx] = (sampleFractalNoiseWrapped(noiseA, x, y, width, params) * 2 - 1) * amplitude
      warpY[idx] = (sampleFractalNoiseWrapped(noiseB, x, y, width, params) * 2 - 1) * amplitude * poleTaper
    }
  }
  return { warpX, warpY }
}

/**
 * Number of standard deviations out at which a Gaussian peak stops being
 * evaluated. At 4σ the remaining contribution is exp(-8) ≈ 3.4e-4 of the
 * peak's amplitude — several orders of magnitude below what survives
 * quantization into the Float32 vertex buffer, let alone what an eye can
 * see on a slope.
 *
 * This matters because passes 2 and 3 are O(cells × peaks): on a
 * 512 × 256 grid with a full subsection tree that's ~33M exp() calls if
 * every peak is tested against every cell. Bounding each peak to its own
 * 4σ box cuts that by well over an order of magnitude, which is what
 * keeps the 2:1 grid (needed for the planet view — see config.js GRID)
 * from costing anything.
 */
const GAUSSIAN_CUTOFF_SIGMAS = 4

/**
 * Angle step between successive top-level section axes. The golden angle
 * never repeats or lines up, so adjacent sections never end up with
 * parallel ranges (which would read as corduroy rather than geology).
 */
const ORIENTATION_STEP = Math.PI * (3 - Math.sqrt(5))

/**
 * Extra bounding-box slack for the continental pass, covering the largest
 * displacement the domain warp can apply to a sample point.
 */
const WARP_REACH_MARGIN = TERRAIN_GENERATION.continent.warpAmplitude * 1.5

/**
 * Writes max_i(amplitude_i * exp(-d²/(2σ_i²))) into `out` for every cell,
 * visiting each peak only within its own bounding box.
 *
 * Loop order is inverted relative to the naive version — peaks outside,
 * cells inside — so total work is the sum of the peaks' footprints rather
 * than the product of cells and peaks. The MAX blend is order-independent,
 * so the result is identical to testing every peak against every cell
 * (modulo the 4σ truncation above).
 *
 * @param {Float64Array} out per-cell accumulator, zero-initialized
 * @param {{ x: number, y: number, amplitude: number }[]} peaks
 * @param {number[]} sigmaSqValues per-peak 2σ² (the exp() denominator)
 * @param {number} width
 * @param {number} height
 */
function accumulateGaussianMax(out, peaks, axes, width, height) {
  for (let i = 0; i < peaks.length; i++) {
    const peak = peaks[i]
    const { alongSq, acrossSq, cos, sin } = axes[i]
    // alongSq/acrossSq hold 2σ², so σ = sqrt(x / 2). Reach uses the LONGER
    // axis, or an elongated peak would be clipped along its own spine.
    const reach = GAUSSIAN_CUTOFF_SIGMAS * Math.sqrt(Math.max(alongSq, acrossSq) / 2)
    // Columns are visited unwrapped and folded back with wrapColumn, so a
    // peak near the seam spills onto the far edge instead of being cut
    // off by it. Capped at `width` columns so a peak whose reach exceeds
    // half the world doesn't visit the same cell twice.
    const startX = Math.floor(peak.x - reach)
    const columnCount = Math.min(Math.ceil(2 * reach) + 1, width)
    const minY = Math.max(0, Math.floor(peak.y - reach))
    const maxY = Math.min(height - 1, Math.ceil(peak.y + reach))

    for (let y = minY; y <= maxY; y++) {
      const dy = y - peak.y
      const rowOffset = y * width
      for (let i = 0; i < columnCount; i++) {
        const x = startX + i
        const dx = wrapDeltaX(x - peak.x, width)
        // Rotate into the peak's own frame so the two sigmas stretch it
        // along its ridge axis rather than along the grid axes.
        const along = dx * cos + dy * sin
        const across = -dx * sin + dy * cos
        const contribution = peak.amplitude * Math.exp(-((along * along) / alongSq + (across * across) / acrossSq))
        const index = rowOffset + wrapColumn(x, width)
        if (contribution > out[index]) out[index] = contribution
      }
    }
  }
}

/**
 * Half-length of the ridge a section's subsections are strung along.
 *
 * Scales with the NUMBER of subsections, not just the parent's size: a
 * fixed span packs 13 summits into the same length as 2, at which point
 * neighbouring peaks sit closer than their own sigma and smear into one
 * ridge you can't read. The spacing floor keeps adjacent summits far
 * enough apart to stay individually legible.
 *
 * @param {number} parentRadius
 * @param {number} childCount
 */
function computeRidgeHalfLength(parentRadius, childCount) {
  const fromParent = parentRadius * PEAK_LAYOUT.ridgeHalfLengthRatio
  const fromSpacing = (PEAK_LAYOUT.ridgeMinSpacing * Math.max(childCount - 1, 0)) / 2
  return Math.max(fromParent, fromSpacing)
}

/**
 * Builds the per-peak elliptical Gaussian parameters used by every
 * shaping pass: 2σ² along and across the peak's own axis, plus the
 * rotation that gets there.
 *
 * Isotropic Gaussians are what made every landmass a disc. Stretching
 * each one along its ridge axis (and squeezing it across, so the
 * footprint's area is roughly preserved) turns those discs into
 * elongated masses that follow the mountain range they contain.
 *
 * @param {object[]} peaks each carrying its own `orientation` and `elongation`
 * @param {number} sigmaMultiplier σ as a multiple of the peak's radius
 */
function buildPeakAxes(peaks, sigmaMultiplier) {
  return peaks.map((peak) => {
    const sigma = peak.radius * sigmaMultiplier
    const elongation = peak.elongation ?? PEAK_LAYOUT.minSectionElongation
    const along = sigma * elongation
    const across = sigma / elongation
    const orientation = peak.orientation ?? 0
    return {
      alongSq: 2 * along * along,
      acrossSq: 2 * across * across,
      cos: Math.cos(orientation),
      sin: Math.sin(orientation),
    }
  })
}

/**
 * Continental-base variant of accumulateGaussianMax: as well as keeping
 * the strongest contribution per cell it records WHOSE it was, which is
 * what sectionOwnershipMap needs.
 *
 * Same inverted loop order and 4σ bounding box — worth keeping here even
 * though the naive version is simpler, because the base is now built from
 * every peak (sections and subsections), not just the handful of
 * top-level ones. Cell-by-cell that is an order of magnitude more work.
 *
 * @param {Float64Array} outValue per-cell strongest contribution
 * @param {Int32Array} outOwner per-cell owning peak index, pre-filled with -1
 * @param {number[]} owners owning top-level peak index per contributor
 * @param {Float64Array} warpX per-cell domain-warp displacement
 */
function accumulateGaussianArgMax(outValue, outOwner, peaks, axes, owners, warpX, warpY, width, height) {
  for (let i = 0; i < peaks.length; i++) {
    const peak = peaks[i]
    const axis = axes[i]
    const owner = owners[i]
    // Reach must allow for the warp displacing the sample point toward
    // this peak, or warped cells at the rim get clipped out of the box.
    const reach = GAUSSIAN_CUTOFF_SIGMAS * Math.sqrt(Math.max(axis.alongSq, axis.acrossSq) / 2) + WARP_REACH_MARGIN
    const startX = Math.floor(peak.x - reach)
    const columnCount = Math.min(Math.ceil(2 * reach) + 1, width)
    const minY = Math.max(0, Math.floor(peak.y - reach))
    const maxY = Math.min(height - 1, Math.ceil(peak.y + reach))

    for (let y = minY; y <= maxY; y++) {
      const rowOffset = y * width
      for (let c = 0; c < columnCount; c++) {
        const x = startX + c
        const index = rowOffset + wrapColumn(x, width)
        const dx = wrapDeltaX(x + warpX[index] - peak.x, width)
        const dy = y + warpY[index] - peak.y
        const along = dx * axis.cos + dy * axis.sin
        const across = -dx * axis.sin + dy * axis.cos
        const contribution = Math.exp(-((along * along) / axis.alongSq + (across * across) / axis.acrossSq))
        if (contribution > outValue[index]) {
          outValue[index] = contribution
          outOwner[index] = owner
        }
      }
    }
  }
}

/**
 * Recursively turns a (peak-limited) section tree into a flat list of
 * radial height bumps ("peaks") for a section and its direct subsections.
 * A section's subtree size controls the breadth of its mountain range;
 * its own prose controls the height of the base. Direct children form the
 * sharper summits that reveal the range's internal article structure.
 *
 * @param {object[]} nodes section tree nodes (title, subtreeSize, children, ...)
 * @param {{
 *   centerX: number,
 *   centerY: number,
 *   maxRadius: number,
 *   minRadius?: number,
 *   yScale?: number,
 *   peakRadiusScale?: number,
 * }} bounds `maxRadius`/`minRadius`/`yScale` govern where peaks are PLACED
 *   (see computeSpiralLayout); `peakRadiusScale` governs how big they
 *   GROW, and defaults to maxRadius when omitted.
 * @returns {{ x: number, y: number, radius: number, amplitude: number, title: string, anchor: string | null, depth: number, citationsPerSentence: number, subtreeCitationsPerSentence: number }[]}
 */
export function flattenPeaks(
  nodes,
  {
    centerX,
    centerY,
    maxRadius,
    minRadius = 0,
    yScale = 1,
    peakRadiusScale,
    ridgeOrientation = null,
    latitudeBand = null,
  },
) {
  if (!nodes || nodes.length === 0) return []

  // How far apart sections are SPREAD (maxRadius) and how big each one
  // GROWS (peakRadiusScale) are independent: the planet spreads sections
  // right around the globe, but a section's footprint is still sized
  // against the grid, not against how far its neighbours happen to sit.
  // Defaults to maxRadius, which is the coupled behavior subsection
  // layout still wants — children genuinely do scale with their parent.
  const radiusScale = peakRadiusScale ?? maxRadius
  const totalSubtreeSize = nodes.reduce((sum, node) => sum + node.subtreeSize, 0) || 1
  const totalOwnSize = nodes.reduce((sum, node) => sum + node.ownSize, 0) || 1

  // Top-level sections spiral across the world; subsections run along
  // their parent's ridge axis (ridgeOrientation is set only by the child
  // recursion below). That's what makes a range linear instead of a
  // circular cluster of summits.
  const positions =
    ridgeOrientation === null
      ? computeSpiralLayout(nodes.length, { centerX, centerY, maxRadius, minRadius, yScale })
      : computeRidgeLayout(nodes.length, {
          centerX,
          centerY,
          halfLength: maxRadius,
          orientation: ridgeOrientation,
          wander: PEAK_LAYOUT.ridgeWander,
          phase: ridgeOrientation * 3.1,
          minY: latitudeBand?.min ?? -Infinity,
          maxY: latitudeBand?.max ?? Infinity,
        })

  const peaks = []
  nodes.forEach((node, index) => {
    const breadthShare = node.subtreeSize / totalSubtreeSize
    const heightShare = node.ownSize / totalOwnSize
    const radius = clampPeakRadius(radiusScale * Math.sqrt(breadthShare))
    const minimumAmplitude = node.depth <= 1 ? PEAK_LAYOUT.minTopLevelAmplitude : PEAK_LAYOUT.minSubsectionAmplitude
    const nodeAmplitude = Math.max(Math.sqrt(heightShare), minimumAmplitude)
    const position = positions[index]

    // Every peak carries an axis. A top-level section derives its own from
    // its index (golden angle, so neighbours never end up parallel); its
    // subsections inherit it, so the ridge of summits and the elongated
    // landmass beneath them point the same way.
    const orientation = ridgeOrientation ?? index * ORIENTATION_STEP
    const ridgeHalfLength = computeRidgeHalfLength(radius, node.children.length)

    peaks.push({
      x: position.x,
      y: position.y,
      radius,
      amplitude: nodeAmplitude,
      orientation,
      // Baseline stretch of this peak's own Gaussian. Carried on the peak
      // so the halo's fallback ellipse matches the terrain blob under it;
      // a section's overall shape comes from its ridge, not from here.
      elongation: PEAK_LAYOUT.minSectionElongation,
      title: node.title,
      anchor: node.anchor ?? null,
      depth: node.depth,
      ownSize: node.ownSize ?? 0,
      subtreeSize: node.subtreeSize ?? node.ownSize ?? 0,
      ownCitationCount: node.citationCount ?? 0,
      citationCount: node.subtreeCitationCount ?? node.citationCount ?? 0,
      citationDensity: node.subtreeCitationDensity ?? node.citationDensity ?? 0,
      citationsPerSentence: node.citationsPerSentence ?? 0,
      subtreeCitationsPerSentence: node.subtreeCitationsPerSentence ?? 0,
      // Raw sentence counts, not just the ratios above: lushness shrinks a
      // section's rate toward the article's by a number of sentences, so
      // it needs the numerator and denominator separately. A ratio alone
      // cannot say whether it came from 1 sentence or 100.
      sentenceCount: node.sentenceCount ?? 0,
      subtreeSentenceCount: node.subtreeSentenceCount ?? node.sentenceCount ?? 0,
    })

    if (node.children.length > 0) {
      peaks.push(
        ...flattenPeaks(node.children, {
          centerX: position.x,
          centerY: position.y,
          // For a ridge this is the half-length of the spine, not a disc
          // radius, so it grows with the number of subsections.
          maxRadius: ridgeHalfLength,
          minRadius: radius * PEAK_LAYOUT.childInnerRadiusRatio,
          ridgeOrientation: orientation,
          // Footprint size must NOT follow the ridge length, or a section
          // with many subsections would inflate each of them; subsections
          // are still sized against their parent's own radius.
          peakRadiusScale: radius * PEAK_LAYOUT.childRadiusRatio,
          latitudeBand,
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
 * portals, halos, hover state, etc. Kept as a separate pass so
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
 * Spreads top-level sections apart so no section's footprint swallows
 * another's, moving each section and its subsections together.
 *
 * A section's footprint is the envelope of its subsections (that's what
 * the halo traces), so its size is driven by how many it has — and the
 * spiral that placed them knows nothing about that. Left alone, a
 * thirteen-subsection range simply contains its smaller neighbours.
 *
 * Extents here are measured from peak radii rather than the render
 * layer's marker radii, which are only ever smaller; `gap` covers that
 * difference plus the marker margin on both sides.
 *
 * Mutates `peaks` in place and returns it, for chaining.
 *
 * @param {object[]} peaks flattened peaks, already annotated with sectionIndex
 * @param {{ width: number, minY?: number, maxY?: number, gap?: number }} options
 */
export function separateSections(peaks, { width, minY = -Infinity, maxY = Infinity, gap = 0 }) {
  const members = new Map()
  for (let i = 0; i < peaks.length; i++) {
    const owner = (peaks[i].depth ?? 0) <= 1 ? i : peaks[i].sectionIndex
    if (owner === undefined || owner < 0) continue
    if (!members.has(owner)) members.set(owner, [])
    members.get(owner).push(i)
  }
  if (members.size < 2) return peaks

  const owners = [...members.keys()]
  const placements = owners.map((owner) => {
    const section = peaks[owner]
    // Bounding radius of the section's envelope: the farthest any of its
    // discs reaches from the summit the boundary is swept around.
    let extent = section.radius
    for (const index of members.get(owner)) {
      const peak = peaks[index]
      const dx = wrapDeltaX(peak.x - section.x, width)
      const dy = peak.y - section.y
      extent = Math.max(extent, Math.hypot(dx, dy) + peak.radius)
    }
    // Terrain reaches further than the marker: a peak's continental
    // Gaussian has sigma = radius x sigmaMultiplier x elongation, while
    // `extent` only counts the radius. The difference is what has to stay
    // inside the band, or a section clamped by its marker still pushes
    // land into a polar cap.
    const skirt = TERRAIN_GENERATION.continent.sigmaMultiplier * PEAK_LAYOUT.minSectionElongation - 1
    return { x: section.x, y: section.y, extent, bandExtent: extent + section.radius * Math.max(skirt, 0) }
  })

  const relaxed = relaxPlacements(placements, { width, minY, maxY, gap })

  for (let g = 0; g < owners.length; g++) {
    const section = peaks[owners[g]]
    const shiftX = wrapDeltaX(relaxed[g].x - section.x, width)
    const shiftY = relaxed[g].y - section.y
    if (shiftX === 0 && shiftY === 0) continue
    for (const index of members.get(owners[g])) {
      const peak = peaks[index]
      peak.x = ((peak.x + shiftX) % width + width) % width
      // Subsections move with their parent, so they need the same clamp —
      // a shifted ridge could otherwise poke back over a pole.
      peak.y = Math.min(Math.max(peak.y + shiftY, minY), maxY)
    }
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
 * through classifyBiome along with that section's lushness (lushness.js).
 *
 * @param {{ width: number, height: number, rng: () => number, peaks: object[], totalArticleSize: number, articleCitationRate?: number }} options
 * @returns {{ width: number, height: number, heightMap: Float64Array, lushnessMap: Float32Array, biomeMap: Uint8Array, sectionOwnershipMap: Int32Array, peaks: object[] }}
 */
export function generateSectionTerrain({ width, height, rng, peaks, totalArticleSize, articleCitationRate = 0 }) {
  const cellCount = width * height
  const waterLevelShift = computeWaterLevelShift(totalArticleSize)

  const sections = peaks.filter((p) => p.depth <= 1)
  const subsections = peaks.filter((p) => p.depth > 1)

  const cfg = TERRAIN_GENERATION
  const heightMap = new Float64Array(cellCount)
  // Per-cell peaks-array index of the section whose continental-base
  // Gaussian was strongest here. -1 for cells beyond any section's reach.
  const sectionOwnershipMap = new Int32Array(cellCount).fill(-1)

  // Precompute each peak's elliptical axes so the inner loops are a
  // single exp() per (cell × peak) with no per-cell reallocation.
  // Owner index is the peaks-array index of the TOP-LEVEL section, for
  // subsections as well as sections, so sectionOwnershipMap keeps meaning
  // "which section's territory is this" and hover still resolves to a
  // section rather than to one of its subsections.
  const baseContributors = []
  const baseOwners = []
  for (let i = 0; i < peaks.length; i++) {
    const peak = peaks[i]
    const isTopLevel = (peak.depth ?? 0) <= 1
    baseContributors.push(
      isTopLevel ? peak : { ...peak, radius: peak.radius * cfg.continent.subsectionRadiusRatio },
    )
    baseOwners.push(isTopLevel ? i : (peak.sectionIndex ?? -1))
  }

  const baseAxes = buildPeakAxes(baseContributors, cfg.continent.sigmaMultiplier)
  const rangeAxes = buildPeakAxes(sections, cfg.ranges.sigmaMultiplier)
  const peakAxes = buildPeakAxes(subsections, cfg.peaks.sigmaMultiplier)

  // === PASS 1: Continental base ===
  // MAX blend of very-wide Gaussians. MAX (not SUM) is what preserves
  // section identity — with SUM, the midpoint of two overlapping
  // Gaussians actually rises ABOVE either center (a mathematical
  // property of Gaussian summation), which would kill saddles. MAX
  // still gives a connected continent because Gaussians overlap at ~1.0
  // wherever peaks are within ~1σ of each other, so the "at least one
  // peak is nearby" region reads as one landmass.
  //
  // Subsections contribute to the base too, at their own (smaller) scale
  // and credited to their parent. That's what makes a landmass FOLLOW its
  // mountain range: a chain of overlapping Gaussians strung along the
  // wandering ridge sweeps out a capsule that bends with the spine,
  // instead of the range poking out of an ellipse that knows nothing
  // about it. It also guarantees every subsection summit sits on land.
  //
  // The sample point is displaced by a low-frequency noise field before
  // the Gaussians are evaluated ("domain warping"). Without it even an
  // elongated Gaussian has a mathematically smooth edge, and coastlines
  // read as inflated bumps; warping the domain bends those edges into
  // bays, headlands and isthmuses at no cost to where land broadly sits.
  const { warpX, warpY } = buildWarpField(width, height, rng, cfg.continent)

  const baseContribution = new Float64Array(cellCount)
  accumulateGaussianArgMax(
    baseContribution,
    sectionOwnershipMap,
    baseContributors,
    baseAxes,
    baseOwners,
    warpX,
    warpY,
    width,
    height,
  )
  for (let idx = 0; idx < cellCount; idx++) {
    heightMap[idx] = cfg.continent.softCeiling * baseContribution[idx]
  }

  // === PASS 2: Mountain ranges (gated by land) ===
  // MAX blend, not SUM: overlapping ranges must preserve saddles between
  // their summits, not fuse into a single plateau. SUM'ing here would
  // literally put the midpoint above both peaks.
  const rangeContribution = new Float64Array(cellCount)
  accumulateGaussianMax(rangeContribution, sections, rangeAxes, width, height)
  for (let idx = 0; idx < cellCount; idx++) {
    const base = heightMap[idx]
    const gate = smoothstep(cfg.ranges.landGateMin, cfg.ranges.landGateMin + cfg.ranges.landGateWidth, base)
    if (gate <= 0) continue
    heightMap[idx] = base + rangeContribution[idx] * cfg.ranges.heightMultiplier * gate
  }

  // === PASS 3: Subsection peaks (gated by range) ===
  // Also MAX — see PASS 2. Sub-peaks close together should each show as a
  // summit with a low col between, not additively pile up.
  const peakContribution = new Float64Array(cellCount)
  accumulateGaussianMax(peakContribution, subsections, peakAxes, width, height)
  for (let idx = 0; idx < cellCount; idx++) {
    const current = heightMap[idx]
    const gate = smoothstep(cfg.peaks.rangeGateMin, cfg.peaks.rangeGateMin + cfg.peaks.rangeGateWidth, current)
    if (gate <= 0) continue
    heightMap[idx] = current + peakContribution[idx] * cfg.peaks.heightMultiplier * gate
  }

  // === PASS 4: Fractal noise (land-gated) ===
  const heightNoise = createNoise3D(rng)
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
      const detail = sampleFractalNoiseWrapped(heightNoise, x, y, width, detailParams)
      heightMap[idx] = clamp01(current + (detail - 0.5) * cfg.noise.weight * gate)
    }
  }

  // === PASS 5: Water-level shift ===
  for (let i = 0; i < cellCount; i++) {
    heightMap[i] = clamp01(heightMap[i] + waterLevelShift)
  }

  // === PASS 5b: Polar icecaps ===
  // Raised after the water-level shift so a stub article's higher sea
  // level doesn't drown them. Returns the mask of cells it lifted, so the
  // biome pass can make them snow outright instead of running them
  // through the citation-driven land biomes — an icecap shouldn't turn
  // into meadow because the article happens to be well cited.
  const polarCapMask = applyPolarCaps(heightMap, width, height, rng)

  // === PASS 6: Pre-erosion smoothing ===
  let terrain = smoothHeightMap(heightMap, width, height, cfg.preErosionSmoothing.passes, cfg.preErosionSmoothing.strength)

  // === PASS 7: Thermal erosion ===
  if (cfg.erosion.iterations > 0) {
    terrain = thermalErosion(terrain, width, height, cfg.erosion.iterations, cfg.erosion.strength, cfg.erosion.slopeThreshold)
  }

  // === PASS 8: Post-erosion polish ===
  terrain = smoothHeightMap(terrain, width, height, cfg.postErosionSmoothing.passes, cfg.postErosionSmoothing.strength)

  // Biome pass: each land cell picks up its dominant section's lushness.
  //
  // lushnessMap is Float32, where the moistureMap it replaces was
  // Float64. The extra precision bought nothing — the values are a
  // normalized [0, 1] signal read by a renderer — and half the width
  // saves 512 KB per world at the current grid.
  annotatePeakLushness(peaks, articleCitationRate)

  const lushnessMap = new Float32Array(cellCount)
  const biomeMap = new Uint8Array(cellCount)
  for (let i = 0; i < cellCount; i++) {
    if (polarCapMask[i]) {
      // Icecaps belong to no section: leaving them owned would make
      // hovering one light up an unrelated continent's halo.
      sectionOwnershipMap[i] = -1
      lushnessMap[i] = 0
      biomeMap[i] = terrain[i] > BIOME_THRESHOLDS.oceanMaxHeight ? BIOME.SNOW : BIOME.OCEAN
      continue
    }

    const ownerIdx = sectionOwnershipMap[i]
    const lushness = ownerIdx >= 0 && ownerIdx < peaks.length ? peaks[ownerIdx].lushness ?? 0 : 0
    lushnessMap[i] = lushness
    biomeMap[i] = classifyBiome(terrain[i], lushness)
  }

  return { width, height, heightMap: terrain, lushnessMap, biomeMap, sectionOwnershipMap, peaks }
}
