/**
 * The sea as a surface: how deep it is, what colour that makes it, and
 * how much of the floor it hides.
 *
 * WHAT WAS WRONG WITH ONE FLAT BLUE
 *
 * The water was a two-triangle plane in a single colour at a single
 * opacity, which gets three things wrong at once. A lagoon by the beach
 * read exactly as deep ocean, so the sea carried no depth cue at all
 * while the land beside it had been given occlusion, cast shadows and
 * aerial haze. It took no light of its own — a headland's shadow fell
 * across the bay and stopped at the waterline. And because its opacity
 * never changed, the place it MET the land was a hard geometric line:
 * the intersection of a flat plane with a grid of triangles, which is
 * the one part of the jagged-coast complaint that softening the ground's
 * colours could not reach. See SHORE in the generation config for the
 * other part.
 *
 * All three come back to the same missing number, which is how far the
 * floor is below the surface at each point.
 *
 * DEPTH DOES THE WORK THREE TIMES
 *
 * It sets the colour, from a shallow turquoise to a deep blue. It sets
 * the opacity, so shallows show the sand through them and the deep does
 * not. And because the opacity starts at ZERO where the depth does, the
 * waterline stops being an edge: the sea fades in over the shelf, and
 * the sharp line where the plane cuts the terrain now has nothing drawn
 * on it. The staircase is not smoothed, it is unpainted.
 *
 * Free of three.js, like the rest of ui/rendering that is not a mesh:
 * this returns typed arrays and the caller makes them attributes.
 */
import { BIOME_THRESHOLDS } from '../../engine/generation/config.js'

/**
 * The water's own palette, and why it is not in biomeColor.js with
 * everything else.
 *
 * That module answers "what colour is this biome", and the sea floor is
 * a biome — BIOME.OCEAN's deep blue is the colour of the GROUND down
 * there, which seaFloorCover already fades the sand into. This is a
 * different thing standing on top of it: the water itself, whose colour
 * is a function of depth rather than of any biome, and which is
 * composited over that floor rather than replacing it.
 *
 * Shallow is a turquoise because shallow water over pale sand is one,
 * and because it has to differ from the floor it is laid over or the
 * shelf shows nothing. Deep is darker than the floor's own blue, so that
 * depth reads as depth even where the floor stops getting deeper — the
 * height map bottoms out at 0.10 and a quarter of the ocean sits on that
 * floor, which would otherwise be one flat tone across the whole basin.
 */
const WATER_SHALLOW_RGB = Object.freeze([104, 194, 188])
const WATER_DEEP_RGB = Object.freeze([12, 44, 102])

/**
 * The depths the ramps run over, in the height map's own [0, 1] units,
 * and every one of them measured against a generated world rather than
 * picked. Over the 83,026 ocean cells of the Grand Canyon realm, depth
 * below sea level runs:
 *
 *   p01     p10     p25     p50     p75     p90     max
 *   0.003   0.032   0.083   0.154   0.200   0.215   0.220
 *
 * The floor bottoms out 0.22 below the waterline and half the ocean is
 * past 0.154, so a ramp has to spend its range in the first third to
 * describe anything.
 */
export const WATER = Object.freeze({
  // Where the water reaches full opacity — the outer edge of the shelf.
  //
  // 0.08 is the ocean's p25, so a quarter of the sea is somewhere in
  // this fade and the rest is fully water. In cells that is the useful
  // way to read it: at the measured coastal gradient of 0.0075 of height
  // per cell, this band is about eleven cells wide, which is what turns
  // the waterline from an edge into a shore.
  opaqueDepth: 0.08,
  // Where the colour finishes darkening. Longer than the opacity ramp,
  // and deliberately: opacity has to finish early or the shelf would go
  // on showing the floor halfway out to sea, while colour has the whole
  // basin to describe and reaches the ocean's p90 before it stops.
  colorDepth: 0.18,
  // How much of the floor the deep sea hides. Not 1: water is not paint,
  // and leaving a fifth of the floor showing is what keeps the deep
  // reading as a volume with something at the bottom of it. The old flat
  // plane sat at 0.55 everywhere, which was too clear for the deep and
  // far too opaque at the shore.
  maxOpacity: 0.8,
})

/**
 * How much of the height map one cell of coastline covers, measured
 * over the shoreline cells of a generated world (median 0.0075).
 *
 * The same figure SHORE's bands were sized against, and it is what lets
 * a depth be turned into a distance: the shelf is WATER.opaqueDepth
 * deep, so it is that many cells wide, and one cell is one world unit
 * in both projections.
 */
const COAST_GRADIENT = 0.0075

/** The shelf's width in world units — about eleven cells of coast. */
export const SHELF_WIDTH = WATER.opaqueDepth / COAST_GRADIENT

/**
 * Surf: waves that arrive at the shore, and the rule for when to draw
 * them.
 *
 * WHY THE WAVES NEED NOTHING NEW TO RIDE ON
 *
 * The sea's opacity is a smoothstep of depth that saturates at the
 * outer edge of the shelf, so dividing it by that ceiling gives a
 * coordinate that runs 0 at the waterline to 1 where the shelf ends —
 * and whose contours follow the coast EXACTLY, because depth's do. A
 * wave in that one number is therefore a wave in the shape of the
 * shore, however the shore happens to be shaped. No attribute, no
 * second pass, nothing to sample, and no coastline to trace: the whole
 * effect is a function of a channel the water already carries.
 *
 * Measured on integrated graphics at 1080p, interleaved so the timer's
 * drift cancels: 0.09ms a frame, against the sea's own 7.47ms. It is
 * below the noise floor because the sea's cost is FILL rather than
 * vertices, and these are a few instructions added to fragments that
 * were already being shaded and blended.
 *
 * MOTION COMES FROM THE ENVIRONMENT, SO STILLNESS DOES TOO
 *
 * The phase is driven by the shared clock in environment.js, which
 * returns a time of 0 for a frozen world. So under prefers-reduced-
 * motion the surf stops where it stands rather than disappearing —
 * still foam at a still shore — and there is no second code path here
 * saying so.
 *
 * WHAT THE SHIPPED NUMBERS ACTUALLY DO
 *
 * Measured over one full wave period at a shoreline camera, sampling
 * every second pixel across ten phases: 12.85% of the frame animates,
 * and the pixels that move swing by a median of 19 brightness levels
 * out of 255, p90 of 30 and a peak of 72. Well clear of the two or
 * three levels where a change stops being visible, and the pattern
 * returns bit-identical after one period, so nothing drifts.
 */
export const SURF = Object.freeze({
  /**
   * Crests between the waterline and the shelf's outer edge.
   *
   * Few, and this was the first thing tuned rather than guessed: seven
   * read as contour lines on a map, because at that spacing the eye
   * stops seeing water arriving and starts seeing a diagram of the
   * depth. Wave sets come in ones and twos.
   */
  bands: 3,
  /** Crests reaching the shore per second. A long ocean period. */
  speed: 0.16,
  /**
   * How much of a crest is crest. The sine is raised to this power, so 1
   * is a smooth swell and a large number is a thin line — the same knob
   * that turns surf back into contours if pushed.
   *
   * Tuned against the screen at three bands: 2.2 leaves crests so broad
   * they read as soft banding in the bay rather than as water arriving,
   * and much above 4 they thin into lines again.
   */
  sharpness: 3.5,
  /**
   * The opacity foam brings with it.
   *
   * It has to bring its own: at the waterline the sea is drawn as
   * nothing, and a white nothing is still nothing. This is what lets
   * the wash run up over the sand instead of stopping at the water.
   *
   * Foam is mixed into the albedo BEFORE the light, like snow, so it is
   * lit by the same sun as the sea it sits on. That is why this number
   * is high and the result is still not white: a dim shore gets dim
   * foam, which is the point.
   */
  foam: 0.78,
  /**
   * The band widths, in device pixels, between which the surf fades in.
   *
   * This is not a taste control, it is anti-aliasing. A band narrower
   * than a couple of pixels cannot be drawn without shimmering, and a
   * moving shimmer is far worse than no wave: from orbit the bands go
   * sub-pixel and average into a crawling white fringe around every
   * island. Below `minBandPixels` there is nothing to draw honestly, so
   * nothing is drawn; by `fullBandPixels` there is room for a crest and
   * a trough either side of it.
   *
   * It also happens to be what a reader would ask for anyway — bold up
   * close, general from far away — which is the useful kind of
   * coincidence: the cheap thing and the correct thing agree.
   */
  minBandPixels: 4,
  fullBandPixels: 13,
})

/**
 * How strongly to draw the surf, given how wide one band lands on
 * screen. See SURF.minBandPixels.
 *
 * @param {number} bandPixels device pixels across one crest
 */
export function surfStrength(bandPixels) {
  return smoothstep(SURF.minBandPixels, SURF.fullBandPixels, Math.max(0, Number(bandPixels) || 0))
}

/** Smooth 0→1 ramp with zero slope at both ends, as in terrain.js. */
function smoothstep(edge0, edge1, value) {
  if (edge1 <= edge0) return value >= edge1 ? 1 : 0
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/**
 * How far the floor lies below the waterline at this height, in [0, ~],
 * and 0 for any ground standing above it.
 *
 * @param {number} height01 the height map's own value for a cell
 */
export function waterDepth(height01) {
  return Math.max(0, BIOME_THRESHOLDS.oceanMaxHeight - (Number(height01) || 0))
}

/**
 * How much the water hides the floor at this depth, in [0, 1].
 *
 * Zero at zero depth, which is the whole trick: the sea is drawn as
 * nothing exactly where it meets the land, so the hard line where the
 * surface cuts through the terrain has no colour on it to show.
 */
export function waterOpacity(depth) {
  return WATER.maxOpacity * smoothstep(0, WATER.opaqueDepth, Math.max(0, Number(depth) || 0))
}

/**
 * The water's own colour at this depth, before any light.
 *
 * @returns {[number, number, number]} channels in [0, 255]
 */
export function waterRgbAt(depth) {
  const t = smoothstep(0, WATER.colorDepth, Math.max(0, Number(depth) || 0))
  return [
    WATER_SHALLOW_RGB[0] + (WATER_DEEP_RGB[0] - WATER_SHALLOW_RGB[0]) * t,
    WATER_SHALLOW_RGB[1] + (WATER_DEEP_RGB[1] - WATER_SHALLOW_RGB[1]) * t,
    WATER_SHALLOW_RGB[2] + (WATER_DEEP_RGB[2] - WATER_SHALLOW_RGB[2]) * t,
  ]
}

/**
 * Colour and opacity per cell, as one RGBA buffer for a vertex colour.
 *
 * Four components rather than three because that is how three decides a
 * mesh has per-vertex alpha: an itemSize of 4 on the colour attribute,
 * with vertexColors on, is what makes it define USE_COLOR_ALPHA. So the
 * opacity travels with the colour instead of needing an attribute and a
 * define of its own.
 *
 * Channels are already in [0, 1] for the GPU, as computeGroundAttributes
 * hands its colours over.
 *
 * @param {{ width: number, height: number, heightMap: Float64Array }} terrain
 * @returns {Float32Array} four values per cell, row-major
 */
export function computeWaterAttributes(terrain) {
  const { width, height, heightMap } = terrain
  const cells = width * height
  const colors = new Float32Array(cells * 4)

  for (let i = 0; i < cells; i += 1) {
    const depth = waterDepth(heightMap[i])
    const [r, g, b] = waterRgbAt(depth)
    colors[i * 4] = r / 255
    colors[i * 4 + 1] = g / 255
    colors[i * 4 + 2] = b / 255
    colors[i * 4 + 3] = waterOpacity(depth)
  }

  return colors
}

/**
 * Throws away the triangles of the water grid that have no water on
 * them, which is a third of it.
 *
 * The sea spans the whole footprint so that its boundary is never a
 * boundary — trimming it to the cells below sea level would give the
 * water an edge at cell resolution, which is the staircase this was
 * built to remove. But a triangle whose every corner is dry has an
 * opacity of zero at every corner, so it is a triangle that draws
 * nothing, and drawing nothing is not free: it is still transformed,
 * still shaded, and every one of its fragments still goes through the
 * blend.
 *
 * It is a small saving and worth being accurate about, because a GPU
 * timer's medians drift by more than the whole effect and the first
 * numbers this was measured with were noise. Interleaving the variants
 * frame by frame so the drift cancels, on integrated graphics at 1080p:
 * the sea costs 3.74ms a frame at full grid and 3.42ms with the dry
 * third dropped, against a 10.5ms scene without it. So 0.5ms, and the
 * useful thing the measurement says is that the cost is nearly all
 * FILL rather than vertices — a third fewer triangles bought 14% of the
 * water's time. There is no case here for thinning the grid: it would
 * cost the shore its resolution and buy almost nothing.
 *
 * Dropping them is not a compromise: the result is the same pixels. The
 * kept region still reaches a full cell PAST the waterline on the dry
 * side — any triangle touching a wet corner stays — so the fade still
 * has its zero to fade to, and the shore keeps every vertex it had.
 *
 * @param {Uint32Array|Uint16Array} indices triangles from buildWaterArrays
 * @param {{ heightMap: Float64Array }} terrain
 */
export function dropDryTriangles(indices, terrain) {
  const { heightMap } = terrain
  const kept = new indices.constructor(indices.length)
  let out = 0
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i]
    const b = indices[i + 1]
    const c = indices[i + 2]
    if (waterDepth(heightMap[a]) <= 0 && waterDepth(heightMap[b]) <= 0 && waterDepth(heightMap[c]) <= 0) continue
    kept[out] = a
    kept[out + 1] = b
    kept[out + 2] = c
    out += 3
  }
  return kept.subarray(0, out)
}

/**
 * Ripple: the chop that gives the sea's reflection something to break
 * up on.
 *
 * WHY A FLAT SEA CANNOT GLINT
 *
 * The water is a grid pinned to sea level, so every one of its normals
 * points the same way, and a highlight needs the surface to face
 * halfway between the sun and the eye. One normal means that condition
 * is either met everywhere or nowhere: measured on the shipped sea at a
 * shoreline camera, a sun-tight lobe brightened it by 0.00 levels, and
 * widening the lobe until it did anything at all brightened the whole
 * bay uniformly by 14 to 80 levels. Uniformly brighter water is not a
 * glint, it is paler water.
 *
 * Real water glitters because its surface is covered in slopes, so
 * somewhere in view there is always a facet turned the right way. This
 * supplies those slopes — not as geometry, which would need vertices
 * far finer than one cell, but as a slope field the shader evaluates
 * per fragment.
 *
 * WHY PLANE WAVES AND NOT NOISE
 *
 * A sine's derivative is another sine, so the SLOPE is exact and
 * analytic: no texture to sample, no noise to hash, and nothing to
 * filter. A few of them crossing at angles is the classic cheap chop,
 * and it is enough here because the result is only ever read as light
 * on a surface rather than as a height field in its own right.
 *
 * The wave vectors are three-dimensional so that one set serves both
 * projections. On the flat map the surface lies in local XY, so a wave
 * vector's Z component contributes nothing to the in-plane slope and
 * merely shifts the phase; on the globe the surface is radial and all
 * three components matter. Each wave does have two still points on a
 * sphere, where its direction is exactly radial and the crest has no
 * component along the surface, which is another reason there are
 * several of them pointing different ways.
 */

/** How fast the set travels, as a multiplier on the shared clock. */
const RIPPLE_SPEED = 0.55

/**
 * How fast one wave's phase turns, per unit of the shared clock.
 *
 * Deep-water dispersion: a wave's phase speed goes as the square root
 * of its wavelength and angular frequency is that speed times the
 * wavenumber, which leaves the square root of the wavenumber. Written
 * as a rule rather than as five hand-set numbers because it is a fact
 * about water and not a taste, and because numbers set by hand would
 * drift off it the first time a wavelength was retuned.
 *
 * It is also most of what stops a sum of sines from looking like one.
 * Given a single shared rate the whole set slides along together and
 * reads as one texture being dragged; with dispersion the long swells
 * outrun the short chop and the crests drift through each other.
 *
 * @param {number} wavelength in world units
 */
export function rippleWaveFrequency(wavelength) {
  return RIPPLE_SPEED * Math.sqrt((Math.PI * 2) / wavelength)
}

/**
 * The wave set, before dispersion is applied to it.
 *
 * Amplitudes are written as amplitudes, but what reaches the lighting
 * is amplitude times wavenumber — the SLOPE, since only a slope changes
 * how a surface faces. These come to about 0.37 RMS, a tilt of some 20
 * degrees, which is choppy but not implausible water.
 *
 * What the slope is FOR is worth stating, because it was first sized
 * for something else. The chop was originally cut to bridge the gap to
 * the sun's mirror direction, and it cannot: at this world's 59-degree
 * sun that direction sits 38 degrees off the sea's normal, which no
 * plausible water reaches, and the attempt read as a lattice of bright
 * stamps rather than as sparkle. Its real job is to modulate the sky
 * reflection, whose curve is steep enough that twenty degrees of tilt
 * is the difference between dark water and bright — measured, it moves
 * the sea by 2.3 levels on average and 41 at the peaks, which is what
 * turns a flat wash into bands that read as a surface.
 */
const WAVE_SET = [
  { wavelength: 19, direction: [0.2, 0.62, 1], amplitude: 0.475 },
  { wavelength: 13, direction: [1, 0.28, 0.15], amplitude: 0.418 },
  { wavelength: 8.6, direction: [-0.42, 1, 0.22], amplitude: 0.248 },
  { wavelength: 6.1, direction: [0.7, -0.72, 0.3], amplitude: 0.153 },
  { wavelength: 5, direction: [-0.88, -0.38, 0.4], amplitude: 0.098 },
]

export const RIPPLE = Object.freeze({
  /**
   * Five waves, not three, and no two of them harmonics.
   *
   * Three crossing sinusoids make a LATTICE. That is not a subtle
   * defect: with three the glitter came out in visible diagonal rows,
   * reading as a halftone screen laid over the bay rather than as light
   * on water. Any finite sum of sines is periodic, so the goal is not to
   * abolish the pattern but to push its period past what the eye will
   * look for, which takes both more waves and wavelengths that do not
   * divide into one another.
   *
   */
  waves: Object.freeze(WAVE_SET.map((wave) => Object.freeze({
    ...wave,
    direction: Object.freeze([...wave.direction]),
    // Derived, never written by hand. See rippleWaveFrequency.
    frequency: rippleWaveFrequency(wave.wavelength),
  }))),
  /**
   * The wavelengths, in device pixels, between which the chop fades in.
   *
   * The same rule as SURF.minBandPixels and for the same reason, except
   * that here it is not optional. A slope field is the highest spatial
   * frequency in the scene, and once a wavelength falls near a pixel the
   * highlight it carries samples at random — which is not a soft
   * shimmer but a field of white specks that crawl. Nothing is drawn
   * below the floor; by the ceiling there is room for a crest, a trough
   * and the slope between them.
   */
  minWavePixels: 6,
  fullWavePixels: 20,
})

/**
 * How strongly to draw the chop, given how wide its shortest wave lands
 * on screen. See RIPPLE.minWavePixels.
 *
 * @param {number} wavePixels device pixels across the shortest wave
 */
export function rippleStrength(wavePixels) {
  return smoothstep(RIPPLE.minWavePixels, RIPPLE.fullWavePixels, Math.max(0, Number(wavePixels) || 0))
}

/**
 * The shortest wavelength in the set, which is the one that has to be
 * resolved: the set is only as drawable as its finest member.
 */
export function shortestRippleWavelength() {
  return Math.min(...RIPPLE.waves.map((wave) => wave.wavelength))
}

/**
 * How much sky the sea returns.
 *
 * Fresnel, with water's own numbers rather than invented ones: about 2%
 * of the light meeting the surface head-on is reflected, rising to all
 * of it at a grazing angle. Everyone has seen both ends of that curve —
 * a lake looks into itself at your feet and looks like sky at the far
 * shore — which is what makes it such a strong cue for liquid, and why
 * a sea without it reads as coloured glass however well it moves.
 *
 * `strength` scales the whole curve and is the one number here that is
 * taste rather than physics. At 1 the far water goes fully to sky and,
 * with the aerial haze already lightening distance, the two together
 * flatten the horizon into a single band. Held back, the sea keeps its
 * own colour while still turning toward the sky as it recedes.
 */
export const WATER_SKY_REFLECTION = Object.freeze({
  strength: 0.62,
  /**
   * How sharply reflectance climbs as the view turns toward grazing.
   *
   * Schlick's own exponent is 5, and 5 is unusable here: it concentrates
   * the whole effect in the last few degrees before the horizon, and
   * this world is read from above. Measured at a shoreline camera, an
   * exponent of 5 lifted the sea by 1.7 levels, where 1.5 lifts it by
   * 6.1 and leaves the chop room to modulate.
   *
   * So this is the one number here that is frankly a lie, and the lie
   * is chosen rather than stumbled into: the shape of the curve is kept
   * — dark underfoot, bright as it recedes — while its steepness is
   * relaxed until the range it acts over is the range a reader actually
   * looks from.
   */
  falloff: 1.5,
  /**
   * Reflectance when looking straight down into the water.
   *
   * Water's real value, and small on purpose: the point of the curve is
   * how far it travels. Raising this floor is the difference between a
   * sea and a sheet of steel.
   */
  facing: 0.02,
})
