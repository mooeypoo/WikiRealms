import { describe, expect, it } from 'vitest'
import {
  CANOPY_ARCHETYPES,
  CANOPY_BY_BAND,
  CANOPY_JITTER,
  FOLIAGE_DENSITY,
  FOLIAGE_SAMPLING,
  UNDERSTORY_BY_BAND,
  canopyInstanceTransform,
  cellFoliageRolls,
  computeFoliageDensityScale,
  foliageInstanceColor,
  pickCanopyVariant,
  pickUnderstoryVariant,
  resolveArchetypeForAltitude,
  shouldShowCanopy,
  apparentPixels,
  foliageDetailFraction,
  FOLIAGE_LOD,
} from '../../../src/ui/rendering/foliage.js'
import { FLAT_VIEW, SPHERE_VIEW } from '../../../src/ui/rendering/projection.js'
import { ALTITUDE } from '../../../src/engine/generation/config.js'
import { BIOME } from '../../../src/engine/generation/terrain.js'

describe('UNDERSTORY_BY_BAND', () => {
  it('covers the five vegetated bands and not the dunes', () => {
    const keys = Object.keys(UNDERSTORY_BY_BAND).map(Number)

    expect(keys.sort()).toEqual(
      [BIOME.STEPPE, BIOME.LIGHT_VEG, BIOME.MEADOW, BIOME.WOODLAND, BIOME.JUNGLE].sort(),
    )
  })

  it("each band's weights sum to approximately 1", () => {
    for (const variants of Object.values(UNDERSTORY_BY_BAND)) {
      expect(variants.reduce((sum, v) => sum + v.weight, 0)).toBeCloseTo(1, 2)
    }
  })

  it('sizes ground cover under one grid cell', () => {
    // Sizes are in grid cells now. The sprites this replaces were up to
    // 4.8 cells wide on a 4-cell sampling grid, so at any real density
    // the crowns fused into one mat and no two bands looked different.
    for (const variants of Object.values(UNDERSTORY_BY_BAND)) {
      for (const variant of variants) {
        expect(variant.size).toBeLessThanOrEqual(1)
        expect(variant.size).toBeGreaterThan(0)
      }
    }
  })

  it('every variant declares kind, color, size, density, weight', () => {
    for (const variants of Object.values(UNDERSTORY_BY_BAND)) {
      for (const v of variants) {
        expect(typeof v.kind).toBe('string')
        expect(typeof v.color).toBe('number')
        expect(typeof v.size).toBe('number')
        expect(typeof v.density).toBe('number')
        expect(typeof v.weight).toBe('number')
      }
    }
  })
})

describe('CANOPY_BY_BAND', () => {
  it('names only archetypes that exist', () => {
    for (const variants of Object.values(CANOPY_BY_BAND)) {
      for (const variant of variants) {
        expect(CANOPY_ARCHETYPES[variant.archetype]).toBeDefined()
      }
    }
  })

  it("each band's weights sum to approximately 1", () => {
    for (const variants of Object.values(CANOPY_BY_BAND)) {
      expect(variants.reduce((sum, v) => sum + v.weight, 0)).toBeCloseTo(1, 2)
    }
  })

  it('closes the canopy over the jungle and leaves the woodland open', () => {
    // This is what separates the top two bands now, in place of a 16-unit
    // hue difference in one dark green. Ground visible between trunks
    // versus no ground visible at all.
    const woodland = Math.max(...CANOPY_BY_BAND[BIOME.WOODLAND].map((v) => v.density))
    const jungle = Math.max(...CANOPY_BY_BAND[BIOME.JUNGLE].map((v) => v.density))

    expect(woodland).toBeLessThan(0.6)
    expect(jungle).toBeGreaterThan(0.8)
  })

  it('gives the jungle an emergent layer and the woodland none', () => {
    // The second separator, and the one that reads in silhouette: trees
    // breaking through the top of a closed canopy.
    const archetypes = (band) => CANOPY_BY_BAND[band].map((v) => v.archetype)

    expect(archetypes(BIOME.JUNGLE)).toContain('emergent')
    expect(archetypes(BIOME.WOODLAND)).not.toContain('emergent')
  })

  it('grows trees in the dry bands too, so three dry bands differ', () => {
    // Bare dunes, bare ground with shrubs, grass with shrubs.
    expect(CANOPY_BY_BAND[BIOME.DUNES]).toBeUndefined()
    expect(CANOPY_BY_BAND[BIOME.STEPPE].length).toBeGreaterThan(0)
    expect(CANOPY_BY_BAND[BIOME.LIGHT_VEG].length).toBeGreaterThan(0)
  })

  it('rises in occupancy with the band, so the ramp never inverts', () => {
    // Occupancy, not peak density: the chance a cell takes ANYTHING is
    // what a reader sees. Measured on the first cut of this table, meadow
    // came out at 0.102 against light vegetation's 0.13 — a better-cited
    // section growing less than a worse-cited one — because a meadow
    // honestly carries fewer shrubs than scrubland.
    const occupancy = (band) =>
      CANOPY_BY_BAND[band].reduce((sum, v) => sum + v.weight * v.density, 0)
    const bands = [BIOME.STEPPE, BIOME.LIGHT_VEG, BIOME.MEADOW, BIOME.WOODLAND, BIOME.JUNGLE]

    for (let i = 1; i < bands.length; i++) {
      expect(occupancy(bands[i])).toBeGreaterThan(occupancy(bands[i - 1]))
    }
  })

  it('rises in understory occupancy with the band too', () => {
    const occupancy = (band) =>
      UNDERSTORY_BY_BAND[band].reduce((sum, v) => sum + v.weight * v.density, 0)

    expect(occupancy(BIOME.LIGHT_VEG)).toBeGreaterThan(occupancy(BIOME.STEPPE))
    expect(occupancy(BIOME.MEADOW)).toBeGreaterThan(occupancy(BIOME.LIGHT_VEG))
    // Woodland and jungle floors sit UNDER a canopy, so they carry less
    // ground cover than open meadow does. That is the shade, not an
    // inversion of the signal — the trees above them more than make up
    // the difference, which the occupancy test above pins.
    expect(occupancy(BIOME.JUNGLE)).toBeGreaterThan(occupancy(BIOME.WOODLAND))
  })
})

describe('CANOPY_ARCHETYPES', () => {
  it('makes the emergent the tallest thing that grows', () => {
    const total = (name) => CANOPY_ARCHETYPES[name].trunkHeight + CANOPY_ARCHETYPES[name].crownHeight
    const others = Object.keys(CANOPY_ARCHETYPES).filter((name) => name !== 'emergent')

    for (const name of others) {
      expect(total('emergent')).toBeGreaterThan(total(name))
    }
  })

  it('makes the krummholz wider than it is tall', () => {
    // Wind-flattened, and that is the whole visual point of it.
    const k = CANOPY_ARCHETYPES.krummholz

    expect(k.crownRadius * 2).toBeGreaterThan(k.trunkHeight + k.crownHeight)
  })

  it('gives the conifer a spire and the broadleaf a mass', () => {
    expect(CANOPY_ARCHETYPES.conifer.crown).toBe('tiered')
    expect(CANOPY_ARCHETYPES.broadleaf.crown).toBe('round')
    // A conifer is taller and narrower than a broadleaf, or the two read
    // as the same tree. The narrowness is the binding one: tiers hold
    // more snow the wider the crown they are spread over, so this is the
    // constraint the tier count has to work around rather than a
    // preference — see the archetype's own note.
    expect(CANOPY_ARCHETYPES.conifer.crownHeight).toBeGreaterThan(CANOPY_ARCHETYPES.broadleaf.crownHeight)
    expect(CANOPY_ARCHETYPES.conifer.crownRadius).toBeLessThan(CANOPY_ARCHETYPES.broadleaf.crownRadius)
  })

  it('keeps every tree within a few grid cells', () => {
    for (const spec of Object.values(CANOPY_ARCHETYPES)) {
      expect(spec.trunkHeight + spec.crownHeight).toBeLessThan(5)
      expect(spec.crownRadius).toBeLessThan(1)
    }
  })
})

describe('pickUnderstoryVariant', () => {
  it('returns null for ground that grows nothing', () => {
    expect(pickUnderstoryVariant(BIOME.OCEAN, 0.5)).toBeNull()
    expect(pickUnderstoryVariant(BIOME.BEACH, 0.5)).toBeNull()
    expect(pickUnderstoryVariant(BIOME.SNOW, 0.5)).toBeNull()
    // A section that cites nothing gets bare ground, not sparse cover.
    expect(pickUnderstoryVariant(BIOME.DUNES, 0.5)).toBeNull()
  })

  it('returns the first variant when the roll falls below its weight', () => {
    expect(pickUnderstoryVariant(BIOME.MEADOW, 0.1).kind).toBe('grass')
  })

  it('returns a later variant when the roll exceeds earlier weights', () => {
    expect(pickUnderstoryVariant(BIOME.MEADOW, 0.95).kind).toBe('scrub')
  })

  it('never returns undefined at roll=1 (safety fallback)', () => {
    for (const band of Object.keys(UNDERSTORY_BY_BAND)) {
      expect(pickUnderstoryVariant(Number(band), 1 - 1e-9)).toBeTruthy()
    }
  })
})

describe('pickCanopyVariant', () => {
  it('returns null for ground that grows no trees', () => {
    expect(pickCanopyVariant(BIOME.OCEAN, 0.5)).toBeNull()
    expect(pickCanopyVariant(BIOME.DUNES, 0.5)).toBeNull()
    expect(pickCanopyVariant(BIOME.SNOW, 0.5)).toBeNull()
  })

  it('never returns undefined at roll=1 (safety fallback)', () => {
    for (const band of Object.keys(CANOPY_BY_BAND)) {
      expect(pickCanopyVariant(Number(band), 1 - 1e-9)).toBeTruthy()
    }
  })
})

describe('resolveArchetypeForAltitude', () => {
  it('leaves low ground alone', () => {
    expect(resolveArchetypeForAltitude('broadleaf', 0.4)).toBe('broadleaf')
  })

  it('turns broadleaf into conifer up the slope', () => {
    // Altitude reads as a change in KIND, not only as a thinning, so a
    // rocky slope carries alpine vegetation rather than a sparser copy
    // of the valley.
    expect(resolveArchetypeForAltitude('broadleaf', ALTITUDE.coniferStart)).toBe('conifer')
  })

  it('stunts everything to krummholz just under the treeline', () => {
    for (const archetype of Object.keys(CANOPY_ARCHETYPES)) {
      expect(resolveArchetypeForAltitude(archetype, ALTITUDE.krummholzStart)).toBe('krummholz')
    }
  })

  it('keeps the jungle’s emergent layer up to the krummholz line', () => {
    // Substituting it away would erase the woodland/jungle distinction on
    // exactly the high ground where the two are hardest to tell apart.
    expect(resolveArchetypeForAltitude('emergent', ALTITUDE.coniferStart)).toBe('emergent')
    expect(resolveArchetypeForAltitude('emergent', ALTITUDE.krummholzStart - 0.01)).toBe('emergent')
  })

  it('always names an archetype that exists', () => {
    for (const archetype of Object.keys(CANOPY_ARCHETYPES)) {
      for (let height = 0; height <= 1.0001; height += 0.05) {
        expect(CANOPY_ARCHETYPES[resolveArchetypeForAltitude(archetype, height)]).toBeDefined()
      }
    }
  })
})

describe('foliageInstanceColor', () => {
  it('returns channels in [0, 1]', () => {
    for (const roll of [0, 0.5, 0.999]) {
      for (const height of [0, 0.5, 1]) {
        const { r, g, b } = foliageInstanceColor(0x3f793f, height, roll)
        for (const channel of [r, g, b]) {
          expect(channel).toBeGreaterThanOrEqual(0)
          expect(channel).toBeLessThanOrEqual(1)
        }
      }
    }
  })

  it('varies brightness per instance, so a stand has depth', () => {
    const dark = foliageInstanceColor(0x3f793f, 0, 0)
    const bright = foliageInstanceColor(0x3f793f, 0, 0.999)

    expect(bright.g).toBeGreaterThan(dark.g)
  })

  it('dusts the trees white inside the snow band', () => {
    // What puts vegetation INSIDE the snow rather than stopping at its
    // edge: dark conifers going pale as they climb.
    const low = foliageInstanceColor(0x1f6937, 0.4, 0.5)
    const high = foliageInstanceColor(0x1f6937, 0.9, 0.5)
    const summit = foliageInstanceColor(0x1f6937, 1, 0.5)

    expect(high.r).toBeGreaterThan(low.r)
    expect(summit.r).toBeCloseTo(1)
    expect(summit.g).toBeCloseTo(1)
  })
})

describe('canopyInstanceTransform', () => {
  it('varies scale across the configured range', () => {
    expect(canopyInstanceTransform(0, 0, 0).scale).toBeCloseTo(CANOPY_JITTER.minScale)
    expect(canopyInstanceTransform(1, 0, 0).scale).toBeCloseTo(CANOPY_JITTER.maxScale)
  })

  it('spreads yaw over a full turn, so trees are not all aligned', () => {
    expect(canopyInstanceTransform(0, 0, 0).yaw).toBeCloseTo(0)
    expect(canopyInstanceTransform(0, 1, 0).yaw).toBeCloseTo(Math.PI * 2)
  })

  it('offsets a tree off the cell centre, so a wood is not an orchard', () => {
    const offsets = [0, 0.25, 0.5, 0.75].map((roll) => canopyInstanceTransform(0.7, 0, roll, 0.6))
    const distances = offsets.map((o) => Math.hypot(o.offsetX, o.offsetY))

    for (const distance of distances) {
      expect(distance).toBeGreaterThan(0)
      expect(distance).toBeLessThanOrEqual(CANOPY_JITTER.maxOffsetCells)
    }
    // Different rolls must point different ways, or every tree in a stand
    // shifts the same direction and the lattice survives.
    expect(new Set(offsets.map((o) => Math.round(o.offsetX * 1000))).size).toBeGreaterThan(1)
  })

  it('keeps the offset inside half the canopy stride', () => {
    // Sized against the SPACING between trees, not against one cell: at
    // a stride of 2 an offset of up to 1 fills the plane continuously,
    // and beyond that a tree crosses into the next sampled cell's
    // territory, which had its own chance to grow one.
    expect(CANOPY_JITTER.maxOffsetCells).toBeLessThanOrEqual(FOLIAGE_SAMPLING.canopyStride / 2)
    // And large enough to actually break the lattice. At 0.42 against a
    // stride of 2 the offset was a fifth of the spacing and the grid
    // showed straight through it.
    expect(CANOPY_JITTER.maxOffsetCells).toBeGreaterThan(FOLIAGE_SAMPLING.canopyStride / 4)
  })

  it('does not tie a tree’s offset to its size', () => {
    // The offset radius used to come from `scaleRoll`, so every small
    // tree sat near its cell centre and every large one at the rim.
    const small = canopyInstanceTransform(0, 0, 0.3, 0.9)
    const large = canopyInstanceTransform(1, 0, 0.3, 0.9)

    expect(Math.hypot(small.offsetX, small.offsetY)).toBeCloseTo(Math.hypot(large.offsetX, large.offsetY))
    expect(small.scale).not.toBeCloseTo(large.scale)
  })
})

describe('shouldShowCanopy', () => {
  it('always shows on the flat map, where the camera never gets far enough', () => {
    expect(shouldShowCanopy(9999, 0)).toBe(true)
    expect(shouldShowCanopy(9999, undefined)).toBe(true)
  })

  it('shows the canopy at the distance the planet view actually opens at', () => {
    // The bug this exists to prevent, which shipped: the gate was set to
    // 1.7 radii while the planet view opens at 3.2, so a world arrived
    // with no visible vegetation at all and only grew any if you zoomed
    // nearly to the surface. A threshold below the DEFAULT camera is not
    // a distance cull, it is an off switch.
    const radius = 81

    expect(shouldShowCanopy(radius * SPHERE_VIEW.cameraDistanceRatio, radius)).toBe(true)
    expect(shouldShowCanopy(radius * SPHERE_VIEW.minDistanceRatio, radius)).toBe(true)
  })

  it('still culls the canopy when the camera pulls right back', () => {
    // A tree is about 1.3 px at the furthest the controls allow, where it
    // contributes aliasing rather than texture.
    const radius = 81

    expect(shouldShowCanopy(radius * SPHERE_VIEW.maxDistanceRatio, radius)).toBe(false)
  })

  it('leaves room between the default view and the cull', () => {
    // Otherwise the canopy pops in and out on the smallest zoom nudge.
    expect(FOLIAGE_SAMPLING.canopyVisibleRadiusRatio).toBeGreaterThan(
      SPHERE_VIEW.cameraDistanceRatio * 1.25,
    )
    expect(FOLIAGE_SAMPLING.canopyVisibleRadiusRatio).toBeLessThan(SPHERE_VIEW.maxDistanceRatio)
  })
})

describe('apparentPixels', () => {
  it('reproduces the measurements FOLIAGE_SAMPLING was tuned against', () => {
    // Those figures were taken by hand at a 50-degree field of view on a
    // 900px viewport, and canopyVisibleRadiusRatio rests on them. If
    // this arithmetic disagrees with them, one of the two is wrong.
    //
    // They reproduce to a tenth of a pixel — but ONLY when the distance
    // is measured to the planet's surface rather than its centre, which
    // is how this function's contract came to say so. Measured to the
    // centre, the same three come out 3.3, 24.6 and 1.2, and a caller
    // making that mistake thins the vegetation hardest exactly where the
    // camera gets closest to it.
    const radius = 512 / (Math.PI * 2)
    const treeHeight = 2.15 * SPHERE_VIEW.foliageScale
    const at = (ratio) => apparentPixels(treeHeight, radius * (ratio - 1), 900, 50)

    expect(at(SPHERE_VIEW.cameraDistanceRatio)).toBeCloseTo(4.9, 1)
    expect(at(SPHERE_VIEW.minDistanceRatio)).toBeCloseTo(71.3, 0)
    expect(at(SPHERE_VIEW.maxDistanceRatio)).toBeCloseTo(1.3, 1)
  })

  it('halves when the camera doubles its distance', () => {
    expect(apparentPixels(2, 100, 900, 50)).toBeCloseTo(apparentPixels(2, 200, 900, 50) * 2, 6)
  })

  it('grows with the drawing buffer, not the CSS size', () => {
    // Which is why the caller passes the drawing buffer height: raising
    // the pixel ratio genuinely does make a plant bigger in pixels, and
    // so worth drawing from further away.
    expect(apparentPixels(2, 100, 1800, 50)).toBeCloseTo(apparentPixels(2, 100, 900, 50) * 2, 6)
  })

  it('does not divide by a camera sitting on the origin', () => {
    expect(apparentPixels(2, 0, 900, 50)).toBe(Infinity)
  })
})

describe('foliageDetailFraction', () => {
  it('draws everything while a plant is still worth drawing', () => {
    expect(foliageDetailFraction(FOLIAGE_LOD.fullDetailPixels)).toBe(1)
    expect(foliageDetailFraction(50)).toBe(1)
    expect(foliageDetailFraction(Infinity)).toBe(1)
  })

  it('holds plants-per-pixel constant as the camera retreats', () => {
    // The whole justification for the curve. Apparent size falls as 1/d
    // and the count of plants on screen does not fall at all, so plants
    // per pixel would grow as d^2 — a pixel covered by six blades of
    // grass shows the average of six blades, which is a flat colour one
    // blade could have drawn.
    //
    // Thinning by the SQUARE of apparent size is exactly the rate that
    // cancels it, so the layer costs the same per pixel at any distance.
    const half = FOLIAGE_LOD.fullDetailPixels / 2
    const quarter = FOLIAGE_LOD.fullDetailPixels / 4

    expect(foliageDetailFraction(half)).toBeCloseTo(0.25, 6)
    expect(foliageDetailFraction(quarter)).toBeCloseTo(0.0625, 6)
  })

  it('keeps a floor, so a layer thins rather than popping', () => {
    expect(foliageDetailFraction(0)).toBe(FOLIAGE_LOD.minFraction)
    expect(foliageDetailFraction(-5)).toBe(FOLIAGE_LOD.minFraction)
    expect(FOLIAGE_LOD.minFraction).toBeGreaterThan(0)
  })

  it("never exceeds the tier's own density", () => {
    // The two multiply: a low tier thins everywhere, and distance thins
    // it further. A tier ceiling that distance could climb back over
    // would make the low tier the more expensive one up close.
    expect(foliageDetailFraction(100, 0.45)).toBe(0.45)
    expect(foliageDetailFraction(FOLIAGE_LOD.fullDetailPixels, 0.45)).toBe(0.45)
    expect(foliageDetailFraction(Infinity, 0.45)).toBe(0.45)
    expect(foliageDetailFraction(FOLIAGE_LOD.fullDetailPixels / 2, 0.45)).toBeCloseTo(0.25, 6)
  })

  it('never increases as the camera pulls away', () => {
    let previous = Infinity
    for (let apparent = 40; apparent >= 0; apparent -= 0.25) {
      const fraction = foliageDetailFraction(apparent)
      expect(fraction).toBeLessThanOrEqual(previous)
      previous = fraction
    }
  })

  it('thins nothing at the camera a world opens in', () => {
    // The bug this exists to prevent, which was written before it was
    // caught: the threshold was set from a TREE's apparent size, about 5
    // px at either default camera, and then applied per layer using each
    // layer's own height. Grass is short — 2.1 px on the flat map, 2.3
    // on the planet — so ground cover was culled to 12% in the view
    // every reader arrives in, undoing the layer it was meant to
    // protect.
    //
    // The smallest thing that grows is the measure, not the largest.
    const radius = 512 / (Math.PI * 2)
    const shortestGrass = 1.15 * 0.6 * 0.9665 // grass form, steppe size, tilt
    const flat = apparentPixels(shortestGrass, 512 * FLAT_VIEW.cameraDistanceRatio, 1080, 50)
    const planet = apparentPixels(
      shortestGrass * SPHERE_VIEW.foliageScale,
      radius * (SPHERE_VIEW.cameraDistanceRatio - 1),
      1080,
      50,
    )

    expect(FOLIAGE_LOD.fullDetailPixels).toBeLessThan(Math.min(flat, planet))
    expect(foliageDetailFraction(flat)).toBe(1)
    expect(foliageDetailFraction(planet)).toBe(1)
  })

  it('still thins hard at the orbit the camera can reach', () => {
    // Which is the whole point: at the furthest zoom a grass clump is
    // under a pixel, and 3,890 of them is 67,000 triangles of shimmer.
    const radius = 512 / (Math.PI * 2)
    const grass = 1.15 * 0.75 * 0.9665 * SPHERE_VIEW.foliageScale
    const furthest = apparentPixels(grass, radius * (SPHERE_VIEW.maxDistanceRatio - 1), 1080, 50)

    expect(furthest).toBeLessThan(1)
    expect(foliageDetailFraction(furthest)).toBeLessThan(0.25)
  })

  it('stays under a pixel of shimmer, which is what the threshold means', () => {
    // Below about one pixel a triangle catches the raster grid
    // intermittently, and with MSAA on that is shimmer rather than
    // texture. The threshold is that point with a little margin, so it
    // has to sit near one pixel and not wander up into the range where
    // plants are plainly visible.
    expect(FOLIAGE_LOD.fullDetailPixels).toBeGreaterThan(1)
    expect(FOLIAGE_LOD.fullDetailPixels).toBeLessThan(2)
  })
})

describe('FOLIAGE_SAMPLING', () => {
  it('samples the understory at least as densely as the canopy', () => {
    // Grass wants to be continuous; a tree needs room for its crown.
    expect(FOLIAGE_SAMPLING.understoryStride).toBeLessThanOrEqual(FOLIAGE_SAMPLING.canopyStride)
  })

  it('samples far more finely than the one-in-sixteen it replaces', () => {
    // The old stride of 4 in both axes capped a whole world at one sprite
    // per 16 cells — measured at 100 to 718 sprites for an entire planet.
    expect(FOLIAGE_SAMPLING.canopyStride).toBeLessThan(4)
  })
})

describe('computeFoliageDensityScale', () => {
  it('leaves the biome default alone for a section at its article’s own rate', () => {
    // Lushness 0.5 means "cites like the rest of this article", and the
    // variant densities are already tuned for that, so the scale is 1.
    //
    // TRUE OF BOTH CURVES, which is the constraint that keeps them
    // comparable: each is symmetric about 1.0, so widening one does not
    // shift every band's tuned density under it.
    for (const curve of Object.values(FOLIAGE_DENSITY)) {
      expect(computeFoliageDensityScale(0.5, 0, curve)).toBeCloseTo(1)
    }
  })

  it('answers to lushness more steeply for trees than for grass', () => {
    // The reason there are two curves at all. Grass grows on anything
    // that is not desert; a wood is what a well-sourced section grows,
    // so the canopy has to separate a thin section from a thorough one
    // by more than the ground cover does.
    const spread = (curve) =>
      computeFoliageDensityScale(1, 0, curve) / computeFoliageDensityScale(0, 0, curve)

    expect(spread(FOLIAGE_DENSITY.canopy)).toBeGreaterThan(spread(FOLIAGE_DENSITY.understory) * 2)
  })

  it('thins foliage across the treeline instead of deleting it', () => {
    // Above the old rock threshold there were no variants at all, so a
    // quarter of every world's land was bare by construction.
    const low = computeFoliageDensityScale(0.5, 0.4)
    const middle = computeFoliageDensityScale(0.5, (ALTITUDE.treelineStart + ALTITUDE.treelineEnd) / 2)
    // The top of the band as this lushness lifts it, rather than a
    // height picked as "obviously high". 0.95 was that number, and it
    // stopped being above the treeline the moment the treeline moved.
    const high = computeFoliageDensityScale(
      0.5,
      ALTITUDE.treelineEnd + ALTITUDE.treelineLushnessLift * 0.5,
    )

    expect(middle).toBeLessThan(low)
    expect(middle).toBeGreaterThan(0)
    expect(high).toBe(0)
  })

  it('keeps a well-cited section planted higher than a barren one', () => {
    const height = ALTITUDE.treelineEnd - 0.03

    expect(computeFoliageDensityScale(1, height)).toBeGreaterThan(computeFoliageDensityScale(0.2, height))
  })

  it('is unchanged at ground level when no height is given', () => {
    // Callers with no height (2D view, tests) must not be silently
    // treated as standing on a summit.
    expect(computeFoliageDensityScale(0.7)).toBe(computeFoliageDensityScale(0.7, 0))
  })

  it('spans the configured floor and ceiling across the scalar at ground level', () => {
    for (const curve of Object.values(FOLIAGE_DENSITY)) {
      expect(computeFoliageDensityScale(0, 0, curve)).toBe(curve.min)
      expect(computeFoliageDensityScale(1, 0, curve)).toBe(curve.max)
    }
  })

  it('is monotone in lushness', () => {
    let previous = -1
    for (let lushness = 0; lushness <= 1.0001; lushness += 0.05) {
      const scale = computeFoliageDensityScale(lushness, 0)
      expect(scale).toBeGreaterThan(previous)
      previous = scale
    }
  })

  it('clamps a scalar outside [0, 1] rather than extrapolating', () => {
    for (const curve of Object.values(FOLIAGE_DENSITY)) {
      expect(computeFoliageDensityScale(-3, 0, curve)).toBe(curve.min)
      expect(computeFoliageDensityScale(9, 0, curve)).toBe(curve.max)
    }
  })

  it('treats a non-numeric or missing scalar as 0', () => {
    for (const curve of Object.values(FOLIAGE_DENSITY)) {
      expect(computeFoliageDensityScale('not-a-number', 0, curve)).toBe(curve.min)
      expect(computeFoliageDensityScale(undefined, 0, curve)).toBe(curve.min)
    }
  })
})

describe('cellFoliageRolls', () => {
  it('is deterministic for the same (gridX, gridY, seed)', () => {
    const a = cellFoliageRolls(10, 20, 42)
    const b = cellFoliageRolls(10, 20, 42)
    expect(a).toEqual(b)
  })

  it('yields values in [0, 1)', () => {
    for (let x = 0; x < 20; x++) {
      for (let y = 0; y < 20; y++) {
        const { variantRoll, densityRoll } = cellFoliageRolls(x, y, 1234)
        expect(variantRoll).toBeGreaterThanOrEqual(0)
        expect(variantRoll).toBeLessThan(1)
        expect(densityRoll).toBeGreaterThanOrEqual(0)
        expect(densityRoll).toBeLessThan(1)
      }
    }
  })

  it('changes when the seed changes', () => {
    const a = cellFoliageRolls(5, 5, 1)
    const b = cellFoliageRolls(5, 5, 2)
    expect(a).not.toEqual(b)
  })

  /**
   * The guard that was missing. The previous hash had no avalanche step,
   * so its high bits — which `densityRoll` reads — barely changed between
   * neighbouring cells, and trees arrived in solid stripes on a
   * ~29-column period. Every existing test passed: determinism held, the
   * range held, the seed still changed the output. None of them looked at
   * whether the field was actually NOISE.
   *
   * The bounds below are generous. Independent uniform rolls give a
   * neighbour |delta| of 1/3 and a standard deviation of 0.2887/sqrt(n)
   * across n-sample means; the failing implementation missed those by
   * factors of 10 and 5, so anything close is fine and a regression of
   * that kind cannot slip through.
   */
  it('draws a different value for neighbouring cells, in both axes', () => {
    const SIZE = 64
    let deltaX = 0
    let deltaY = 0
    let pairs = 0

    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE - 1; x++) {
        const here = cellFoliageRolls(x * 2, y * 2, 12345, 1).densityRoll
        deltaX += Math.abs(here - cellFoliageRolls((x + 1) * 2, y * 2, 12345, 1).densityRoll)
        deltaY += Math.abs(here - cellFoliageRolls(x * 2, (y + 1) * 2, 12345, 1).densityRoll)
        pairs += 1
      }
    }

    // 1/3 for independent uniforms. Measured at 0.097 and 0.033 before.
    expect(deltaX / pairs).toBeGreaterThan(0.25)
    expect(deltaY / pairs).toBeGreaterThan(0.25)
  })

  it('shows no row or column bias, so foliage does not stripe', () => {
    const SIZE = 64
    const rowMeans = []
    const colSums = new Array(SIZE).fill(0)

    for (let y = 0; y < SIZE; y++) {
      let rowSum = 0
      for (let x = 0; x < SIZE; x++) {
        const roll = cellFoliageRolls(x * 2, y * 2, 12345, 1).densityRoll
        rowSum += roll
        colSums[x] += roll
      }
      rowMeans.push(rowSum / SIZE)
    }

    const sd = (values) => {
      const mean = values.reduce((sum, v) => sum + v, 0) / values.length
      return Math.sqrt(values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length)
    }

    // 0.2887/sqrt(64) = 0.036 for independent rolls. The column figure
    // was 0.187 before, which is what the stripes were.
    expect(sd(rowMeans)).toBeLessThan(0.08)
    expect(sd(colSums.map((sum) => sum / SIZE))).toBeLessThan(0.08)
  })

  it('keeps every salt independent of every other', () => {
    // Each layer and each per-instance property takes its own salt. If
    // two agreed, every tree would stand in its own patch of grass.
    const SIZE = 40
    for (const [a, b] of [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
    ]) {
      let delta = 0
      let n = 0
      for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
          delta += Math.abs(
            cellFoliageRolls(x, y, 7, a).densityRoll - cellFoliageRolls(x, y, 7, b).densityRoll,
          )
          n += 1
        }
      }
      expect(delta / n, `salts ${a} and ${b}`).toBeGreaterThan(0.25)
    }
  })

  it('has weak correlation between the two rolls across a sample grid', () => {
    // Not a rigorous independence test, just guards against the two
    // being trivially the same value.
    let same = 0
    for (let x = 0; x < 30; x++) {
      for (let y = 0; y < 30; y++) {
        const { variantRoll, densityRoll } = cellFoliageRolls(x, y, 7)
        if (Math.abs(variantRoll - densityRoll) < 0.01) same++
      }
    }
    // With independent uniform-ish rolls we'd expect ~1% collisions in
    // this window (0.01 tolerance out of [0, 1]) ≈ 9 out of 900. Give
    // ourselves a generous ceiling.
    expect(same).toBeLessThan(50)
  })
})
