/**
 * What grows on a world, in two layers.
 *
 * The layers exist because the two jobs are different. Ground cover needs
 * COUNT — thousands of blades, no silhouette, no lighting — and
 * camera-facing point sprites are the cheapest possible way to get it.
 * The canopy needs FORM: a tree has to read as an object, take the
 * scene's light, and be recognisable in outline, and a flat billboard
 * cannot do any of that. So the understory stays sprites and the canopy
 * becomes instanced geometry.
 *
 * That split is the fix for the complaint this work started from — that
 * the "dense" and "lush" bands were indistinguishable. Measured, they had
 * only two channels between them: a hue difference of 16 units in one
 * dark green, and a count. Both rendered as the same smear, because both
 * were the same unlit blob at the same absurd size — a "tree" sprite was
 * 3.8 grid cells wide, placed every 4 cells, so at any real density the
 * crowns fused into a mat. They now differ by canopy CLOSURE and by an
 * emergent layer breaking through it, which reads at any distance and in
 * silhouette.
 *
 * Sizes here are in GRID CELLS, the unit projection.js promises carries
 * between the flat map and the planet: one cell is one world unit of arc
 * in both. The old values were world units chosen for the flat view
 * alone, and on the planet — where the same relief is compressed 5.4x —
 * a jungle crown came out at 40% of the planet's entire vertical relief.
 *
 * Free of three.js on purpose: the proportions and the picking are data
 * and arithmetic, unit-testable without a WebGL context. The component
 * turns an archetype's proportions into geometry.
 */
import { ALTITUDE } from '../../engine/generation/config.js'
import { BIOME, snowCover, treelineFactor } from '../../engine/generation/terrain.js'

/**
 * How densely the grid is sampled for each layer.
 *
 * The understory samples every cell and the canopy every second one, so a
 * tree has room for its crown while grass can be continuous. The old
 * single layer sampled every FOURTH cell in both axes, capping the whole
 * world at one sprite per 16 cells — measured at 100 to 718 sprites for
 * an entire planet of 26,000 land cells, about 2.5% ground cover at the
 * lushest. No density value could have exceeded that ceiling.
 */
export const FOLIAGE_SAMPLING = Object.freeze({
  understoryStride: 1,
  canopyStride: 2,
  // On the planet the canopy is hidden beyond this multiple of the
  // planet's radius, where a tree is too small to contribute anything but
  // aliasing.
  //
  // THIS HAS TO CLEAR THE DEFAULT CAMERA, and at 1.7 it did not: the
  // planet view opens at SPHERE_VIEW.cameraDistanceRatio, 3.2 radii out,
  // so the canopy was hidden the moment a world loaded and stayed hidden
  // unless you zoomed nearly all the way in. The planet looked like it
  // had no vegetation at all.
  //
  // Measured apparent height of a broadleaf, at a 50-degree field of view
  // on a 900px viewport:
  //
  //   planet, default (3.2R)   4.9 px      flat, default   4.5 px
  //   planet, closest (1.15R) 71.3 px
  //   planet, furthest (9R)    1.3 px
  //
  // The first two lines are the point: a tree is the SAME apparent size
  // on the planet as on the flat map at each view's own default. Nothing
  // about the globe made the canopy too small — it was gated off.
  //
  // 5 keeps it drawn through the default view and culls it only as the
  // camera pulls back past about 2.7 px per tree, where it stops being
  // texture and starts being noise.
  canopyVisibleRadiusRatio: 5,
})

/**
 * Ground cover, as camera-facing sprites. `size` is the sprite's width in
 * grid cells; `density` is the chance a sampled cell in this band takes
 * one, before the lushness and treeline scaling below.
 *
 * A band absent from this map has no ground cover: ocean, beach, the
 * polar-cap snow, and DUNES, which means the section cites nothing and
 * should read as bare ground rather than as sparse cover.
 *
 * HOW MUCH GROUND EACH BAND COVERS — weight x density, summed:
 *
 *   steppe 0.09   light 0.33   meadow 0.54   woodland 0.45   jungle 0.70
 *
 * The green three were raised together, from 0.42 / 0.30 / 0.40. A
 * jungle floor at 0.40 was the tell: the same ground cover as a meadow,
 * on the band that is supposed to be impenetrable. These are chances per
 * SAMPLED CELL and the understory stride is 1, so 0.70 means seven cells
 * in ten carry a clump — dense enough to read as a mat rather than as
 * dots, which is what the band names promise.
 *
 * Woodland dips below meadow on purpose, and is the one place the
 * sequence does not climb. A closed canopy shades its own floor; an open
 * meadow is grass all the way across. What the dip must not do is fall
 * below LIGHT_VEG, which would put more cover on scrubland than in a
 * wood.
 */
export const UNDERSTORY_BY_BAND = Object.freeze({
  [BIOME.STEPPE]: [
    { kind: 'scrub', color: 0x9a7d42, size: 0.7, density: 0.1, weight: 0.8 },
    { kind: 'grass', color: 0xb5a05c, size: 0.6, density: 0.05, weight: 0.2 }, // bleached, dead
  ],
  [BIOME.LIGHT_VEG]: [
    { kind: 'grass', color: 0xa7c86b, size: 0.75, density: 0.38, weight: 0.85 },
    { kind: 'grass', color: 0xe5c04d, size: 0.7, density: 0.06, weight: 0.15 },
  ],
  [BIOME.MEADOW]: [
    { kind: 'grass', color: 0x75ba55, size: 0.85, density: 0.72, weight: 0.72 },
    { kind: 'grass', color: 0xd66b6b, size: 0.8, density: 0.08, weight: 0.13 }, // wildflower
    { kind: 'scrub', color: 0x8e9f6a, size: 0.9, density: 0.1, weight: 0.15 },
  ],
  [BIOME.WOODLAND]: [
    { kind: 'fern', color: 0x4c8348, size: 0.9, density: 0.52, weight: 0.78 },
    { kind: 'grass', color: 0x6ba85a, size: 0.8, density: 0.22, weight: 0.22 },
  ],
  [BIOME.JUNGLE]: [
    { kind: 'fern', color: 0x2f7a45, size: 1.0, density: 0.8, weight: 0.85 },
    { kind: 'grass', color: 0xe5be3f, size: 0.85, density: 0.1, weight: 0.15 },
  ],
})

/**
 * Ground-cover shapes, as proportions of a variant's own `size`.
 *
 * WHY THESE EXIST
 *
 * The understory used to be point sprites wearing a canvas texture: a
 * tuft of blades, a low bush, a fan of fronds, drawn in 2D. Sprites are
 * screen-aligned on every axis, so tilting the camera down laid the
 * grass flat on the ground, `gl_PointSize` is driver-capped so it
 * stopped growing when you zoomed in, and a point is one vertex, so it
 * could not bend and therefore could not take the wind.
 *
 * These describe the same three silhouettes as real geometry. Each is a
 * CLUMP of a few tapered blades rather than one blade: a single strip
 * per instance would leave the ground barer than the sprite it replaced,
 * because a sprite covered its whole `size` in width.
 *
 * All figures multiply the variant's `size`, so a bleached steppe grass
 * at 0.6 and a jungle fern at 1.0 keep their relative stature.
 *
 * `segments` is the only cost knob here. It is what lets a blade CURVE
 * under the wind rather than pivot as a rigid spike, since the shader
 * weights its bend by height, and it multiplies the triangle count
 * directly: blades x segments x 2.
 *
 * The three shapes are told apart by their PROPORTIONS, since they share
 * one primitive. Measured across a clump's own `size`, with the sprite
 * they replace being a disc exactly `size` wide:
 *
 *   grass   0.85 wide, 1.10 tall   upright, narrow, barely curled
 *   scrub   0.95 wide, 0.48 tall   low and splayed, nearly stiff
 *   fern    1.00 wide, 0.78 tall   a wide fan of drooping fronds
 *
 * Lean, arch and spread all push a blade outward AND rob it of height,
 * so those figures are not independent — see understoryHeight in
 * bladeGeometry.js, and the geometry test that measures them.
 */
export const UNDERSTORY_FORMS = Object.freeze({
  // Five blades rather than three, and one segment fewer to pay for
  // them. Three narrow blades read as a bird's foot rather than a tuft,
  // and the arch here is slight enough that the extra segment was buying
  // very little curve — where a blade count buys coverage, which is the
  // whole job of this layer.
  grass: Object.freeze({
    blades: 5,
    segments: 2,
    height: 1.15,
    width: 0.15,
    // Outward tilt of a blade from vertical, in radians. Together with
    // spread this sets how much ground the clump covers — the sprite
    // this replaces was `size` across, and a narrow bunch of verticals
    // would read as the whole layer thinning out.
    lean: 0.14,
    // How far the tip curls over beyond the lean, as a fraction of
    // height. Grass arches a little; a perfectly straight blade reads
    // as wire.
    arch: 0.17,
    // Radius of the base ring the blades rise from, so a clump has a
    // footprint instead of every blade meeting at one point.
    spread: 0.09,
  }),
  // Three overlapping domes in the sprite. Low, splayed and stiff: the
  // arch stays small so it reads as woody rather than as long grass.
  scrub: Object.freeze({
    blades: 5,
    segments: 2,
    height: 0.62,
    width: 0.26,
    lean: 0.5,
    arch: 0.13,
    spread: 0.13,
  }),
  // A fan of fronds from a common base. Four of them, wider and more
  // curled than a grass blade and on a shorter stem — drooping is what
  // distinguishes it at a glance, which is the only job this layer has.
  fern: Object.freeze({
    blades: 4,
    segments: 3,
    height: 0.95,
    width: 0.26,
    lean: 0.35,
    arch: 0.36,
    spread: 0.06,
  }),
})

/**
 * Per-instance jitter for ground cover.
 *
 * Separate from CANOPY_JITTER for one concrete reason: `maxOffsetCells`
 * is sized against its layer's STRIDE, and the understory samples every
 * cell where the canopy samples every second one. Half a stride is the
 * ceiling in both cases — past that an instance wanders into a cell
 * that already had its own chance to grow something — so the canopy's
 * 0.95 is exactly twice what ground cover can take.
 */
export const UNDERSTORY_JITTER = Object.freeze({
  minScale: 0.72,
  maxScale: 1.3,
  maxOffsetCells: 0.5,
  minTint: 0.82,
  maxTint: 1.18,
})

/**
 * Rare per-instance hue accents for ground cover.
 *
 * WHY NOT MORE UNDERSTORY_BY_BAND ROWS
 *
 * Each distinct variant object becomes another InstancedMesh — another
 * draw call. Accents reuse the existing grass/fern layers and only rewrite
 * a few instance colours, so meadows sparkle without paying for mesh count.
 *
 * `chance` is the fraction of eligible clumps that get an accent. The
 * tint roll already drives brightness; the high end of that same roll
 * picks the accent so placement stays one salt.
 */
export const UNDERSTORY_ACCENTS = Object.freeze({
  chance: 0.08,
  // Warm flower, soft blossom, cooler lime — packed 0xRRGGBB.
  flower: 0xd66b6b,
  blossom: 0xe8b4c8,
  lime: 0x6bbf5a,
})

/**
 * Tree shapes, in grid cells. Proportions rather than meshes: the
 * component builds geometry from these, so the shapes stay tunable and
 * testable without a renderer.
 *
 * `crown` is the silhouette — 'cone' for a spire, 'round' for a mass.
 */
export const CANOPY_ARCHETYPES = Object.freeze({
  // Wider than it is tall, which is what makes it read as a broadleaf
  // rather than as a poplar: crownRadius 0.62 is 1.24 cells across
  // against 1.15 of height. The first cut had a crown 1.9 tall inside
  // the same 1.24 width — a vertical egg — while its own comment claimed
  // it was being squashed.
  broadleaf: Object.freeze({
    trunkHeight: 1.0,
    trunkRadius: 0.09,
    crownHeight: 1.15,
    crownRadius: 0.62,
    crown: 'round',
  }),
  // Stacked skirts rather than one cone, so the crown has shoulders that
  // face the sky and can hold frost — see canopyGeometry.js TIER_SHAPE
  // for why a single cone could not, and why the tier count follows from
  // the crown's height rather than from taste.
  //
  // A little wider and shorter than the cone it replaces (1.12 cells
  // across against 0.96, 3.3 tall against 3.65). Both moves buy slope,
  // and slope is what holds snow — but only so far: a conifer has to
  // stay NARROWER than a broadleaf, or the two read as the same tree,
  // and that ceiling is what sets the tier count. Eight tiers over this
  // crown lie at 1.21 height-over-radius; at the six I first tried, the
  // same crown had to be a third wider to reach the same slope, and came
  // out fatter than the broadleaf it is supposed to contrast with.
  conifer: Object.freeze({
    trunkHeight: 0.8,
    trunkRadius: 0.08,
    crownHeight: 2.5,
    crownRadius: 0.56,
    crown: 'tiered',
    tiers: 8,
  }),
  // Deliberately the tallest thing that grows, and thin, so it reads as
  // breaking THROUGH a canopy rather than as one more tree in it.
  emergent: Object.freeze({
    trunkHeight: 3.1,
    trunkRadius: 0.08,
    crownHeight: 1.5,
    crownRadius: 0.68,
    crown: 'round',
  }),
  shrub: Object.freeze({
    trunkHeight: 0.12,
    trunkRadius: 0.07,
    crownHeight: 0.62,
    crownRadius: 0.46,
    crown: 'round',
  }),
  // Stunted and wind-flattened: what survives just under the treeline.
  // Wider than it is tall, which is the whole visual point.
  krummholz: Object.freeze({
    trunkHeight: 0.14,
    trunkRadius: 0.1,
    crownHeight: 0.42,
    crownRadius: 0.66,
    crown: 'cone',
  }),
})

/**
 * Which trees each band grows. `density` is the chance a sampled cell
 * takes one, and it is what separates a wood from a jungle: WOODLAND's
 * 0.42 leaves ground between the trunks, JUNGLE's 0.86 does not.
 *
 * MEADOW gets scattered single trees rather than none — an open meadow
 * with the occasional standard reads as meadow, where bare grass reads as
 * a lawn. STEPPE and LIGHT_VEG get only shrubs, which is what puts three
 * distinguishable dry bands on the map instead of two: bare dunes, bare
 * ground with shrubs, and grass with shrubs.
 *
 * OCCUPANCY — the chance a sampled cell takes anything at all, summing
 * weight x density — has to RISE across the bands, or the ramp inverts
 * somewhere in the middle and a better-cited section grows less than a
 * worse-cited one. The first cut of this table had meadow at 0.102
 * against light vegetation's 0.13, because a meadow honestly carries
 * fewer shrubs than scrubland does; the trees have to make up the
 * difference, and they now do:
 *
 *   steppe 0.07   light 0.13   meadow 0.19   woodland 0.55   jungle 0.86
 *
 * Unlike the ground cover, this one climbs the whole way. Trees are the
 * layer that separates the bands — see FOLIAGE_DENSITY on why the canopy
 * answers to lushness more steeply than the grass does.
 */
export const CANOPY_BY_BAND = Object.freeze({
  [BIOME.STEPPE]: [{ archetype: 'shrub', color: 0x7c7a48, density: 0.07, weight: 1 }],
  [BIOME.LIGHT_VEG]: [{ archetype: 'shrub', color: 0x6f8c4a, density: 0.13, weight: 1 }],
  [BIOME.MEADOW]: [
    { archetype: 'broadleaf', color: 0x4a8a44, density: 0.2, weight: 0.6 },
    { archetype: 'shrub', color: 0x5f8a4c, density: 0.17, weight: 0.4 },
  ],
  // 0.55, up from 0.42. Woodland is the band with room to move: jungle
  // already saturates — 0.86 against a lushness scale that reaches 1.75
  // means every sampled cell takes a tree and the count is decided by
  // the canopy stride, which is what a closed canopy should be — while
  // meadow is meant to stay open. So a wood was the only green band that
  // read as thinner than its name.
  [BIOME.WOODLAND]: [
    { archetype: 'broadleaf', color: 0x3f793f, density: 0.55, weight: 0.6 },
    { archetype: 'conifer', color: 0x2f5e3a, density: 0.55, weight: 0.4 },
  ],
  [BIOME.JUNGLE]: [
    { archetype: 'broadleaf', color: 0x24713c, density: 0.86, weight: 0.55 },
    { archetype: 'conifer', color: 0x1f6937, density: 0.86, weight: 0.15 },
    { archetype: 'emergent', color: 0x2b7548, density: 0.86, weight: 0.3 },
  ],
})

/**
 * Density scaling factors, applied on top of a variant's own `density`.
 *
 * The scale is a straight lerp across the lushness scalar, and both
 * curves are SYMMETRIC about 1.0 — min and max average to it — so that
 * lushness 0.5, a section citing at exactly its article's own rate,
 * leaves the band default untouched. Change one end and the other has to
 * move with it, or every band's tuned density quietly shifts.
 *
 * THE TWO LAYERS ANSWER TO LUSHNESS DIFFERENTLY, and they used to share
 * one curve. Ground cover is the less discriminating of the two: grass
 * grows on anything that is not desert, so its density says more about
 * the band than about the citation rate inside it. Trees are the
 * opposite — a wood is the thing a well-sourced section grows, and the
 * gap between a thin section and a thorough one should read as forest
 * against scrub rather than as slightly more scrub.
 *
 * So the canopy gets the wider curve: 7x from barren to lush, against
 * the ground's 2.6x. That ratio is the whole reason for the split.
 */
export const FOLIAGE_DENSITY = Object.freeze({
  understory: Object.freeze({
    min: 0.55, // lushness 0
    max: 1.45, // lushness 1
  }),
  canopy: Object.freeze({
    min: 0.25,
    max: 1.75,
  }),
})

/** Per-instance variation, so a stand is not a lattice. */
export const CANOPY_JITTER = Object.freeze({
  minScale: 0.78,
  maxScale: 1.34,
  // Lateral offset from the cell centre, in cells. Without it every tree
  // sits on a grid point and a wood reads as an orchard.
  //
  // Sized against the CANOPY STRIDE, not against one cell. Trees are
  // sampled every second cell, so an offset of up to half the stride
  // fills the plane continuously; at 0.42 the offset was a fifth of the
  // spacing and the lattice showed straight through it. Half the stride
  // is the ceiling — beyond that a tree crosses into the territory of the
  // cell next door, which already had its own chance to grow one.
  maxOffsetCells: 0.95,
  // Per-instance brightness multiplier, so a stand has depth rather than
  // being one flat green.
  minTint: 0.84,
  maxTint: 1.16,
})

function clamp01(value) {
  return Math.min(1, Math.max(0, Number(value) || 0))
}

function mix(from, to, amount) {
  return from + (to - from) * amount
}

/**
 * Weighted pick from one band's variant list, or null when the band grows
 * nothing in this layer.
 *
 * @param {object} table UNDERSTORY_BY_BAND or CANOPY_BY_BAND
 * @param {number} band BIOME enum value
 * @param {number} roll [0, 1)
 */
function pickWeighted(table, band, roll) {
  const variants = table[band]
  if (!variants || variants.length === 0) return null
  let cumulative = 0
  for (const variant of variants) {
    cumulative += variant.weight
    if (roll < cumulative) return variant
  }
  return variants[variants.length - 1] // safety for float rounding
}

/**
 * Picks the ground-cover variant to try at a cell in `band`. Null for
 * bands with no cover: ocean, beach, polar-cap snow, and dunes.
 *
 * @param {number} band BIOME enum value
 * @param {number} variantRoll [0, 1)
 */
export function pickUnderstoryVariant(band, variantRoll) {
  return pickWeighted(UNDERSTORY_BY_BAND, band, variantRoll)
}

/**
 * Picks the tree to try at a cell in `band`. Null for bands with no
 * trees, which includes dunes and every non-land biome.
 *
 * @param {number} band BIOME enum value
 * @param {number} variantRoll [0, 1)
 */
export function pickCanopyVariant(band, variantRoll) {
  return pickWeighted(CANOPY_BY_BAND, band, variantRoll)
}

/**
 * Substitutes an archetype for the one that actually grows at this
 * altitude.
 *
 * A mountain is not a taller version of its foothills: broadleaf gives
 * way to conifer, and conifer to stunted krummholz just below the
 * treeline. So altitude reads as a change in KIND rather than only as a
 * thinning, and a rocky slope carries recognisable alpine vegetation
 * instead of a sparser copy of the valley.
 *
 * `emergent` is deliberately exempt from the conifer substitution. It is
 * the jungle band's signature — the layer separating it from woodland —
 * and swapping it out at altitude would erase that distinction on exactly
 * the high ground where the two are hardest to tell apart.
 *
 * @param {string} archetype name from CANOPY_ARCHETYPES
 * @param {number} height [0, 1]
 * @returns {string} name from CANOPY_ARCHETYPES
 */
export function resolveArchetypeForAltitude(archetype, height) {
  const h = Number(height) || 0
  if (h >= ALTITUDE.krummholzStart) return 'krummholz'
  if (h >= ALTITUDE.coniferStart && archetype === 'broadleaf') return 'conifer'
  return archetype
}

/**
 * Density scale from this cell's lushness and its altitude.
 *
 * The lushness part reads the same scalar the ground colour and the band
 * name read, which is the point: foliage used to normalize
 * citations-per-sentence against the article average on its own, while the
 * biome under it classified on absolute thresholds, so the two disagreed
 * about what "lush" meant.
 *
 * The altitude part is the treeline, and it is a multiplier rather than a
 * gate. Foliage above the old rock threshold was not thinned, it was
 * deleted — no variants existed for rock or snow — so a quarter of every
 * world's land was bare by construction. Now it tapers, and a well-cited
 * section's treeline sits higher than a barren one's.
 *
 * @param {number} lushness [0, 1] from lushness.js
 * @param {number} [height] [0, 1] cell height; omit for ground-level cells
 * @param {{ min: number, max: number }} [curve] which layer is asking,
 *   from FOLIAGE_DENSITY; the canopy's is the steeper of the two
 */
export function computeFoliageDensityScale(lushness, height = 0, curve = FOLIAGE_DENSITY.canopy) {
  const value = clamp01(lushness)
  const byLushness = curve.min + (curve.max - curve.min) * value
  return byLushness * treelineFactor(height, value)
}

/**
 * One instance's colour: the variant's own green, varied per instance so
 * a stand has depth, then dusted white by however much snow lies at this
 * height.
 *
 * The dusting is what puts vegetation INSIDE the snow band instead of
 * stopping at its edge — dark conifers going pale as they climb, rather
 * than a clean line with trees below and nothing above.
 *
 * @param {number} baseColor 0xRRGGBB
 * @param {number} height [0, 1]
 * @param {number} tintRoll [0, 1)
 * @returns {{ r: number, g: number, b: number }} channels in [0, 1]
 */
export function foliageInstanceColor(baseColor, height, tintRoll) {
  // No longer what the renderer uploads — the canopy shader mixes snow
  // itself, per surface rather than per tree, so that a crown is capped
  // and the underside of it is not. This stays as the testable statement
  // of the rule that shader implements: tint, then mix toward white by
  // snowCover at the tree's own altitude. GLSL cannot be unit tested; a
  // reference it must agree with can.
  const { r, g, b } = foliageTintColor(baseColor, tintRoll)
  const dust = snowCover(height)
  return {
    r: clamp01(mix(r, 1, dust)),
    g: clamp01(mix(g, 1, dust)),
    b: clamp01(mix(b, 1, dust)),
  }
}

/**
 * The tree's own colour, with its brightness jitter and no snow.
 *
 * Split from the dusting above for the same reason biomeGroundRgb was
 * split from the snow over it: baked together, a snowline cannot move
 * without rebuilding every instance colour in the world, and a uniform
 * mix is the wrong look anyway — it whitens the shaded underside of a
 * crown as much as the top, where snow actually settles. A renderer that
 * applies snow itself wants this and the instance's height, and gates on
 * the surface normal.
 *
 * @param {number} baseColor packed 0xRRGGBB from the variant table
 * @param {number} tintRoll [0, 1)
 * @param {object} [jitter] CANOPY_JITTER or UNDERSTORY_JITTER
 * @returns {{ r: number, g: number, b: number }} channels in [0, 1]
 */
export function foliageTintColor(baseColor, tintRoll, jitter = CANOPY_JITTER) {
  const brightness = mix(jitter.minTint, jitter.maxTint, clamp01(tintRoll))
  const channel = (shift) => clamp01((((baseColor >> shift) & 0xff) / 255) * brightness)
  return { r: channel(16), g: channel(8), b: channel(0) }
}

/**
 * Brightness-tint a clump, then rarely swap in a flower/lime accent.
 *
 * Steppe and scrub stay dull — only grass (meadows, light veg, woodland
 * floor) and ferns get accents. The same tintRoll that sets brightness
 * also decides whether an accent fires, so one salt stays enough.
 *
 * @param {number} baseColor packed 0xRRGGBB from the variant table
 * @param {string} kind 'grass' | 'scrub' | 'fern'
 * @param {number} tintRoll [0, 1)
 * @returns {{ r: number, g: number, b: number }}
 */
export function understoryAccentColor(baseColor, kind, tintRoll) {
  const tinted = foliageTintColor(baseColor, tintRoll, UNDERSTORY_JITTER)
  if (kind === 'scrub' || kind === 'steppe') return tinted
  if (kind !== 'grass' && kind !== 'fern') return tinted
  // Accents live in the top `chance` of the roll so most clumps keep the
  // band colour and only a scatter of them bloom.
  if (tintRoll < 1 - UNDERSTORY_ACCENTS.chance) return tinted

  const accent =
    kind === 'fern'
      ? UNDERSTORY_ACCENTS.lime
      : tintRoll > 1 - UNDERSTORY_ACCENTS.chance * 0.45
        ? UNDERSTORY_ACCENTS.blossom
        : UNDERSTORY_ACCENTS.flower
  // Mix rather than replace: a full swap reads as confetti; a lean keeps
  // the clump in the meadow while the eye catches a petal.
  const accented = foliageTintColor(accent, tintRoll, UNDERSTORY_JITTER)
  return {
    r: mix(tinted.r, accented.r, 0.72),
    g: mix(tinted.g, accented.g, 0.72),
    b: mix(tinted.b, accented.b, 0.72),
  }
}

/**
 * One instance's scale multiplier, yaw, and lateral offset from the cell
 * centre, from four independent rolls.
 *
 * The offset takes its own angle AND its own radius. It used to derive
 * the radius from `scaleRoll` — the same roll that sets the tree's size —
 * which quietly correlated the two: every small tree sat near its cell
 * centre and every large one at the rim. The sqrt is still there, and is
 * not cosmetic: sampling radius uniformly would pile instances toward the
 * centre, because the area of a ring grows with its radius.
 *
 * @param {number} scaleRoll [0, 1)
 * @param {number} rotationRoll [0, 1)
 * @param {number} offsetAngleRoll [0, 1)
 * @param {number} offsetRadiusRoll [0, 1)
 */
export function canopyInstanceTransform(scaleRoll, rotationRoll, offsetAngleRoll = 0, offsetRadiusRoll = 0) {
  return instanceTransform(CANOPY_JITTER, scaleRoll, rotationRoll, offsetAngleRoll, offsetRadiusRoll)
}

/**
 * The same, for one clump of ground cover.
 *
 * Its own function only because the jitter table differs — see
 * UNDERSTORY_JITTER on why the offset ceiling is half the canopy's.
 *
 * @param {number} scaleRoll [0, 1)
 * @param {number} rotationRoll [0, 1)
 * @param {number} offsetAngleRoll [0, 1)
 * @param {number} offsetRadiusRoll [0, 1)
 */
export function understoryInstanceTransform(scaleRoll, rotationRoll, offsetAngleRoll = 0, offsetRadiusRoll = 0) {
  return instanceTransform(UNDERSTORY_JITTER, scaleRoll, rotationRoll, offsetAngleRoll, offsetRadiusRoll)
}

function instanceTransform(jitter, scaleRoll, rotationRoll, offsetAngleRoll, offsetRadiusRoll) {
  const angle = clamp01(offsetAngleRoll) * Math.PI * 2
  const radius = jitter.maxOffsetCells * Math.sqrt(clamp01(offsetRadiusRoll))
  return {
    scale: mix(jitter.minScale, jitter.maxScale, clamp01(scaleRoll)),
    yaw: clamp01(rotationRoll) * Math.PI * 2,
    offsetX: Math.cos(angle) * radius,
    offsetY: Math.sin(angle) * radius,
  }
}

/**
 * Whether the canopy is worth drawing from where the camera is.
 *
 * The flat map always shows it — the camera never gets far enough away
 * for it to be wasted. On the planet it fades in on descent.
 *
 * @param {number} cameraDistance from the world's centre, in world units
 * @param {number} planetRadius 0 or absent for the flat map
 */
export function shouldShowCanopy(cameraDistance, planetRadius) {
  if (!planetRadius || planetRadius <= 0) return true
  return cameraDistance <= planetRadius * FOLIAGE_SAMPLING.canopyVisibleRadiusRatio
}

/**
 * How tall something is on screen, in device pixels.
 *
 * The same arithmetic behind the measurements in FOLIAGE_SAMPLING above,
 * written down instead of done by hand: at the camera's distance the
 * frustum spans a known height in world units, and an object occupies
 * its own share of that.
 *
 * `cameraDistance` is to the OBJECT, which on the planet means the
 * camera's distance from the centre less the planet's radius. Those
 * measurements above only reproduce that way, and the difference is not
 * small — at the closest zoom the camera is 1.15 radii from the centre
 * and 0.15 from the ground.
 *
 * @param {number} objectHeight in world units
 * @param {number} cameraDistance in world units, to the object
 * @param {number} viewportHeight in device pixels
 * @param {number} fieldOfView vertical, in degrees
 */
export function apparentPixels(objectHeight, cameraDistance, viewportHeight, fieldOfView) {
  if (!(cameraDistance > 0)) return Infinity
  const frustumHeight = 2 * cameraDistance * Math.tan((fieldOfView * Math.PI) / 360)
  return (objectHeight / frustumHeight) * viewportHeight
}

/**
 * What fraction of a vegetation layer's instances are worth drawing.
 *
 * WHY A COUNT AND NOT A SIZE
 *
 * Pull the camera back and each plant covers fewer pixels, but they all
 * stay on screen — so the number of plants PER PIXEL grows with the
 * square of the distance. Past a certain point that is not detail, it is
 * noise: a pixel covered by six blades of grass shows the average of
 * six blades, which is a flat colour we could have drawn with one.
 *
 * So the fraction falls with the square of the apparent size, which is
 * exactly the rate that holds plants-per-pixel — and with it the
 * triangles per pixel — constant as the camera retreats. The layer stops
 * getting more expensive per pixel the further away it is, which is the
 * opposite of how it behaved before.
 *
 * The threshold is per PLANT and not per layer, which matters and was
 * got wrong first: a tree measures about 5 px at either view's default
 * camera and a grass clump about 2 px, because grass is short. Judging
 * both against the tree's figure thinned ground cover to 12% at the
 * view every world opens in — the layer was culled hardest in the only
 * view most readers ever see.
 *
 * This became necessary rather than merely nice when ground cover
 * stopped being point sprites. A sprite cost one vertex, so leaving all
 * 3,890 of them on from orbit was genuinely free; a clump of blades
 * costs 20 triangles, and 3,890 of those drawn across a planet the size
 * of a thumbnail is 67,000 triangles resolving to a few hundred pixels.
 *
 * @param {number} apparent the layer's apparent height in device pixels
 * @param {number} [ceiling] the quality tier's own density, as a cap
 * @returns {number} in [FOLIAGE_LOD.minFraction, ceiling]
 */
export function foliageDetailFraction(apparent, ceiling = 1) {
  if (!Number.isFinite(apparent)) return ceiling
  if (apparent >= FOLIAGE_LOD.fullDetailPixels) return ceiling

  const ratio = Math.max(0, apparent) / FOLIAGE_LOD.fullDetailPixels
  return Math.min(ceiling, Math.max(FOLIAGE_LOD.minFraction, ratio * ratio))
}

/**
 * Where the detail fraction turns over, and how far it is allowed to
 * fall.
 *
 * `fullDetailPixels` is the apparent height below which a plant has
 * stopped being a plant. Under about one pixel a triangle either misses
 * the raster grid or catches it intermittently, which with MSAA on is
 * shimmer rather than texture — worse than not drawing it. 1.5 is that
 * point with a little margin.
 *
 * Deliberately BELOW what anything measures at either view's default
 * camera — grass is the smallest thing here at about 2.1 px on the flat
 * map and 2.3 px on the planet, so a world opens at full density in
 * both. Thinning is for the orbit the camera can pull back to, where
 * ground cover reaches 0.6 px and 3,890 clumps of it are 67,000
 * triangles resolving to shimmer. The first value tried here was 6 px,
 * which culled 88% of the ground cover in the default view.
 *
 * `minFraction` is a floor rather than zero because a layer that thins
 * to nothing pops when it comes back. At 4% of a lush world's ground
 * cover there are still a few hundred clumps carrying the ground's
 * colour, which is all the layer contributes from that far out anyway.
 */
export const FOLIAGE_LOD = Object.freeze({
  fullDetailPixels: 1.5,
  minFraction: 0.04,
})

/**
 * Murmur3's 32-bit finalizer: the avalanche step that turns a combined
 * hash into something that actually looks random.
 *
 * `Math.imul` rather than `*` throughout, because these products overflow
 * 32 bits and JavaScript's `*` promotes to double — imul is the only way
 * to get the wrapping multiply the mixing depends on.
 */
function fmix32(hash) {
  let h = hash
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return h >>> 0
}

/**
 * Deterministic per-cell rolls: two independent-ish [0, 1) values from
 * one hash, salted so the layers do not correlate.
 *
 * Each layer and each decision takes its own salt. Without that the
 * understory and the canopy would agree about which cells are populated,
 * and every tree would stand in its own patch of grass with bare ground
 * between.
 *
 * THE FINALIZER IS LOAD-BEARING. This was `(x * 73856093) ^ (y * 19349663)
 * ^ seed` with no mixing step, and the two halves of the result behaved
 * completely differently. `variantRoll` reads the LOW bits, which depend
 * on the low bits of x and y and so vary per cell; `densityRoll` reads
 * the HIGH bits, which for a multiply barely change between neighbours.
 * Measured over a 64x64 patch:
 *
 *   sd of column means      0.1868   against 0.0361 for independent rolls
 *   mean |delta| x-neighbour  0.0971   against 0.3333
 *   mean |delta| y-neighbour  0.0326   against 0.3333
 *
 * Neighbouring cells drew nearly the SAME density roll, so trees arrived
 * in solid blocks striped on a ~29-column period — which is exactly the
 * period bits 16-31 of `x * 73856093` cycle on at a stride of 2. Because
 * the variant roll was fine, those blocks were correctly mixed in species
 * while being placed in bands. With fmix32 the same measurements come out
 * at 0.0376, 0.3284 and 0.3301.
 *
 * @param {number} gridX
 * @param {number} gridY
 * @param {number} seed world seed
 * @param {number} [salt] which decision this roll is for — see SALT in
 *   foliageScatter.js; each layer and each per-instance property takes
 *   its own, or they correlate
 */
export function cellFoliageRolls(gridX, gridY, seed, salt = 0) {
  const combined =
    Math.imul(gridX, 0x27d4eb2d) ^ Math.imul(gridY, 0x165667b1) ^ Math.imul(seed ^ salt, 0x9e3779b1)
  const hash = fmix32(combined)
  return {
    variantRoll: (hash & 0xffff) / 0x10000,
    densityRoll: ((hash >>> 16) & 0xffff) / 0x10000,
  }
}
