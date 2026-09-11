/**
 * Place legend callout pins near world features without stacking them on
 * the markers — or on each other.
 *
 * The old layout put every pin just above its anchor. When a section summit
 * and a portal projected near each other (common on a tilted planet), the
 * two boxes sat on top of one another and hid both the labels and the
 * things they described.
 *
 * Preferred: float the card beside/above the marker, draw a leader back to
 * a ring on the feature, and nudge later cards until boxes no longer overlap.
 */

/**
 * @typedef {{ id: string, x: number, y: number }} LegendAnchor
 * @typedef {{
 *   id: string,
 *   anchor: { x: number, y: number },
 *   pin: { x: number, y: number },
 *   leader: { x1: number, y1: number, x2: number, y2: number },
 * }} PlacedLegendPin
 */

const DEFAULT_PIN = { width: 220, height: 64 }

/**
 * Candidate offsets from the anchor to the pin's top-left, tried in order.
 * First two favour left/right so two features naturally spread; above and
 * below cover edges of the screen.
 */
function candidateOffsets(index, pin, gap) {
  const halfW = pin.width / 2
  // Alternate starting side so the first pin prefers left, the second right.
  const primary = index % 2 === 0
    ? [
        { dx: -pin.width - gap, dy: -pin.height - gap }, // up-left
        { dx: gap, dy: -pin.height - gap }, // up-right
      ]
    : [
        { dx: gap, dy: -pin.height - gap }, // up-right
        { dx: -pin.width - gap, dy: -pin.height - gap }, // up-left
      ]

  return [
    ...primary,
    { dx: -halfW, dy: -pin.height - gap }, // above centre
    { dx: -pin.width - gap, dy: gap }, // down-left
    { dx: gap, dy: gap }, // down-right
    { dx: -halfW, dy: gap }, // below centre
    { dx: -pin.width - gap, dy: -pin.height / 2 }, // mid-left
    { dx: gap, dy: -pin.height / 2 }, // mid-right
  ]
}

function overlaps(a, b, separation) {
  return !(
    a.x + a.width + separation <= b.x ||
    b.x + b.width + separation <= a.x ||
    a.y + a.height + separation <= b.y ||
    b.y + b.height + separation <= a.y
  )
}

function clampPin(x, y, pin, viewport, reserves) {
  const maxX = Math.max(reserves.margin, viewport.width - pin.width - reserves.margin - reserves.right)
  const maxY = Math.max(reserves.margin, viewport.height - pin.height - reserves.margin - reserves.bottom)
  return {
    x: Math.min(Math.max(x, reserves.margin), maxX),
    y: Math.min(Math.max(y, reserves.margin), maxY),
  }
}

/**
 * Side of the pin the leader should leave from, toward the anchor.
 */
function leaderFromPin(pinBox, anchor) {
  const cx = pinBox.x + pinBox.width / 2
  const cy = pinBox.y + pinBox.height / 2
  const dx = anchor.x - cx
  const dy = anchor.y - cy

  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0
      ? { x: pinBox.x + pinBox.width, y: cy }
      : { x: pinBox.x, y: cy }
  }
  return dy > 0
    ? { x: cx, y: pinBox.y + pinBox.height }
    : { x: cx, y: pinBox.y }
}

/**
 * @param {{
 *   anchors: LegendAnchor[],
 *   viewport: { width: number, height: number },
 *   pin?: { width: number, height: number },
 *   gap?: number,
 *   separation?: number,
 *   margin?: number,
 *   rightReserve?: number,
 *   bottomReserve?: number,
 * }} options
 * @returns {PlacedLegendPin[]}
 */
export function placeLegendPins({
  anchors,
  viewport,
  pin = DEFAULT_PIN,
  gap = 28,
  separation = 14,
  margin = 12,
  rightReserve = 0,
  bottomReserve = 0,
}) {
  if (!anchors?.length || !viewport?.width || !viewport?.height) return []

  const reserves = {
    margin,
    right: rightReserve,
    bottom: bottomReserve,
  }
  const placed = []

  anchors.forEach((anchor, index) => {
    const offsets = candidateOffsets(index, pin, gap)
    let chosen = null

    for (const { dx, dy } of offsets) {
      const raw = { x: anchor.x + dx, y: anchor.y + dy }
      const clamped = clampPin(raw.x, raw.y, pin, viewport, reserves)
      const box = { ...clamped, width: pin.width, height: pin.height }
      const hits = placed.some((other) => overlaps(box, other.box, separation))
      if (!hits) {
        chosen = box
        break
      }
    }

    // Last resort: park it somewhere free by scanning downward from a
    // clamped above-centre candidate until it clears prior boxes.
    if (!chosen) {
      const start = clampPin(anchor.x - pin.width / 2, anchor.y - pin.height - gap, pin, viewport, reserves)
      let y = start.y
      for (let attempt = 0; attempt < 24; attempt += 1) {
        const box = { x: start.x, y, width: pin.width, height: pin.height }
        if (!placed.some((other) => overlaps(box, other.box, separation))) {
          chosen = box
          break
        }
        y = Math.min(y + pin.height + separation, viewport.height - pin.height - reserves.margin - reserves.bottom)
      }
      chosen = chosen ?? { ...start, width: pin.width, height: pin.height }
    }

    const from = leaderFromPin(chosen, anchor)
    placed.push({
      id: anchor.id,
      anchor: { x: anchor.x, y: anchor.y },
      pin: { x: chosen.x, y: chosen.y },
      box: chosen,
      leader: { x1: from.x, y1: from.y, x2: anchor.x, y2: anchor.y },
    })
  })

  return placed.map(({ id, anchor, pin: pinPos, leader }) => ({ id, anchor, pin: pinPos, leader }))
}

/**
 * How much of the viewport the side key panel occupies, so pins stay out of it.
 */
export function legendKeyReserves(viewport) {
  if (!viewport?.width || !viewport?.height) {
    return { rightReserve: 0, bottomReserve: 0 }
  }
  if (viewport.width < 768) {
    return {
      rightReserve: 0,
      bottomReserve: Math.min(viewport.height * 0.42, 320),
    }
  }
  return {
    rightReserve: Math.min(340, Math.max(0, viewport.width * 0.32)),
    bottomReserve: 0,
  }
}
