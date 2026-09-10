import { describe, expect, it } from 'vitest'
import { BIOME } from '../../../src/engine/generation/terrain.js'
import {
  clampWanderToOcean,
  separateSwimPositions,
} from '../../../src/ui/rendering/creatureMotion.js'
import { creaturePose } from '../../../src/ui/rendering/creatures.js'

describe('clampWanderToOcean', () => {
  it('pulls a landward wander back onto ocean instead of snapping home', () => {
    const width = 8
    const height = 8
    const biomeMap = new Uint8Array(width * height).fill(BIOME.OCEAN)
    // Right half is land.
    for (let y = 0; y < height; y += 1) {
      for (let x = 4; x < width; x += 1) {
        biomeMap[y * width + x] = BIOME.MEADOW
      }
    }

    const clamped = clampWanderToOcean(6.2, 3, 2, 3, biomeMap, width, height, 'clownfish')
    expect(clamped.gx).toBeLessThan(4)
    expect(clamped.gx).toBeGreaterThan(2)
    expect(clamped.gy).toBeCloseTo(3, 5)
  })
})

describe('separateSwimPositions', () => {
  it('pushes overlapping fish apart', () => {
    const xs = new Float32Array([10, 10.2, 10.1])
    const ys = new Float32Array([10, 10.1, 10.2])
    separateSwimPositions(xs, ys, 3, 2)
    const d01 = Math.hypot(xs[1] - xs[0], ys[1] - ys[0])
    const d02 = Math.hypot(xs[2] - xs[0], ys[2] - ys[0])
    const d12 = Math.hypot(xs[2] - xs[1], ys[2] - ys[1])
    expect(d01).toBeGreaterThan(1.5)
    expect(d02).toBeGreaterThan(1.5)
    expect(d12).toBeGreaterThan(1.5)
  })
})

describe('creaturePose breach bob', () => {
  it('lifts enough to crest partly out of the water', () => {
    let maxLift = 0
    for (let t = 0; t < 5; t += 0.05) {
      const pose = creaturePose(t, {
        phase: 0.1,
        gaitSpeed: 1,
        hopHeight: 0.4,
        gait: 'breach',
        scale: 4,
        squat: 1,
      })
      maxLift = Math.max(maxLift, pose.lift)
    }
    expect(maxLift).toBeGreaterThan(0.8)
    expect(maxLift).toBeLessThan(2.5)
  })
})
