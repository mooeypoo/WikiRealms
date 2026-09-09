import { describe, expect, it } from 'vitest'
import { CANOPY_ARCHETYPES } from '../../../src/ui/rendering/foliage.js'
import { SEASON, WIND, createEnvironment, sampleEnvironment, windFrequency } from '../../../src/ui/rendering/environment.js'

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

  it('gives every realm a season of its own, from its own seed', () => {
    // Same determinism rule as the wind: season is placement, so Saturn
    // in winter is Saturn in winter on every visit.
    const a = createEnvironment({ seed: 4242 })
    const again = createEnvironment({ seed: 4242 })
    const other = createEnvironment({ seed: 9001 })

    expect(a.season).toBe(again.season)
    expect(a.season).toBeGreaterThanOrEqual(0)
    expect(a.season).toBeLessThanOrEqual(1)
    expect(other.season).not.toBe(a.season)
  })

  it('biases season hard toward summer; peak cold is altitude snow', () => {
    // U^4 * maxBlend: mean ≈ 0.024, never above the cap. The old U²
    // mean of ~1/3 left woods grey on unlucky seeds (Voyager 1 ≈ 1.0).
    let sum = 0
    let high = 0
    const n = 200
    for (let seed = 1; seed <= n; seed += 1) {
      const season = createEnvironment({ seed }).season
      sum += season
      high = Math.max(high, season)
    }

    expect(sum / n).toBeLessThan(0.05)
    expect(high).toBeLessThanOrEqual(SEASON.maxBlend + 1e-12)
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

  it('still forwards the season, which does not tick with the clock', () => {
    // Season is placement. Freezing appearance must not zero it out or
    // every reduced-motion visit would snap to midsummer.
    expect(sampleEnvironment(still, 0).season).toBe(still.season)
    expect(sampleEnvironment(still, 900).season).toBe(still.season)
  })

  it('keeps the bearing, so nothing downstream has to handle a missing one', () => {
    expect(Math.hypot(still.windDirection.x, still.windDirection.y)).toBeCloseTo(1, 12)
  })
})

describe('the sway is big enough to see', () => {
  // The regression this exists for. The wind shipped correct and
  // invisible: the field was right, the height weighting was right, the
  // frame diff proved trees moved — and on screen a crown travelled
  // about one pixel, because three factors nobody had multiplied
  // together took a 9% constant down to 2%.
  //
  // Every other test here asks whether the mechanism works. This one
  // asks how far anything actually moves, which is the only question
  // that could have failed back then.
  //
  // It computes what the shader computes at a crown's centre:
  //   lean / height = wave * sway(t) * lift²,  lift = centre / height
  // with wave at 1, its typical rather than peak magnitude.
  const leanAtCrown = (spec, sway) => {
    const height = spec.trunkHeight + spec.crownHeight
    const lift = Math.min(1, (spec.trunkHeight + spec.crownHeight / 2) / height)
    return sway * lift * lift
  }

  const meanSway = () => {
    const environment = createEnvironment({ seed: 11 })
    let total = 0
    let n = 0
    for (let time = 0; time < WIND.gustPeriod; time += 0.05) {
      total += sampleEnvironment(environment, time).sway
      n += 1
    }
    return total / n
  }

  it('moves a broadleaf crown by several percent of its own height', () => {
    // 7.8% at the time of writing. Below about 4% the motion stops
    // reading as wind at any sensible zoom — that is roughly two pixels
    // on a tree fifty pixels tall, which is where this started.
    expect(leanAtCrown(CANOPY_ARCHETYPES.broadleaf, meanSway())).toBeGreaterThan(0.04)
  })

  it('moves every archetype enough to be worth drawing', () => {
    // Conifers and shrubs are penalised hardest by the squared
    // weighting, since their crowns start low. They are meant to move
    // least — a spruce is stiff — but not imperceptibly.
    for (const [name, spec] of Object.entries(CANOPY_ARCHETYPES)) {
      expect(leanAtCrown(spec, meanSway()), name).toBeGreaterThan(0.025)
    }
  })

  it('does not lean so far that a trunk looks like rubber', () => {
    // The other failure mode, and the reason the constant is not simply
    // large: this is a smooth bend with no branch structure to break it
    // up, so past roughly a quarter of the tree's height it stops
    // looking like timber.
    const peak = WIND.sway * 1.5 // the two-crest wave at full alignment
    for (const [name, spec] of Object.entries(CANOPY_ARCHETYPES)) {
      expect(leanAtCrown(spec, peak), name).toBeLessThan(0.25)
    }
  })

  it('oscillates fast enough to read as air rather than drift', () => {
    // 5.7 seconds read as the camera moving. A couple of seconds reads
    // as a breeze, with the gust envelope swelling underneath it.
    const period = (Math.PI * 2) / WIND.speed
    expect(period).toBeLessThan(4)
    expect(period).toBeGreaterThan(1.5)
    // And the swell has to be clearly slower than the wave, or the two
    // beat against each other instead of layering.
    expect(WIND.gustPeriod).toBeGreaterThan(period * 3)
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
