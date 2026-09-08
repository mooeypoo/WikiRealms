import { describe, expect, it } from 'vitest'
import { WIND, createEnvironment, sampleEnvironment, windFrequency } from '../../../src/ui/rendering/environment.js'

const TAU = Math.PI * 2

describe('createEnvironment', () => {
  it('gives every realm a wind bearing of its own, from its own seed', () => {
    // The determinism rule this module exists under: which way the wind
    // blows is PLACEMENT and comes from the seed, so a realm's weather
    // is the same on every visit and on every machine.
    const a = createEnvironment({ seed: 4242 })
    const again = createEnvironment({ seed: 4242 })
    const other = createEnvironment({ seed: 9001 })

    expect(a.windDirection).toEqual(again.windDirection)
    expect(a.gustPhase).toBe(again.gustPhase)
    expect(other.windDirection).not.toEqual(a.windDirection)
  })

  it('states the bearing as a unit vector', () => {
    // The renderer turns this into a world direction and the shader
    // assumes it needs no normalising of its own.
    for (const seed of [1, 2, 17, 1024, 88888]) {
      const { windDirection } = createEnvironment({ seed })
      expect(Math.hypot(windDirection.x, windDirection.y)).toBeCloseTo(1, 12)
    }
  })

  it('draws the gust phase separately from the bearing', () => {
    // Two realms whose winds happen to blow the same way should not also
    // be gusting in step, which a phase derived from the bearing would
    // guarantee.
    const phases = new Set()
    const bearings = new Set()
    for (let seed = 1; seed <= 40; seed += 1) {
      const environment = createEnvironment({ seed })
      phases.add(environment.gustPhase)
      bearings.add(environment.windDirection.x)
    }

    expect(phases.size).toBe(40)
    expect(bearings.size).toBe(40)
  })
})

describe('sampleEnvironment', () => {
  const environment = createEnvironment({ seed: 7 })

  it('is pure: the same moment reads the same twice', () => {
    expect(sampleEnvironment(environment, 3.25)).toEqual(sampleEnvironment(environment, 3.25))
  })

  it('swells and falls on the gust period', () => {
    // A full period later is the same point in the swell, and halfway
    // through is somewhere else — otherwise the envelope is not doing
    // anything and the canopy moves at one constant rate.
    const start = sampleEnvironment(environment, 0)
    const cycle = sampleEnvironment(environment, WIND.gustPeriod)
    const half = sampleEnvironment(environment, WIND.gustPeriod / 2)

    expect(cycle.sway).toBeCloseTo(start.sway, 10)
    expect(half.sway).not.toBeCloseTo(start.sway, 3)
  })

  it('never stops the canopy dead and never overshoots the cap', () => {
    // A gust that reaches zero reads as a bug rather than as calm, and
    // one that exceeds WIND.sway would bend a plant further than the
    // constant says is possible.
    let low = Infinity
    let high = -Infinity
    for (let time = 0; time < WIND.gustPeriod * 2; time += 0.05) {
      const { sway } = sampleEnvironment(environment, time)
      low = Math.min(low, sway)
      high = Math.max(high, sway)
    }

    expect(low).toBeGreaterThan(0)
    expect(high).toBeLessThanOrEqual(WIND.sway + 1e-12)
    // The swell has to be worth having: a barely-varying envelope is
    // indistinguishable from a constant one.
    expect(high - low).toBeGreaterThan(WIND.sway * 0.3)
  })

  it('treats a nonsense clock as the beginning of time', () => {
    for (const clock of [undefined, null, Number.NaN, -5]) {
      expect(sampleEnvironment(environment, clock).time).toBe(0)
    }
  })
})

describe('reduced motion', () => {
  const still = createEnvironment({ seed: 7, reducedMotion: true })

  it('stops the clock rather than slowing what reads it', () => {
    // The single lever the whole 3D view hangs off: the wind, the portal
    // pulse and the halo breathing all take their time from here, so a
    // frozen clock holds all three still without any of them carrying a
    // second code path for it.
    for (const clock of [0, 5, 500, 50000]) {
      const sample = sampleEnvironment(still, clock)
      expect(sample.time).toBe(0)
      expect(sample.sway).toBe(0)
      expect(sample.animated).toBe(false)
    }
  })

  it('keeps the bearing, so nothing downstream has to handle a missing one', () => {
    expect(Math.hypot(still.windDirection.x, still.windDirection.y)).toBeCloseTo(1, 12)
  })
})

describe('windFrequency', () => {
  it('is the wavelength the constants state, as radians per world unit', () => {
    expect(windFrequency()).toBeCloseTo(TAU / WIND.waveLength, 12)
  })

  it('is long enough that neighbouring plants lean together', () => {
    // The invariant that separates weather from a field of independent
    // fidgets. One grid cell apart, two plants must be at nearly the
    // same point in the wave; a short wavelength is what makes a canopy
    // look like it is shivering rather than being blown.
    const phaseAcrossOneCell = windFrequency() * 1

    expect(phaseAcrossOneCell).toBeLessThan(0.25)
    // And not so long that the whole world moves as one rigid sheet,
    // which reads as the camera moving rather than the trees.
    expect(windFrequency() * 256).toBeGreaterThan(TAU)
  })
})
