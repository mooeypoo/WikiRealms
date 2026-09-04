/**
 * Deterministic sunflower/phyllotaxis placement: given a count of items
 * (already sorted largest-first by the caller), returns center points
 * with the first item at the exact center and the rest spiraling
 * outward — giving "biggest in the middle, others spread around" without
 * any randomness or overlap-avoidance bookkeeping.
 *
 * Purely mathematical (golden angle spiral), so no RNG is involved and
 * no shared seed state is consumed by placement.
 */

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5)) // ~2.399963 radians

/** Shortest signed x-distance on a grid whose left and right edges meet. */
function wrapDelta(dx, width) {
  const wrapped = ((dx % width) + width) % width
  return wrapped > width / 2 ? wrapped - width : wrapped
}

/**
 * Pushes overlapping placements apart until each one's `extent` clears its
 * neighbours', or the iteration budget runs out.
 *
 * The spiral spaces sections evenly, which was right when every section
 * was a disc of roughly the same size. It stopped being right once a
 * section's footprint became the envelope of its subsections: a section
 * with thirteen of them is several times the radius of one with none, so
 * evenly-spaced centres leave the small sections sitting *inside* the big
 * one's boundary.
 *
 * Relaxation rather than a cleverer initial placement, because the
 * constraint is pairwise and the extents are only known after layout. It
 * degrades gracefully too: when the sections genuinely cannot all fit,
 * everything just ends up as spread as the room allows instead of failing.
 *
 * Deterministic — no RNG. Coincident placements separate along a
 * golden-angle direction chosen by index.
 *
 * @param {{ x: number, y: number, extent: number, bandExtent?: number }[]} placements
 *   `extent` is what must clear the neighbours; `bandExtent` (defaulting
 *   to it) is what must stay inside the latitude band — larger, because
 *   terrain spreads further than the marker drawn on it.
 * @param {{ width: number, minY?: number, maxY?: number, gap?: number, iterations?: number, strength?: number }} options
 *   `gap` is clear space required BETWEEN two extents; `minY`/`maxY` bound
 *   the safe latitude band, and each placement is kept inside it by its
 *   own extent rather than just by its centre. Longitude wraps instead.
 * @returns {{ x: number, y: number }[]} relaxed positions, in input order
 */
export function relaxPlacements(
  placements,
  { width, minY = -Infinity, maxY = Infinity, gap = 0, iterations = 120, strength = 0.55 },
) {
  const count = placements.length
  const xs = placements.map((p) => p.x)
  const ys = placements.map((p) => p.y)

  for (let iteration = 0; iteration < iterations; iteration++) {
    let moved = false

    for (let i = 0; i < count; i++) {
      for (let j = i + 1; j < count; j++) {
        const dx = wrapDelta(xs[j] - xs[i], width)
        const dy = ys[j] - ys[i]
        let distance = Math.hypot(dx, dy)
        const required = placements[i].extent + placements[j].extent + gap
        if (distance >= required) continue

        let unitX
        let unitY
        if (distance < 1e-6) {
          // Exactly coincident: pick a repeatable direction rather than
          // dividing by zero.
          const angle = i * GOLDEN_ANGLE
          unitX = Math.cos(angle)
          unitY = Math.sin(angle)
          distance = 1e-6
        } else {
          unitX = dx / distance
          unitY = dy / distance
        }

        // Split the correction between the pair so neither is privileged.
        const push = (required - distance) * 0.5 * strength
        xs[i] -= unitX * push
        ys[i] -= unitY * push
        xs[j] += unitX * push
        ys[j] += unitY * push
        moved = true
      }
    }

    // The band has to hold each placement's whole EXTENT, not just its
    // centre: clamping centres alone lets a wide section's footprint hang
    // out past the band — which here means land pushed into a polar cap.
    for (let i = 0; i < count; i++) {
      const reach = placements[i].bandExtent ?? placements[i].extent
      const low = minY + reach
      const high = maxY - reach
      // Too wide to fit the band at all: centre it and accept the overrun.
      ys[i] = low > high ? (minY + maxY) / 2 : Math.min(Math.max(ys[i], low), high)
    }
    if (!moved) break
  }

  return placements.map((_, i) => ({ x: ((xs[i] % width) + width) % width, y: ys[i] }))
}

/**
 * Lays subsections out along a wandering RIDGE PATH.
 *
 * A spiral gave every mountain range the same silhouette — a circular
 * cluster of summits. A clean arc was better but still read as drawn: one
 * curve, evenly spaced, obviously synthetic. A path that wanders left and
 * right does three things at once: it looks like geology, it gives
 * neighbouring summits more room to separate than a straight span of the
 * same length, and — because the landmass and the halo are both built
 * from this path — it makes the section's whole shape irregular.
 *
 * The wander is two out-of-phase harmonics rather than noise, so it stays
 * smooth and stays PURE: like the spiral, this consumes no RNG, so
 * placement never touches shared seed state.
 *
 * Ordering matches computeSpiralLayout's contract: index 0 — the largest,
 * since callers sort largest-first — sits at the middle of the ridge and
 * the rest alternate outward.
 *
 * @param {number} count number of subsections to place
 * @param {{
 *   centerX: number,
 *   centerY: number,
 *   halfLength: number,
 *   orientation?: number,
 *   wander?: number,
 *   phase?: number,
 *   samples?: number,
 *   minY?: number,
 *   maxY?: number,
 * }} bounds `wander` is lateral swing as a fraction of halfLength;
 *   `minY`/`maxY` clamp the spine into the safe latitude band, since a long
 *   north-south ridge would otherwise carry land over a pole.
 * @returns {{ x: number, y: number }[]} one position per index, index 0 at the ridge's centre
 */
export function computeRidgeLayout(
  count,
  { centerX, centerY, halfLength, orientation = 0, wander = 0, phase = 0, minY = -Infinity, maxY = Infinity },
) {
  const cos = Math.cos(orientation)
  const sin = Math.sin(orientation)

  const at = (t) => {
    const along = t * halfLength
    const across = lateralOffset(t, phase) * wander * halfLength
    return {
      x: centerX + along * cos - across * sin,
      y: Math.min(Math.max(centerY + along * sin + across * cos, minY), maxY),
    }
  }

  if (count <= 0) return []

  const positions = []
  const steps = Math.max(Math.ceil((count - 1) / 2), 1)
  for (let i = 0; i < count; i++) {
    // i = 0, 1, 2, 3 … → t = 0, -1, +1, -2 … (scaled into [-1, 1]).
    const rank = Math.ceil(i / 2)
    const side = i % 2 === 0 ? 1 : -1
    positions.push(at(count === 1 ? 0 : (side * rank) / steps))
  }

  return positions
}

/**
 * Lateral swing of the ridge at parameter t ∈ [-1, 1], normalized to
 * roughly [-1, 1]. Two incommensurate harmonics so the spine never
 * repeats into an obvious sine wave; the phase varies it per section.
 */
function lateralOffset(t, phase) {
  return 0.62 * Math.sin(2.1 * Math.PI * t + phase) + 0.38 * Math.sin(3.9 * Math.PI * t + phase * 1.7 + 1.1)
}

/**
 * @param {number} count number of positions to generate
 * @param {{ centerX: number, centerY: number, maxRadius: number, minRadius?: number, yScale?: number }} bounds
 *   `yScale` squashes the spiral vertically (1 = a circle). The grid is
 *   read as an equirectangular map by the planet view, so grid rows are
 *   latitude: an uncompressed spiral puts sections near the poles, where
 *   longitude is compressed by cos(latitude) and the landmass gets visibly
 *   pinched. Squashing placement — not peak RADII, which stay keyed to
 *   maxRadius — keeps the continents in the honest middle latitudes and
 *   leaves the poles as open ocean. On the flat map it reads as a
 *   broad equatorial landmass, which suits the 2:1 map.
 * @returns {{ x: number, y: number }[]} one position per index, index 0 at the center
 */
export function computeSpiralLayout(count, { centerX, centerY, maxRadius, minRadius = 0, yScale = 1 }) {
  if (count <= 0) return []

  const positions = []
  for (let i = 0; i < count; i++) {
    const radius = count === 1 ? minRadius : minRadius + (maxRadius - minRadius) * Math.sqrt(i / (count - 1))
    const angle = i * GOLDEN_ANGLE
    positions.push({
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle) * yScale,
    })
  }
  return positions
}
