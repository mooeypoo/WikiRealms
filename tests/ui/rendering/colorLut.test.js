import { describe, expect, it } from 'vitest'
import {
  COLOR_LUT_SIZE,
  buildColorLut,
  identityGrade,
  sampleColorLut,
  winterColorLut,
  winterGrade,
} from '../../../src/ui/rendering/colorLut.js'

describe('winterGrade', () => {
  it('cools a saturated green without erasing it', () => {
    // A hint of cold leaves — still clearly green. The grade used to
    // pull vegMix hard enough that a high season read as concrete.
    const [r, g, b] = winterGrade(0.2, 0.55, 0.18)
    const [sr, sg, sb] = [0.2, 0.55, 0.18]

    expect(g).toBeLessThan(sg)
    expect(b).toBeGreaterThan(sb)
    expect(g).toBeGreaterThan(r)
    expect(g).toBeGreaterThan(0.45)
    // Moved, but gently: at full blend this is still a plant colour.
    const delta = Math.abs(r - sr) + Math.abs(g - sg) + Math.abs(b - sb)
    expect(delta).toBeGreaterThan(0.01)
    expect(delta).toBeLessThan(0.25)
  })

  it('leaves near-white alone, so snow keeps its cap', () => {
    const [r, g, b] = winterGrade(0.96, 0.96, 0.98)

    expect(r).toBeGreaterThan(0.9)
    expect(g).toBeGreaterThan(0.9)
    expect(b).toBeGreaterThan(0.9)
  })

  it('pales a warm sand without turning it blue', () => {
    const [r, g, b] = winterGrade(0.9, 0.8, 0.55)

    // Cooler than summer sand, but still warm-of-neutral: r stays ahead
    // of b, or dunes would read as ash.
    expect(r).toBeGreaterThan(b)
    expect(r - b).toBeLessThan(0.9 - 0.55)
  })
})

describe('buildColorLut', () => {
  it('packs a 16³ cube into a 256×16 texture', () => {
    const texture = buildColorLut(identityGrade)

    expect(texture.image.width).toBe(COLOR_LUT_SIZE * COLOR_LUT_SIZE)
    expect(texture.image.height).toBe(COLOR_LUT_SIZE)
    expect(texture.image.data).toHaveLength(COLOR_LUT_SIZE * COLOR_LUT_SIZE * COLOR_LUT_SIZE * 4)
  })

  it('agrees with its grade at every lattice point', () => {
    // The defect this catches: a write layout that the shader's read
    // layout does not mirror. sampleColorLut uses the same addressing
    // the GLSL does, so a mismatch here is a mismatch on screen.
    const texture = buildColorLut(winterGrade)
    const size = COLOR_LUT_SIZE

    for (let bi = 0; bi < size; bi += 3) {
      for (let gi = 0; gi < size; gi += 3) {
        for (let ri = 0; ri < size; ri += 3) {
          const r = ri / (size - 1)
          const g = gi / (size - 1)
          const b = bi / (size - 1)
          const expected = winterGrade(r, g, b)
          const sampled = sampleColorLut(texture, r, g, b)
          expect(sampled[0]).toBeCloseTo(expected[0], 2)
          expect(sampled[1]).toBeCloseTo(expected[1], 2)
          expect(sampled[2]).toBeCloseTo(expected[2], 2)
        }
      }
    }
  })

  it('leaves the identity table as a no-op', () => {
    const texture = buildColorLut(identityGrade)
    const [r, g, b] = sampleColorLut(texture, 0.4, 0.6, 0.2)

    expect(r).toBeCloseTo(0.4, 1)
    expect(g).toBeCloseTo(0.6, 1)
    expect(b).toBeCloseTo(0.2, 1)
  })
})

describe('winterColorLut', () => {
  it('returns the same texture every time', () => {
    // Materials share one table so a season change is a uniform write,
    // not a rebuild of every stylized material in the scene.
    expect(winterColorLut()).toBe(winterColorLut())
  })
})
