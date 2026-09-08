/**
 * The material had no tests, on the assumption that anything behind the
 * WebGL gate needs a GL context. Building a ShaderMaterial does not —
 * only drawing with one does — so its uniforms and its GLSL are both
 * ordinary values that can be read here.
 *
 * That assumption is worth naming, because it is the same one that let
 * snow on trees ship working and unreachable: every part was verified
 * except whether anything joined them up. Most of what follows checks
 * joins rather than behaviour — that a uniform written by JS is read by
 * the shader, and that the band a caller asks for is the band it gets.
 */
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { ALTITUDE } from '../../../src/engine/generation/config.js'
import { WIND, createEnvironment, sampleEnvironment, windFrequency } from '../../../src/ui/rendering/environment.js'
import { createStylizedMaterial, setSnowline, setWind } from '../../../src/ui/rendering/stylizedMaterial.js'

const WIND_UNIFORMS = ['uTime', 'uWindDirection', 'uWindFrequency', 'uWindSpeed', 'uSway', 'uSwayHeight']

describe('createStylizedMaterial', () => {
  it('starts still, so a material nobody drives does not drift', () => {
    const material = createStylizedMaterial()

    expect(material.uniforms.uTime.value).toBe(0)
    expect(material.uniforms.uSway.value).toBe(0)
  })

  it('gives the terrain no height to sway through', () => {
    // Belt and braces with the #ifdef: the terrain is not instanced so
    // the branch is compiled out of its program entirely, and its
    // swayHeight is zero even so.
    expect(createStylizedMaterial({ vertexColors: true }).uniforms.uSwayHeight.value).toBe(0)
  })

  it('flat shades through a define, because the property is ignored', () => {
    // The bug this pins down: `flatShading: true` on a ShaderMaterial
    // does nothing at all. Material.setValues skips keys the material
    // does not already own, so the canopy asked for facets and got
    // smoothly shaded balls — and nothing failed, because the only
    // complaint was a console warning. Compared side by side the
    // difference is not subtle, which is the awkward part: the look the
    // code described was never the look on screen.
    const canopy = createStylizedMaterial({ flatShading: true })
    const terrain = createStylizedMaterial({ vertexColors: true })

    expect(canopy.defines).toHaveProperty('FLAT_SHADED')
    expect(terrain.defines).not.toHaveProperty('FLAT_SHADED')
    // And the property really is absent, rather than both being set.
    expect(canopy.flatShading).toBeUndefined()
  })

  it('carries the wavelength the environment states', () => {
    // Two modules agreeing by construction rather than by two constants
    // that happen to match today.
    expect(createStylizedMaterial().uniforms.uWindFrequency.value).toBeCloseTo(windFrequency(), 12)
    expect(createStylizedMaterial().uniforms.uWindSpeed.value).toBe(WIND.speed)
  })

  it('takes the snow band it is given, and defaults to the ground s', () => {
    const ground = createStylizedMaterial()
    expect(ground.uniforms.uSnowStart.value).toBe(ALTITUDE.snowStart)
    expect(ground.uniforms.uSnowFull.value).toBe(ALTITUDE.snowFull)

    // The canopy frosts from lower down; see ALTITUDE.frostStart.
    const canopy = createStylizedMaterial({
      snowline: { start: ALTITUDE.frostStart, full: ALTITUDE.frostFull },
    })
    expect(canopy.uniforms.uSnowStart.value).toBe(ALTITUDE.frostStart)
    expect(canopy.uniforms.uSnowFull.value).toBe(ALTITUDE.frostFull)
  })

  it('does not share uniform objects between materials', () => {
    // The canopy and the terrain are two materials with different bands
    // and different sway. A shared uniform object would make setting one
    // set the other, and the symptom would be swaying terrain.
    const a = createStylizedMaterial({ swayHeight: 3 })
    const b = createStylizedMaterial({ swayHeight: 9 })

    setWind(a, { time: 5, sway: 0.5 }, new THREE.Vector3(1, 0, 0))

    expect(b.uniforms.uTime.value).toBe(0)
    expect(b.uniforms.uSway.value).toBe(0)
    expect(b.uniforms.uSwayHeight.value).toBe(9)
  })
})

describe('setWind', () => {
  it('writes a frame of weather onto the material', () => {
    const material = createStylizedMaterial({ swayHeight: 4 })
    const environment = createEnvironment({ seed: 3 })
    const sample = sampleEnvironment(environment, 6)

    setWind(material, sample, new THREE.Vector3(0, 0, -1))

    expect(material.uniforms.uTime.value).toBe(sample.time)
    expect(material.uniforms.uSway.value).toBe(sample.sway)
    expect(material.uniforms.uWindDirection.value.z).toBe(-1)
  })

  it('copies the direction rather than holding the caller s vector', () => {
    // The render loop reuses one Vector3 every frame. Keeping a
    // reference would work by accident and break the moment a second
    // material wanted a different direction.
    const material = createStylizedMaterial({ swayHeight: 4 })
    const shared = new THREE.Vector3(1, 0, 0)

    setWind(material, { time: 1, sway: 0.1 }, shared)
    shared.set(0, 0, 1)

    expect(material.uniforms.uWindDirection.value.x).toBe(1)
    expect(material.uniforms.uWindDirection.value.z).toBe(0)
  })

  it('stops the material dead when the environment is frozen', () => {
    const material = createStylizedMaterial({ swayHeight: 4 })
    const still = createEnvironment({ seed: 3, reducedMotion: true })

    setWind(material, sampleEnvironment(still, 900), new THREE.Vector3(1, 0, 0))

    // Both matter: a sway of 0 skips the branch, and a time of 0 means
    // the wave is not still advancing underneath a zero amplitude,
    // waiting to jump when motion is allowed again.
    expect(material.uniforms.uSway.value).toBe(0)
    expect(material.uniforms.uTime.value).toBe(0)
  })
})

describe('the shader reads what JS writes', () => {
  const material = createStylizedMaterial({ swayHeight: 4 })

  it.each(WIND_UNIFORMS)('%s is declared and used in the vertex shader', (name) => {
    // The failure this catches is a uniform that exists, is written
    // every frame, and is read by nobody — which is indistinguishable
    // from working code until you look at the screen. Renaming one in
    // the GLSL without renaming it here fails this.
    const declaration = new RegExp(`uniform\\s+\\w+\\s+${name}\\s*;`)
    expect(material.vertexShader).toMatch(declaration)

    const uses = material.vertexShader.split(name).length - 1
    expect(uses).toBeGreaterThan(1)
  })

  it('moves nothing that is not instanced', () => {
    // The terrain shares this material. The wind must be inside the
    // instancing guard, not merely multiplied by a uniform that happens
    // to be zero — a mountain range breathing is not a subtle bug, but
    // it is one that only shows up on screen.
    const [, afterGuard = ''] = material.vertexShader.split('#ifdef USE_INSTANCING')
    expect(afterGuard).toContain('uSway')

    const beforeGuard = material.vertexShader.split('#ifdef USE_INSTANCING')[0]
    expect(beforeGuard).not.toContain('uSway *')
  })

  it('bends by height above the base, not uniformly', () => {
    // A rigid slide is the wrong look and the easy mistake: the whole
    // point is that the trunk stays in the ground. The weighting is what
    // makes it a bend, so it is asserted rather than assumed.
    expect(material.vertexShader).toMatch(/transformed\.z\s*\/\s*uSwayHeight/)
  })
})

describe('setSnowline', () => {
  it('moves the band with no geometry rebuilt', () => {
    // The property the whole material exists for: appearance is a
    // number, so a snowline can move at any time.
    const material = createStylizedMaterial()
    setSnowline(material, { start: 0.4, full: 0.6 })

    expect(material.uniforms.uSnowStart.value).toBe(0.4)
    expect(material.uniforms.uSnowFull.value).toBe(0.6)
  })
})
