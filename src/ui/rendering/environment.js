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
 * WHAT IS DELIBERATELY NOT HERE YET
 *
 * The snowline, the sun direction and a season blend all belong in this
 * object — they are the same shape of thing, a uniform's worth of state
 * that no geometry depends on. They are left out because nothing reads
 * them yet and a field with no reader cannot be wrong in a way a test
 * would catch. setSnowline() in stylizedMaterial.js is the seam they
 * will arrive through.
 */
import { createRng } from '../../engine/generation/rng.js'

const TAU = Math.PI * 2

export const WIND = Object.freeze({
  /**
   * How far the top of a plant leans at full gust, as a fraction of its
   * own height. Deliberately small: this is a breeze moving a canopy,
   * and the failure mode of a generous number is not "windy" but
   * "rubbery", because the sway is a smooth bend with no branch to
   * break it up.
   */
  sway: 0.09,
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
  /** Crests travelling past a fixed point, in radians per second. */
  speed: 1.1,
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
 * @returns {{ windDirection: { x: number, y: number }, gustPhase: number, animated: boolean }}
 *   windDirection is a unit vector in GRID space (x across the width, y
 *   down the height), the same frame the terrain arrays use. Converting
 *   it into a world direction is the renderer's job, because only the
 *   renderer knows how the world group is turned.
 */
export function createEnvironment({ seed = 1, reducedMotion = false } = {}) {
  const rng = createRng(Number(seed) || 1)
  const bearing = rng() * TAU
  // A second draw rather than a function of the first, so two realms
  // whose winds happen to blow the same way are not also gusting in
  // step with each other.
  const gustPhase = rng() * TAU

  return {
    windDirection: { x: Math.cos(bearing), y: Math.sin(bearing) },
    gustPhase,
    animated: !reducedMotion,
  }
}

/**
 * Reads the environment at a moment. Pure: same arguments, same answer,
 * which is what lets the wind be tested without a GL context.
 *
 * @param {ReturnType<createEnvironment>} environment
 * @param {number} clockSeconds monotonic seconds, e.g. performance.now() * 0.001
 * @returns {{ time: number, windDirection: { x: number, y: number }, sway: number, animated: boolean }}
 *   `sway` is the lean at a plant's top as a fraction of its height, so
 *   a shrub and an emergent both bend by the same PROPORTION and the
 *   caller multiplies by whatever it is drawing.
 */
export function sampleEnvironment(environment, clockSeconds) {
  // A frozen world is not a still frame of a moving one: time itself
  // stops at zero, so every phase is fixed and nothing drifts even if
  // the loop keeps running for the sake of hover and camera damping.
  if (!environment.animated) {
    return { time: 0, windDirection: environment.windDirection, sway: 0, animated: false }
  }

  const time = Math.max(0, Number(clockSeconds) || 0)
  const swell = 0.5 + 0.5 * Math.sin((time / WIND.gustPeriod) * TAU + environment.gustPhase)

  return {
    time,
    windDirection: environment.windDirection,
    sway: WIND.sway * (1 - WIND.gustDepth + WIND.gustDepth * swell),
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
