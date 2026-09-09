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
import { NO_SNOWLINE, createStylizedMaterial, setSnowline, setWind } from '../../../src/ui/rendering/stylizedMaterial.js'

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

  it('reads the occlusion attribute only where one is supplied', () => {
    // An attribute with no buffer bound reads as 0 in GLSL, and 0 here
    // means "lit by no sky at all" — so a mesh that forgot to provide
    // occlusion would render black rather than merely unoccluded. The
    // define is what keeps the failure mode absent instead of dramatic.
    const withOcclusion = createStylizedMaterial({ occlusion: true })
    const without = createStylizedMaterial()

    expect(withOcclusion.defines).toHaveProperty('USE_OCCLUSION')
    expect(without.defines).not.toHaveProperty('USE_OCCLUSION')
    expect(withOcclusion.vertexShader).toContain('attribute float occlusion;')
  })

  it('combines its defines rather than replacing them', () => {
    // The canopy needs both: flat shading for its faceted crowns and
    // occlusion for standing in a ravine. A define object built by
    // assignment rather than merge would silently drop one.
    const canopy = createStylizedMaterial({ flatShading: true, occlusion: true })

    expect(canopy.defines).toHaveProperty('FLAT_SHADED')
    expect(canopy.defines).toHaveProperty('USE_OCCLUSION')
  })

  it('exaggerates occlusion through a uniform, not the baked buffer', () => {
    // Measured with the raw sky fraction, occlusion moved the terrain by
    // a mean of 5 levels out of 255 — geometrically right, too small to
    // see, because it can only touch the ambient term. The exponent
    // doubles that while leaving open ground exactly where it was, since
    // any power of 1 is still 1.
    //
    // In a uniform so the shaped value is a look that can be turned
    // without retracing the scan, and so the attribute stays a true sky
    // fraction that the tests above can reason about.
    const material = createStylizedMaterial({ occlusion: true })

    expect(material.uniforms.uOcclusionStrength.value).toBeGreaterThan(1)
    expect(material.vertexShader).toContain('pow(occlusion, uOcclusionStrength)')
  })

  it('attenuates the ambient term and not the sun', () => {
    // Sky visibility says how much of a hemispherical source reaches a
    // surface. The sun is one direction and either arrives or does not,
    // which is a shadow — a different question. Scaling the directional
    // term by this would dim slopes standing in full sunlight.
    const material = createStylizedMaterial({ occlusion: true })

    expect(material.fragmentShader).toContain('ambientLightColor * vOcclusion')
    expect(material.fragmentShader).not.toContain('directionalLights[0].color * vOcclusion')
  })

  it('reads the sunlight attribute only where one is supplied', () => {
    // Same failure mode as occlusion, one step further: an unbound
    // attribute reads as 0, and 0 sunlight is midnight.
    const withSunlight = createStylizedMaterial({ sunlight: true })
    const without = createStylizedMaterial()

    expect(withSunlight.defines).toHaveProperty('USE_SUNLIGHT')
    expect(without.defines).not.toHaveProperty('USE_SUNLIGHT')
    expect(withSunlight.vertexShader).toContain('attribute float sunlight;')
  })

  it('takes its opacity from the vertex colour, for the sea', () => {
    // No define and no attribute of its own. three's vColor is always a
    // vec4, so alpha rides along in the colour: an itemSize of 4 makes
    // three define USE_COLOR_ALPHA and fill the channel, and an itemSize
    // of 3 leaves it at the 1.0 it was initialised to.
    const material = createStylizedMaterial({ vertexColors: true, transparent: true })
    expect(material.fragmentShader).toContain('alpha = vColor.a;')
    expect(material.fragmentShader).toContain('gl_FragColor = vec4(albedo * irradiance * RECIPROCAL_PI, alpha);')
    expect(material.transparent).toBe(true)
  })

  it('can be given a snowline no surface can reach', () => {
    // snowHeight is a height in [0, 1], so a band starting above 1 never
    // opens whatever the attribute says — including an unbound one.
    const material = createStylizedMaterial({ snowline: NO_SNOWLINE })
    expect(material.uniforms.uSnowStart.value).toBeGreaterThan(1)
    expect(material.uniforms.uSnowFull.value).toBeGreaterThan(material.uniforms.uSnowStart.value)
  })

  it('stays in the opaque pass unless a mesh asks not to', () => {
    expect(createStylizedMaterial({ vertexColors: true }).transparent).toBe(false)
    // Land and sea otherwise share the material completely: one lighting
    // model, so a coastline is lit the same on both sides of itself.
    expect(createStylizedMaterial({ vertexColors: true, transparent: true }).fragmentShader)
      .toBe(createStylizedMaterial({ vertexColors: true }).fragmentShader)
  })

  it('scales the sun by the cast shadow, and only the sun', () => {
    // The mirror of the occlusion rule above, and the other half of the
    // same question. Whether a surface FACES the sun is the dot product;
    // whether the sun REACHES it is the baked shadow. Applying this to
    // the ambient term as well would darken a shadowed surface twice and
    // take away the skylight that is the only thing lighting it.
    const material = createStylizedMaterial({ occlusion: true, sunlight: true })

    expect(material.fragmentShader).toContain('wrapped * wrapped * vSunlight')
    expect(material.fragmentShader).toContain('ambientLightColor * vOcclusion')
    expect(material.fragmentShader).not.toContain('ambientLightColor * vOcclusion * vSunlight')
  })

  it('carries both light terms at once, on one material', () => {
    // The terrain and every vegetation layer take sky visibility AND the
    // cast shadow, so the defines have to coexist with each other and
    // with flat shading.
    const canopy = createStylizedMaterial({ flatShading: true, occlusion: true, sunlight: true })

    expect(Object.keys(canopy.defines).sort()).toEqual(['FLAT_SHADED', 'USE_OCCLUSION', 'USE_SUNLIGHT'])
  })

  it('opts into scene fog, so one range drives every material', () => {
    // `fog: true` is what makes the renderer keep fogColor, fogNear and
    // fogFar current from scene.fog. Without it the uniforms below exist,
    // are read by the shader, and are never written — so the haze would
    // be whatever three's defaults happen to be, applied uniformly, at
    // every depth.
    const material = createStylizedMaterial({ vertexColors: true })

    expect(material.fog).toBe(true)
    expect(material.uniforms).toHaveProperty('fogColor')
    expect(material.uniforms).toHaveProperty('fogNear')
    expect(material.uniforms).toHaveProperty('fogFar')
  })

  it('mixes the haze after converting to the output colour space', () => {
    // A real ordering bug that reads as a palette problem. three hands
    // the shader a fogColor already converted to the output space,
    // because its own materials mix it into an sRGB-encoded value last.
    // Doing it before colorspace_fragment double-converts the haze: the
    // gradient is still there, so nothing looks broken, the distance
    // just goes the wrong colour.
    const { fragmentShader } = createStylizedMaterial()

    expect(fragmentShader.indexOf('#include <fog_fragment>')).toBeGreaterThan(
      fragmentShader.indexOf('#include <colorspace_fragment>'),
    )
  })

  it('takes the view depth after the projection, not before', () => {
    // fog_vertex reads mvPosition, which project_vertex is what creates.
    // Reversed, vFogDepth is computed from an undefined value.
    const { vertexShader } = createStylizedMaterial()

    expect(vertexShader.indexOf('#include <fog_vertex>')).toBeGreaterThan(
      vertexShader.indexOf('#include <project_vertex>'),
    )
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
