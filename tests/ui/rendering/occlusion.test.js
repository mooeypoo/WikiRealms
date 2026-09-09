import { describe, expect, it } from 'vitest'
import { SKY_SCAN, computeSkyVisibility } from '../../../src/ui/rendering/occlusion.js'

/**
 * A terrain of a given size where every cell is at `base`, and specific
 * cells can be raised. Heights are in [0, 1] like the real height map,
 * and the height scale supplies the units.
 */
function makeTerrain(width, height, base = 0, raised = []) {
  const heightMap = new Float64Array(width * height).fill(base)
  for (const [x, y, h] of raised) heightMap[y * width + x] = h
  return { width, height, heightMap }
}

/** Sky visibility at one cell, for readability at the call sites. */
function at(visibility, terrain, x, y) {
  return visibility[y * terrain.width + x]
}

describe('computeSkyVisibility', () => {
  it('sees the whole sky on a flat plain', () => {
    const terrain = makeTerrain(20, 20)
    const visibility = computeSkyVisibility(terrain, { heightScale: 60 })

    for (const value of visibility) expect(value).toBeCloseTo(1, 6)
  })

  it('returns one value per cell, always within [0, 1]', () => {
    const terrain = makeTerrain(24, 16, 0.3, [
      [6, 6, 1],
      [7, 6, 0.9],
      [12, 9, 0.05],
    ])
    const visibility = computeSkyVisibility(terrain, { heightScale: 60 })

    expect(visibility).toHaveLength(24 * 16)
    for (const value of visibility) {
      expect(value).toBeGreaterThan(0)
      expect(value).toBeLessThanOrEqual(1)
    }
  })

  it('loses about one bearing in eight to a wall on one side', () => {
    // A tall neighbour blocks the sky along its own bearing and nothing
    // else, so seven of eight slices stay open. That the remaining one
    // goes to nearly nothing is the closed form doing its job: a wall
    // one cell away and 60 units tall is a horizon at 89 degrees.
    const terrain = makeTerrain(20, 20, 0, [[11, 10, 1]])
    const visibility = computeSkyVisibility(terrain, { heightScale: 60 })

    expect(at(visibility, terrain, 10, 10)).toBeCloseTo(7 / 8, 2)
  })

  it('darkens a pit more than the rim around it', () => {
    // The case a directional light cannot express at all: the pit floor
    // and the plain outside it face the same way, so they take identical
    // half-Lambert shading and only this term tells them apart.
    // The grid is wide enough that the sampled plain is out of the
    // scan's reach entirely. A first version put it six diagonal cells
    // from a 36-unit wall and then asserted it saw the whole sky, which
    // the wall quite correctly denied it.
    const width = 60
    const centre = 30
    const raised = []
    for (let x = centre - 2; x <= centre + 2; x += 1) {
      for (let y = centre - 2; y <= centre + 2; y += 1) {
        // A ring wall one cell thick around a single low floor.
        const onRing = x === centre - 2 || x === centre + 2 || y === centre - 2 || y === centre + 2
        if (onRing) raised.push([x, y, 0.6])
      }
    }
    const terrain = makeTerrain(width, width, 0, raised)
    const visibility = computeSkyVisibility(terrain, { heightScale: 60 })

    const floor = at(visibility, terrain, centre, centre)
    const openPlain = at(visibility, terrain, 2, 2)

    expect(openPlain).toBeCloseTo(1, 6)
    expect(floor).toBeLessThan(openPlain)
    // And by a margin that will actually show: walled on all eight
    // bearings, the floor should lose most of its sky.
    expect(floor).toBeLessThan(0.5)
  })

  it('counts a diagonal step as root two cells, not one', () => {
    // The bug this exists to prevent: treating a diagonal step as one
    // cell reports its slope 41% too steep, so four of the eight
    // bearings over-occlude and every hillside comes out too dark along
    // the diagonals. The same wall further away must occlude LESS.
    const straight = computeSkyVisibility(makeTerrain(20, 20, 0, [[11, 10, 0.5]]), { heightScale: 60 })
    const diagonal = computeSkyVisibility(makeTerrain(20, 20, 0, [[11, 11, 0.5]]), { heightScale: 60 })
    const terrain = makeTerrain(20, 20)

    expect(at(diagonal, terrain, 10, 10)).toBeGreaterThan(at(straight, terrain, 10, 10))
  })

  it('scales with the projection, because the flat map really is steeper', () => {
    // The same height map is relief of about 67 units laid out flat and
    // about 12 on the globe. A single answer would be wrong on one of
    // them; the steeper layout has to come out more enclosed.
    const terrain = makeTerrain(20, 20, 0, [[11, 10, 0.5]])
    const steep = computeSkyVisibility(terrain, { heightScale: 67 })
    const shallow = computeSkyVisibility(terrain, { heightScale: 12 })

    expect(at(steep, terrain, 10, 10)).toBeLessThan(at(shallow, terrain, 10, 10))
  })

  it('lets the planet shadow itself across the antimeridian', () => {
    // The globe's grid meets itself at the last column, so a cliff on
    // column 0 is a neighbour of the final column. Without the wrap
    // there would be a seam of conspicuously brighter ground running
    // pole to pole down one line of longitude.
    const terrain = makeTerrain(20, 20, 0, [[0, 10, 1]])
    const wrapped = computeSkyVisibility(terrain, { heightScale: 60, wrapX: true })
    const unwrapped = computeSkyVisibility(terrain, { heightScale: 60, wrapX: false })

    expect(at(wrapped, terrain, 19, 10)).toBeLessThan(0.95)
    expect(at(unwrapped, terrain, 19, 10)).toBeCloseTo(1, 6)
  })

  it('lets distant terrain curve below the horizon on a globe', () => {
    // On a sphere the ground falls away as roughly d²/2R, so a ridge 20
    // cells off has dropped below the local tangent plane by more than
    // the globe's whole relief. Read flat, it would still be blocking
    // sky it has already curved under, and every basin would come out
    // uniformly dark.
    const terrain = makeTerrain(48, 20, 0, [[34, 10, 0.5]])
    const flat = computeSkyVisibility(terrain, { heightScale: 12 })
    const curved = computeSkyVisibility(terrain, { heightScale: 12, curvatureRadius: 20 })

    expect(at(curved, terrain, 14, 10)).toBeGreaterThan(at(flat, terrain, 14, 10))
    expect(at(curved, terrain, 14, 10)).toBeCloseTo(1, 3)
  })

  it('treats the poles as running out of terrain, not as a wall', () => {
    // A ray leaving the top row has nothing left to look at. Clamping to
    // the edge row instead would re-read the same height at every step
    // and, on any world whose top row is high, ring the poles with
    // darkness that no terrain accounts for.
    const terrain = makeTerrain(20, 20, 0, [[10, 0, 1]])
    const visibility = computeSkyVisibility(terrain, { heightScale: 60 })

    // The high cell itself sees everything; it is the top of the terrain.
    expect(at(visibility, terrain, 10, 0)).toBeCloseTo(1, 6)
    // Its neighbour along the top row is occluded only by the real cell
    // beside it, not by an invented column of them off the edge.
    expect(at(visibility, terrain, 11, 0)).toBeGreaterThan(0.8)
  })

  it('is unaffected by anything beyond the scan radius', () => {
    // Which is what makes the cost bounded, and what the step list is
    // chosen to trade against.
    const far = Math.max(...SKY_SCAN.steps) + 4
    const terrain = makeTerrain(60, 20, 0, [[10 + far, 10, 1]])
    const visibility = computeSkyVisibility(terrain, { heightScale: 60 })

    expect(at(visibility, terrain, 10, 10)).toBeCloseTo(1, 6)
  })

  it('is deterministic, like everything else a world is built from', () => {
    const terrain = makeTerrain(32, 24, 0.2, [
      [7, 7, 0.9],
      [8, 12, 0.55],
      [20, 5, 1],
    ])
    const options = { heightScale: 60, wrapX: true, curvatureRadius: 40 }

    expect(Array.from(computeSkyVisibility(terrain, options))).toEqual(
      Array.from(computeSkyVisibility(terrain, options)),
    )
  })
})

describe('SKY_SCAN', () => {
  it('samples eight bearings, so no slope darkens by direction alone', () => {
    // Fewer shows as streaking: a cell's darkness starts to depend
    // visibly on which handful of directions happened to be sampled.
    expect(SKY_SCAN.bearings).toBe(8)
  })

  it('lengthens its steps, which is what makes the reach affordable', () => {
    // Occlusion is dominated by what is close, so the near cells are
    // sampled every one and the far end coarsely. Nine samples reach 20
    // cells instead of twenty.
    const { steps } = SKY_SCAN
    for (let i = 1; i < steps.length; i += 1) {
      expect(steps[i]).toBeGreaterThan(steps[i - 1])
      expect(steps[i] - steps[i - 1]).toBeGreaterThanOrEqual(steps[i - 1] - (steps[i - 2] ?? 0) - 1)
    }
    expect(steps.length).toBeLessThan(Math.max(...steps))
  })
})
