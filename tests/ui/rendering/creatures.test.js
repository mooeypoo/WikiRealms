import { describe, expect, it } from 'vitest'
import {
  CREATURE_SAMPLING,
  creaturePose,
  creatureWander,
} from '../../../src/ui/rendering/creatures.js'

describe('creaturePose', () => {
  it('keeps land hops on the ground with a soft squish', () => {
    const pose = creaturePose(0.4, {
      scale: 2,
      squat: 1,
      gaitSpeed: 1,
      hopHeight: 0.4,
      gait: 'hop',
      phase: 0.1,
    })
    expect(pose.lift).toBe(0)
    expect(Math.abs(pose.squashY / 2 - 1)).toBeLessThan(0.12)
    expect(Math.abs(pose.lean)).toBeLessThan(0.05)
  })

  it('lets sea breach crests peek above the water without leaping', () => {
    let maxLift = 0
    for (let t = 0; t < 4; t += 0.05) {
      const pose = creaturePose(t, {
        scale: 5,
        squat: 1,
        gaitSpeed: 1,
        hopHeight: 0.5,
        gait: 'breach',
        phase: 0.2,
      })
      maxLift = Math.max(maxLift, pose.lift)
    }
    // Enough to crest partly out; well under a full body-length leap.
    expect(maxLift).toBeGreaterThan(1.2)
    expect(maxLift).toBeLessThan(2.5)
  })
})

describe('creatureWander', () => {
  it('gives different phases different pathways', () => {
    const a = creatureWander(3, 0.1, 1, CREATURE_SAMPLING.wanderRadius)
    const b = creatureWander(3, 0.7, 1, CREATURE_SAMPLING.wanderRadius)
    expect(Math.hypot(a.dx - b.dx, a.dy - b.dy)).toBeGreaterThan(0.4)
  })

  it('stays within a modest radius of home', () => {
    const radius = CREATURE_SAMPLING.wanderRadius
    for (let t = 0; t < 20; t += 0.5) {
      const { dx, dy } = creatureWander(t, 0.33, 1, radius)
      expect(Math.hypot(dx, dy)).toBeLessThanOrEqual(radius * 1.05)
    }
  })
})
