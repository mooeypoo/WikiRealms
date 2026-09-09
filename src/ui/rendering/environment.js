/**
 * The world's clock and its weather, as a plain object.
 *
 * WHY THIS IS A MODULE AND NOT A FEW VARIABLES IN THE RENDER LOOP
 *
 * Everything that moves needs the same two answers — what time is it,
 * and is anything allowed to move — and until now each animated thing
 * asked separately. The portal pulse and the halo breathing both read
 * `performance.now()` directly from the loop, so there was no single
 * place to say "hold still", which is why the 3D view was the one part
 * of the app that ignored prefers-reduced-motion while the ledger and
 * the travel transition both honoured it.
 *
 * Making the clock a value rather than a call is what fixes that. A
 * frozen environment returns the same time every frame, so the pulse,
 * the breathing and the wind all stop together without any of them
 * knowing why, and nothing needs a second code path for stillness.
 *
 * DETERMINISM
 *
 * The rule this follows, and the reason wind can exist at all next to a
 * reproducible worldId: PLACEMENT is deterministic and versioned,
 * APPEARANCE is time-varying and unversioned.
 *
 * Which way the wind blows in a realm is placement — derived from the
 * seed, so Saturn's wind runs the same direction on every visit and on
 * every machine. Where in its travel the wave happens to be when you
 * arrive is appearance, and depends on nothing but the clock. Nothing
 * here feeds back into generation, so none of it can move a worldId.
 *
 * WHAT IS HERE NOW THAT WAS NOT
 *
 * Season. A realm's place on the summer→winter grade, drawn from the
 * seed the same way the wind bearing is. Geometry does not depend on
 * it — vertex colours stay the summer palette — so moving the blend is
 * a uniform write, which is the whole point of the colour LUT seam
 * (see colorLut.js). The snowline and the sun direction still wait:
 * setSnowline() is ready for the first, and the sun is still a fixed
 * light in the scene for the second.
 */
import { createRng } from '../../engine/generation/rng.js'

const TAU = Math.PI * 2

export const WIND = Object.freeze({
  /**
   * How far the very TOP of a plant leans at full gust, as a fraction
   * of its own height.
   *
   * Read that definition carefully, because a cautious-looking number
   * here arrives on screen far smaller than it reads. Three factors
   * multiply it down before anything moves:
   *
   *   - the gust envelope averages 0.75 of full (see gustDepth),
   *   - the bend is weighted by the SQUARE of height above the base, and
   *     a crown's centre sits at 0.6-0.8 of the tree, so that weight is
   *     0.35 for a conifer and 0.54 for a broadleaf, not 1,
   *   - what the eye tracks is the crown's middle, not its topmost vertex.
   *
   * At 0.09 that came to a 2-5% lean at the crown centre, which is about
   * ONE PIXEL on a tree fifty pixels tall. It was measured working, on a
   * frame diff, and was invisible to look at — the same trap as snow on
   * trees, one layer further out: the mechanism was verified and the
   * amount never was.
   *
   * 0.20 puts a broadleaf's crown at about 8% of its height typically
   * and 16% at the peak of a gust, which is a bough moving rather than a
   * hint. The failure mode in the other direction is "rubbery", since
   * this is a smooth bend with no branch structure to break it up, so
   * this is deliberately short of what the number could take.
   */
  sway: 0.2,
  /**
   * Distance between wave crests, in grid cells — and since one cell is
   * one world unit of arc in both projections, in world units too.
   *
   * This is the number that decides whether the motion reads as weather.
   * Short wavelengths make neighbouring trees disagree, which looks like
   * each one twitching on its own; this is a few dozen cells so a whole
   * hillside leans, pauses and leans again together.
   */
  waveLength: 34,
  /**
   * Crests travelling past a fixed point, in radians per second.
   *
   * 1.1 gave a 5.7-second oscillation, which is slow enough to read as
   * the camera drifting rather than as air moving. Just under 2 puts it
   * near three seconds — a breeze, with the slow swell of the gust
   * envelope still underneath it.
   */
  speed: 1.95,
  /** Seconds for one full swell of the gust envelope. */
  gustPeriod: 13,
  /**
   * How much of the sway the swell takes away at its lowest. 1 would
   * bring the canopy to a complete stop between gusts, which reads as a
   * bug rather than as calm.
   */
  gustDepth: 0.55,
})

/**
 * Creates the environment for one world.
 *
 * @param {{ seed?: number, reducedMotion?: boolean }} options
 *   `seed` is the world's own seed, so the wind is a property of the
 *   realm. `reducedMotion` freezes the clock; see the header.
 * @returns {{ windDirection: { x: number, y: number }, gustPhase: number, season: number, animated: boolean }}
 *   windDirection is a unit vector in GRID space (x across the width, y
 *   down the height), the same frame the terrain arrays use. Converting
 *   it into a world direction is the renderer's job, because only the
 *   renderer knows how the world group is turned.
 *   `season` is how far this realm sits toward winter, in [0, 1] — see
 *   the header. Squared so most realms stay near summer and a few lean
 *   cold; a flat draw would put the average world at mid-winter and
 *   quietly cool the whole shelf.
 */
export function createEnvironment({ seed = 1, reducedMotion = false } = {}) {
  const rng = createRng(Number(seed) || 1)
  const bearing = rng() * TAU
  // A second draw rather than a function of the first, so two realms
  // whose winds happen to blow the same way are not also gusting in
  // step with each other.
  const gustPhase = rng() * TAU
  // A third draw, and squared: the mean of U² on [0, 1] is 1/3, so a
  // typical realm keeps most of its summer palette and the ones that
  // lean winter do so because of their seed, not because the shelf
  // average drifted.
  const seasonRoll = rng()
  const season = seasonRoll * seasonRoll

  return {
    windDirection: { x: Math.cos(bearing), y: Math.sin(bearing) },
    gustPhase,
    season,
    animated: !reducedMotion,
  }
}

/**
 * Reads the environment at a moment. Pure: same arguments, same answer,
 * which is what lets the wind be tested without a GL context.
 *
 * @param {ReturnType<createEnvironment>} environment
 * @param {number} clockSeconds monotonic seconds, e.g. performance.now() * 0.001
 * @returns {{ time: number, windDirection: { x: number, y: number }, sway: number, season: number, animated: boolean }}
 *   `sway` is the lean at a plant's top as a fraction of its height, so
 *   a shrub and an emergent both bend by the same PROPORTION and the
 *   caller multiplies by whatever it is drawing.
 *   `season` is forwarded unchanged: it is placement, not appearance,
 *   and does not tick with the clock.
 */
export function sampleEnvironment(environment, clockSeconds) {
  // A frozen world is not a still frame of a moving one: time itself
  // stops at zero, so every phase is fixed and nothing drifts even if
  // the loop keeps running for the sake of hover and camera damping.
  if (!environment.animated) {
    return {
      time: 0,
      windDirection: environment.windDirection,
      sway: 0,
      season: environment.season,
      animated: false,
    }
  }

  const time = Math.max(0, Number(clockSeconds) || 0)
  const swell = 0.5 + 0.5 * Math.sin((time / WIND.gustPeriod) * TAU + environment.gustPhase)

  return {
    time,
    windDirection: environment.windDirection,
    sway: WIND.sway * (1 - WIND.gustDepth + WIND.gustDepth * swell),
    season: environment.season,
    animated: true,
  }
}

/**
 * Radians of wave per world unit travelled along the wind.
 *
 * Its own export because the shader wants a frequency and this module
 * would rather state a wavelength, which is the version a person can
 * picture against a hillside.
 */
export function windFrequency() {
  return TAU / WIND.waveLength
}
