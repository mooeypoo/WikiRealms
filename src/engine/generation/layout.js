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

/**
 * @param {number} count number of positions to generate
 * @param {{ centerX: number, centerY: number, maxRadius: number }} bounds
 * @returns {{ x: number, y: number }[]} one position per index, index 0 at the center
 */
export function computeSpiralLayout(count, { centerX, centerY, maxRadius }) {
  if (count <= 0) return []

  const positions = []
  for (let i = 0; i < count; i++) {
    const radius = count === 1 ? 0 : maxRadius * Math.sqrt(i / (count - 1))
    const angle = i * GOLDEN_ANGLE
    positions.push({
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
    })
  }
  return positions
}
