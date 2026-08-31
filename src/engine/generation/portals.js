/**
 * Places outbound portals for an article's links onto the terrain grid.
 * Deterministic: the same links array and RNG sequence always produce the
 * same placements. Portals are article-local and outbound-only (see
 * docs/model.md) — return navigation is handled by traversal state, not
 * by generating a portal back.
 */

const MAX_PORTALS = 24

/**
 * @param {string[]} links outbound article titles/links
 * @param {() => number} rng seeded RNG (shared with terrain generation)
 * @param {{ width: number, height: number }} gridSize
 * @returns {{ portalId: string, targetArticleId: string, gridX: number, gridY: number, origin: 'article-link' }[]}
 */
export function generatePortals(links, rng, { width, height }) {
  const targets = (links ?? []).slice(0, MAX_PORTALS)
  const occupied = new Set()

  return targets.map((targetArticleId, index) => {
    let gridX
    let gridY
    let key

    do {
      gridX = Math.floor(rng() * width)
      gridY = Math.floor(rng() * height)
      key = `${gridX},${gridY}`
    } while (occupied.has(key) && occupied.size < width * height)

    occupied.add(key)

    return {
      portalId: `portal-${index}`,
      targetArticleId,
      gridX,
      gridY,
      origin: 'article-link',
    }
  })
}
