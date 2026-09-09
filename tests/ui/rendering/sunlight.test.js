import { describe, expect, it } from 'vitest'
import { computeSunlight } from '../../../src/ui/rendering/sunlight.js'

/**
 * A terrain of a given size where every cell is at `base`, and specific
 * cells can be raised. Heights are in [0, 1] like the real height map,
 * and the height scale supplies the units. Same helper as the sky scan's
 * tests, for the same reason.
 */
function makeTerrain(width, height, base = 0, raised = []) {
  const heightMap = new Float64Array(width * height).fill(base)
  for (const [x, y, h] of raised) heightMap[y * width + x] = h
  return { width, height, heightMap }
}

/** Sunlight at one cell, for readability at the call sites. */
function at(sunlight, terrain, x, y) {
  return sunlight[y * terrain.width + x]
}

/** A wall down one column, so a shadow falls across rows. */
function withWall(width, height, column, wallHeight, base = 0.2) {
  const terrain = makeTerrain(width, height, base)
  for (let y = 0; y < height; y += 1) terrain.heightMap[y * width + column] = wallHeight
  return terrain
}

describe('computeSunlight', () => {
  it('lights a flat plain completely', () => {
    const terrain = makeTerrain(20, 20, 0.3)
    const sunlight = computeSunlight(terrain, {
      sunDirection: { x: 1, y: 0, z: 1 },
      heightScale: 60,
    })

    expect(sunlight).toHaveLength(400)
    for (const value of sunlight) expect(value).toBeCloseTo(1, 6)
  })

  it('returns one value per cell, always within [0, 1]', () => {
    const terrain = makeTerrain(24, 16, 0.3, [
      [6, 6, 1],
      [7, 6, 0.9],
      [12, 9, 0.05],
    ])
    const sunlight = computeSunlight(terrain, {
      sunDirection: { x: 1, y: -0.7, z: 1.4 },
      heightScale: 60,
    })

    expect(sunlight).toHaveLength(24 * 16)
    for (const value of sunlight) {
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(1)
    }
  })

  it('puts the shadow on the side away from the sun', () => {
    // The assertion that catches a sign error, which is the mistake this
    // whole conversion is prone to: a shadow pointing at the sun looks
    // deliberate enough to survive a glance.
    const terrain = withWall(40, 8, 20, 0.7)
    const sunlight = computeSunlight(terrain, {
      sunDirection: { x: 1, y: 0, z: 0.5 },
      heightScale: 20,
    })

    // The sun is toward +x, so the low ground at greater x is lit and
    // the low ground at smaller x is not.
    expect(at(sunlight, terrain, 24, 4)).toBeCloseTo(1, 6)
    expect(at(sunlight, terrain, 16, 4)).toBeCloseTo(0, 6)
    // The wall's own top is in full sun.
    expect(at(sunlight, terrain, 20, 4)).toBeCloseTo(1, 6)
  })

  it('casts a shadow as long as the occluder over the sun’s slope', () => {
    // Geometry, not taste: a wall standing `rise` above the ground with
    // the sun at `slope` shadows rise/slope cells behind it. Checked at
    // two slopes so the relationship is pinned, not just one point of it.
    const rise = 0.7 - 0.2
    for (const slope of [0.5, 0.25]) {
      const terrain = withWall(80, 8, 60, 0.7)
      const sunlight = computeSunlight(terrain, {
        sunDirection: { x: 1, y: 0, z: slope },
        heightScale: 20,
      })

      const expected = (rise * 20) / slope
      // Walk back from the wall to the last cell that is more dark than
      // lit; the softness puts the half-way point at the geometric edge.
      let reach = 0
      for (let d = 1; d < 60; d += 1) {
        if (at(sunlight, terrain, 60 - d, 4) < 0.5) reach = d
      }

      expect(reach).toBeGreaterThan(expected * 0.8)
      expect(reach).toBeLessThan(expected * 1.2)
    }
  })

  it('shortens the shadow as the sun climbs', () => {
    const lengths = [0.3, 0.6, 1.2, 2.4].map((slope) => {
      const terrain = withWall(80, 8, 60, 0.7)
      const sunlight = computeSunlight(terrain, {
        sunDirection: { x: 1, y: 0, z: slope },
        heightScale: 20,
      })
      let reach = 0
      for (let d = 1; d < 60; d += 1) if (at(sunlight, terrain, 60 - d, 4) < 0.5) reach = d
      return reach
    })

    for (let i = 1; i < lengths.length; i += 1) expect(lengths[i]).toBeLessThan(lengths[i - 1])
  })

  it('softens the edge instead of stepping from lit to dark', () => {
    // A hard threshold on a height field staircases along every shadow
    // edge, which is the artefact the shore was fixed for. See
    // SHADOW_SOFTNESS.
    const terrain = withWall(80, 8, 60, 0.7)
    const sunlight = computeSunlight(terrain, {
      sunDirection: { x: 1, y: 0, z: 0.5 },
      heightScale: 20,
    })

    const partial = []
    for (let d = 1; d < 60; d += 1) {
      const value = at(sunlight, terrain, 60 - d, 4)
      if (value > 0.02 && value < 0.98) partial.push(d)
    }

    expect(partial.length).toBeGreaterThanOrEqual(2)
  })

  it('leaves everything lit when the sun is straight overhead', () => {
    // A height field has no overhangs, so nothing can stand between a
    // surface and a light directly above it.
    const terrain = makeTerrain(20, 20, 0.2, [[10, 10, 1]])
    const sunlight = computeSunlight(terrain, {
      sunDirection: { x: 0, y: 0, z: 1 },
      heightScale: 60,
    })

    for (const value of sunlight) expect(value).toBeCloseTo(1, 6)
  })

  it('changes nothing when handed no direction at all', () => {
    const terrain = makeTerrain(12, 12, 0.2, [[6, 6, 1]])
    const sunlight = computeSunlight(terrain, {
      sunDirection: { x: 0, y: 0, z: 0 },
      heightScale: 60,
    })

    for (const value of sunlight) expect(value).toBe(1)
  })

  it('scales the shadow with the projection’s height scale', () => {
    // The same height map is genuinely five times steeper laid out flat
    // than wrapped on the globe, so it genuinely casts longer shadows.
    const reach = (heightScale) => {
      const terrain = withWall(80, 8, 60, 0.7)
      const sunlight = computeSunlight(terrain, { sunDirection: { x: 1, y: 0, z: 0.5 }, heightScale })
      let far = 0
      for (let d = 1; d < 60; d += 1) if (at(sunlight, terrain, 60 - d, 4) < 0.5) far = d
      return far
    }

    expect(reach(60)).toBeGreaterThan(reach(12) * 2)
  })

  it('does not let a shadow cross the flat map’s edge', () => {
    // The flat map ends; a ray that runs out of terrain has run out of
    // occluders, not met a cliff — and must not come back on the far
    // side either. The wall sits near the last column and the sun is
    // toward -x, so the only way it could reach column 0 is by wrapping.
    const width = 24
    const terrain = withWall(width, 8, width - 4, 0.9)
    const sunlight = computeSunlight(terrain, {
      sunDirection: { x: -1, y: 0, z: 0.4 },
      heightScale: 40,
    })

    // Just past the wall, away from the sun: shadowed, as ever.
    expect(at(sunlight, terrain, width - 2, 4)).toBeLessThan(0.5)
    // The first columns look toward -x, run off the map, and stay lit.
    expect(at(sunlight, terrain, 0, 4)).toBeCloseTo(1, 6)
    expect(at(sunlight, terrain, 1, 4)).toBeCloseTo(1, 6)
  })

  it('carries a shadow across the antimeridian on the globe', () => {
    // The planet's grid meets itself, so the columns past the last one
    // ARE the first ones. wrapX is what the mesh does, so it is what the
    // shadow has to do — the same arrangement as the flat test above,
    // where wrapping is the only way the wall is reachable.
    const width = 64
    const wall = width - 4
    const terrain = withWall(width, 32, wall, 0.9)
    const options = {
      // At longitude 0 the local frame is up +x, east +y, north +z, so
      // this is the sun low in the east: the bearing is due -east and
      // the shadow runs toward +x, off the end and round.
      sunDirection: { x: 0.3, y: -1, z: 0 },
      heightScale: 40,
      spherical: true,
      // Large enough that curvature is not what decides this; the
      // curvature case has its own test.
      curvatureRadius: 5000,
    }

    const wrapped = computeSunlight(terrain, { ...options, wrapX: true })
    const clipped = computeSunlight(terrain, { ...options, wrapX: false })
    const equator = 16

    expect(clipped[equator * width]).toBeCloseTo(1, 6)
    expect(wrapped[equator * width]).toBeLessThan(0.5)
  })

  it('lets the globe’s curvature drop a distant ridge below the sun', () => {
    // On a sphere the ground falls d²/2R away from the local tangent
    // plane, so a ridge far enough off has already curved out of the
    // way. Ignoring that would have distant terrain shadowing ground it
    // cannot reach, and basins would come out uniformly dark.
    //
    // At the globe's own proportions — relief about 12 units against a
    // radius about 80 — a ridge 30 cells off has dropped 5.6 units, and
    // a wall standing 8.4 above the plain has only 2.8 of that left. A
    // sun at slope 0.15 clears the second and not the first, so this is
    // the case where curvature alone decides.
    const width = 64
    const wall = width - 30
    const terrain = withWall(width, 32, wall, 0.9)
    const options = {
      // Low in the east at longitude 0: slope 0.15, bearing due -east.
      sunDirection: { x: 0.15, y: -1, z: 0 },
      heightScale: 12,
      spherical: true,
      wrapX: true,
    }
    const equator = 16

    const flatish = computeSunlight(terrain, { ...options, curvatureRadius: 100000 })
    const curved = computeSunlight(terrain, { ...options, curvatureRadius: 80 })

    // Fully shadowed without curvature, and most of the way back to
    // daylight with it. Not all the way: a sun this low sits close to
    // the softness band, so the curved reading lands inside its upper
    // half rather than clear of it. See SHADOW_SOFTNESS.
    expect(flatish[equator * width]).toBeLessThan(0.1)
    expect(curved[equator * width]).toBeGreaterThan(0.7)
  })

  it('puts the globe’s night side in the dark', () => {
    // Up is the radial on a sphere, so the sun is below the horizon for
    // half the cells and no scan is needed to know it. The half-Lambert
    // term renders the same terminator; this agrees with it.
    const width = 64
    const height = 32
    const terrain = makeTerrain(width, height, 0.3)
    const sunlight = computeSunlight(terrain, {
      // Local +x, so longitude 0 faces the sun and longitude 180 does not.
      sunDirection: { x: 1, y: 0, z: 0 },
      heightScale: 12,
      spherical: true,
      wrapX: true,
      curvatureRadius: 80,
    })

    const equator = Math.floor(height / 2)
    expect(at(sunlight, terrain, 0, equator)).toBeGreaterThan(0.5)
    expect(at(sunlight, terrain, width / 2, equator)).toBe(0)
  })

  it('crosses the globe’s terminator without a step', () => {
    // The half-Lambert term goes out of its way to keep the day/night
    // edge soft, and a hard cut at the moment the sun dips would draw a
    // line right through it. Walking the equator from noon to midnight,
    // no single cell may drop the sun by a large fraction.
    const width = 256
    const height = 64
    const terrain = makeTerrain(width, height, 0.3)
    const sunlight = computeSunlight(terrain, {
      sunDirection: { x: 1, y: 0, z: 0 },
      heightScale: 12,
      spherical: true,
      wrapX: true,
      curvatureRadius: 40,
    })

    const equator = height / 2
    let worstStep = 0
    for (let x = 1; x < width; x += 1) {
      const step = Math.abs(at(sunlight, terrain, x, equator) - at(sunlight, terrain, x - 1, equator))
      worstStep = Math.max(worstStep, step)
    }

    // A flat globe's terminator spans about 17° of longitude here, which
    // at this width is a dozen cells; nothing should jump a fifth.
    expect(worstStep).toBeLessThan(0.2)
    // And it really does get all the way to night and back to day.
    expect(at(sunlight, terrain, 0, equator)).toBeGreaterThan(0.9)
    expect(at(sunlight, terrain, width / 2, equator)).toBe(0)
  })

  it('reads half lit where the sun sits exactly on the horizon', () => {
    // Grazing light is half blocked by the ground's own roughness, which
    // is what the centred band says at a slope of zero. It is also what
    // makes the terminator continuous rather than a branch.
    const width = 64
    const height = 32
    const terrain = makeTerrain(width, height, 0.3)
    const sunlight = computeSunlight(terrain, {
      sunDirection: { x: 1, y: 0, z: 0 },
      heightScale: 12,
      spherical: true,
      wrapX: true,
      curvatureRadius: 100000,
    })

    // A quarter turn from the sub-solar point is the horizon exactly.
    expect(at(sunlight, terrain, width / 4, height / 2)).toBeCloseTo(0.5, 2)
  })

  it('lights both hemispheres when the sun is over the equator', () => {
    // The globe's sun is a fixed direction and the ground curves under
    // it, so latitude alone must not decide light: a cell at 45° north
    // and one at 45° south on the sunward meridian both see it.
    const width = 64
    const height = 33
    const terrain = makeTerrain(width, height, 0.3)
    const sunlight = computeSunlight(terrain, {
      sunDirection: { x: 1, y: 0, z: 0 },
      heightScale: 12,
      spherical: true,
      wrapX: true,
      curvatureRadius: 80,
    })

    const north = Math.round(height * 0.25)
    const south = Math.round(height * 0.75)
    expect(at(sunlight, terrain, 0, north)).toBeGreaterThan(0.5)
    expect(at(sunlight, terrain, 0, south)).toBeGreaterThan(0.5)
    expect(at(sunlight, terrain, 0, north)).toBeCloseTo(at(sunlight, terrain, 0, south), 3)
  })

  it('is deterministic', () => {
    const terrain = makeTerrain(32, 32, 0.3, [[10, 10, 0.9], [20, 14, 0.6]])
    const options = { sunDirection: { x: 60, y: -40, z: 120 }, heightScale: 66 }

    expect(Array.from(computeSunlight(terrain, options)))
      .toEqual(Array.from(computeSunlight(terrain, options)))
  })

  it('does not care how long the direction vector is', () => {
    const terrain = makeTerrain(32, 32, 0.3, [[10, 10, 0.9]])
    const short = computeSunlight(terrain, { sunDirection: { x: 3, y: -2, z: 6 }, heightScale: 66 })
    const long = computeSunlight(terrain, { sunDirection: { x: 300, y: -200, z: 600 }, heightScale: 66 })

    expect(Array.from(short)).toEqual(Array.from(long))
  })
})
