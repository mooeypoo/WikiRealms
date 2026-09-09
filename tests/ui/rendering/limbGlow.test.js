import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  LIMB_GLOW,
  buildLimbGlow,
  limbIntensity,
  limbShellRadius,
} from '../../../src/ui/rendering/limbGlow.js'
import { SPHERE_VIEW } from '../../../src/ui/rendering/projection.js'

describe('limbShellRadius', () => {
  it('clears every peak and then some', () => {
    // A cell at height 1 sits at planetRadius + heightScale. The shell
    // has to be outside that, or the tallest summit punches through the
    // atmosphere and the glow wears a hole.
    const radius = 100
    const heightScale = radius * SPHERE_VIEW.reliefRatio
    const shell = limbShellRadius(radius, heightScale)

    expect(shell).toBeGreaterThan(radius + heightScale)
    expect(shell).toBeCloseTo(radius + heightScale + radius * LIMB_GLOW.thickness, 10)
  })

  it('defaults the relief to the sphere’s own when only a radius is given', () => {
    expect(limbShellRadius(80)).toBeCloseTo(limbShellRadius(80, 80 * SPHERE_VIEW.reliefRatio), 10)
  })
})

describe('limbIntensity', () => {
  it('is brightest when looking along the shell, not into it', () => {
    // facing 0 is grazing — the limb. facing 1 is looking straight at
    // the shell, where the air is thinnest along the view ray.
    const limb = limbIntensity(0, 1)
    const faceOn = limbIntensity(1, 1)

    expect(limb).toBeGreaterThan(faceOn)
    expect(faceOn).toBe(0)
    expect(limb).toBeCloseTo(LIMB_GLOW.strength, 10)
  })

  it('keeps a quieter night limb rather than extinguishing it', () => {
    // dayBias of 1 would zero the night side and leave the terminator
    // looking like the planet had no air on half of it. The night limb
    // has to stay visible for the dark-side audit that follows this.
    const day = limbIntensity(0, 1)
    const night = limbIntensity(0, -1)

    expect(night).toBeGreaterThan(0)
    expect(night).toBeLessThan(day)
    expect(night / day).toBeCloseTo(1 - LIMB_GLOW.dayBias, 10)
  })

  it('agrees with the shader’s pow and mix', () => {
    // The numbers the GLSL writes: pow(1 - facing, falloff) *
    // (1 - dayBias + dayBias * sun) * strength. If this drifts from the
    // shader the tuning knobs stop meaning what the comments say.
    const facing = 0.3
    const sunFacing = 0.2
    const sun = 0.5 + 0.5 * sunFacing
    const expected =
      Math.pow(1 - facing, LIMB_GLOW.falloff) *
      (1 - LIMB_GLOW.dayBias + LIMB_GLOW.dayBias * sun) *
      LIMB_GLOW.strength

    expect(limbIntensity(facing, sunFacing)).toBeCloseTo(expected, 12)
  })
})

describe('buildLimbGlow', () => {
  it('builds a BackSide additive shell outside the peaks', () => {
    const mesh = buildLimbGlow({
      radius: 100,
      heightScale: 15,
      color: new THREE.Color(0x34597c),
      sunDirection: new THREE.Vector3(1, 2, 0.5),
    })

    expect(mesh.geometry.type).toBe('SphereGeometry')
    // SphereGeometry stores the radius on its parameters.
    expect(mesh.geometry.parameters.radius).toBeCloseTo(limbShellRadius(100, 15), 10)
    expect(mesh.material.side).toBe(THREE.BackSide)
    expect(mesh.material.blending).toBe(THREE.AdditiveBlending)
    expect(mesh.material.depthWrite).toBe(false)
    expect(mesh.material.fog).toBe(false)
    expect(mesh.material.transparent).toBe(true)
  })

  it('binds the atmosphere colour and the sun the caller handed over', () => {
    const color = new THREE.Color(0x34597c)
    const sunDirection = new THREE.Vector3(0, 1, 0)
    const mesh = buildLimbGlow({ radius: 50, heightScale: 7, color, sunDirection })

    expect(mesh.material.uniforms.uColor.value.getHex()).toBe(color.getHex())
    expect(mesh.material.uniforms.uSunDirection.value.y).toBeCloseTo(1, 10)
    expect(mesh.material.uniforms.uFalloff.value).toBe(LIMB_GLOW.falloff)
    expect(mesh.material.uniforms.uStrength.value).toBe(LIMB_GLOW.strength)
    // Caller’s vector is copied, not held — same reason setWind copies.
    sunDirection.set(0, 0, 1)
    expect(mesh.material.uniforms.uSunDirection.value.y).toBeCloseTo(1, 10)
  })

  it('declares the fresnel and day mix the intensity function states', () => {
    const mesh = buildLimbGlow({
      radius: 40,
      heightScale: 6,
      color: new THREE.Color(0xffffff),
      sunDirection: new THREE.Vector3(1, 0, 0),
    })
    const { fragmentShader } = mesh.material

    expect(fragmentShader).toContain('pow(1.0 - facing, uFalloff)')
    expect(fragmentShader).toContain('1.0 - uDayBias + uDayBias * sun')
    expect(fragmentShader).toContain('uColor * intensity')
  })
})
