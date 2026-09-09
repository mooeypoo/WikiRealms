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
import {
  GROUND_SPECULAR,
  NO_SNOWLINE,
  createStylizedMaterial,
  setRipple,
  setSnowline,
  setSurf,
  setWind,
} from '../../../src/ui/rendering/stylizedMaterial.js'

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
    // That the channel reaches the output, rather than the exact sum in
    // between: the highlight adds a term to that arithmetic.
    expect(material.fragmentShader).toContain('gl_FragColor = vec4(outgoing, alpha);')
    expect(material.fragmentShader).toContain('albedo * irradiance * RECIPROCAL_PI')
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

describe('surf', () => {
  const SHAPE = { ceiling: 0.8, bands: 3, speed: 0.16, sharpness: 3.5, foam: 0.78, color: 0xdff1f5 }

  it('costs a mesh nothing that does not ask for it', () => {
    const material = createStylizedMaterial({})
    expect(material.defines.USE_SURF).toBeUndefined()
    // The branch has to be compiled out, not merely skipped: this runs
    // on every fragment of the sea, and the terrain has far more.
    expect(material.fragmentShader).toContain('#ifdef USE_SURF')
  })

  it('compiles the wave in for a mesh that does', () => {
    const material = createStylizedMaterial({ surf: SHAPE })
    expect(material.defines.USE_SURF).toBe('')
  })

  it('hands the shader the shape it was given', () => {
    const material = createStylizedMaterial({ surf: SHAPE })
    expect(material.uniforms.uSurfCeiling.value).toBe(SHAPE.ceiling)
    expect(material.uniforms.uSurfBands.value).toBe(SHAPE.bands)
    expect(material.uniforms.uSurfSpeed.value).toBe(SHAPE.speed)
    expect(material.uniforms.uSurfSharpness.value).toBe(SHAPE.sharpness)
    expect(material.uniforms.uSurfFoam.value).toBe(SHAPE.foam)
    expect(material.uniforms.uSurfColor.value.getHex()).toBe(SHAPE.color)
  })

  it('starts with the wave off, because only the camera knows', () => {
    // Strength answers a question about the screen, so there is no
    // sensible value before a frame has been sized. Off is the safe one.
    expect(createStylizedMaterial({ surf: SHAPE }).uniforms.uSurf.value).toBe(0)
  })

  it('reads every uniform it declares', () => {
    const material = createStylizedMaterial({ surf: SHAPE })
    const body = material.fragmentShader
    for (const name of ['uSurf', 'uSurfCeiling', 'uSurfBands', 'uSurfSpeed', 'uSurfSharpness', 'uSurfFoam', 'uSurfColor']) {
      expect(Object.keys(material.uniforms)).toContain(name)
      // Declared, and then used somewhere other than its declaration.
      expect(body.split(name).length - 1).toBeGreaterThan(1)
    }
  })

  it('takes the clock in both stages, so the phase can move', () => {
    const material = createStylizedMaterial({ surf: SHAPE })
    expect(material.fragmentShader).toContain('uniform float uTime')
    expect(material.vertexShader).toContain('uniform float uTime')
    // One uniform, shared: two entries would drift apart.
    expect(Object.keys(material.uniforms).filter((k) => k === 'uTime')).toHaveLength(1)
  })

  it('draws the foam under the light, not over the finished pixel', () => {
    // Foam is cover over the albedo like snow, so a dim shore gets dim
    // foam. If this moved below the lighting it would glow at night.
    const body = createStylizedMaterial({ surf: SHAPE }).fragmentShader
    expect(body.indexOf('uSurfColor')).toBeLessThan(body.indexOf('irradiance'))
  })
})

describe('setSurf', () => {
  it('sets the strength the camera asked for', () => {
    const material = createStylizedMaterial({ surf: { ceiling: 0.8, bands: 3, speed: 0.16, sharpness: 3.5, foam: 0.78, color: 0xffffff } })
    setSurf(material, 0.42)
    expect(material.uniforms.uSurf.value).toBeCloseTo(0.42)
  })

  it('clamps, so a strength cannot brighten past foam', () => {
    const material = createStylizedMaterial({ surf: { ceiling: 0.8, bands: 3, speed: 0.16, sharpness: 3.5, foam: 0.78, color: 0xffffff } })
    setSurf(material, 4)
    expect(material.uniforms.uSurf.value).toBe(1)
    setSurf(material, -2)
    expect(material.uniforms.uSurf.value).toBe(0)
    setSurf(material, Number.NaN)
    expect(material.uniforms.uSurf.value).toBe(0)
  })

  it('rebuilds nothing, so the camera can call it every frame', () => {
    const material = createStylizedMaterial({ surf: { ceiling: 0.8, bands: 3, speed: 0.16, sharpness: 3.5, foam: 0.78, color: 0xffffff } })
    const program = material.version
    setSurf(material, 0.7)
    expect(material.version).toBe(program)
  })
})

describe('the sun\'s highlight', () => {
  const SHINE = { strength: 0, snowStrength: 0.55, sharpness: 32 }

  it('compiles out of anything that has no reason to shine', () => {
    // The one term here that runs a pow per fragment. Grass and rock do
    // not reflect, and there are a great many fragments of both.
    const matte = createStylizedMaterial({ vertexColors: true })
    expect(matte.defines).not.toHaveProperty('USE_SPECULAR')

    const shiny = createStylizedMaterial({ specular: SHINE })
    expect(shiny.defines).toHaveProperty('USE_SPECULAR')
  })

  it('adds light rather than painting the surface white', () => {
    // The difference between a highlight and a coat of paint. Snow and
    // foam are cover — they change what the surface IS, so they are lit
    // by it and mix into the albedo. A reflection is not part of the
    // surface, so it lands after the lighting and is never multiplied by
    // the albedo, which is what lets dark water still glint.
    const material = createStylizedMaterial({ specular: SHINE })
    expect(material.fragmentShader).toContain('outgoing += glint')
    // And the albedo is finished being assembled before that point.
    const albedoLast = material.fragmentShader.lastIndexOf('albedo = mix(')
    expect(albedoLast).toBeLessThan(material.fragmentShader.indexOf('outgoing += glint'))
  })

  it('shows no sun where no sun reaches', () => {
    // A glint inside a ridge's shadow is the same error as a lit slope
    // inside one, and this material already knows the answer.
    const material = createStylizedMaterial({ specular: SHINE, sunlight: true })
    expect(material.fragmentShader).toMatch(/glint\s*=\s*directionalLights\[0\]\.color[^;]*vSunlight/)
  })

  it('rides the snow the material already draws', () => {
    // No second attribute and nobody naming a peak: the shader has
    // computed snow cover a few lines above, so the sparkle follows the
    // caps wherever the snowline puts them.
    const material = createStylizedMaterial({ specular: SHINE })
    expect(material.fragmentShader).toContain('uSpecular + uSpecularSnow * cover')
  })

  it('reads every uniform it declares', () => {
    const material = createStylizedMaterial({ specular: SHINE })
    for (const name of ['uSpecular', 'uSpecularSnow', 'uSpecularSharpness']) {
      expect(Object.keys(material.uniforms)).toContain(name)
      expect(material.fragmentShader.split(name).length - 1).toBeGreaterThan(1)
    }
  })

  it('takes its numbers from the caller', () => {
    const material = createStylizedMaterial({ specular: { strength: 0.4, snowStrength: 0.7, sharpness: 48 } })
    expect(material.uniforms.uSpecular.value).toBe(0.4)
    expect(material.uniforms.uSpecularSnow.value).toBe(0.7)
    expect(material.uniforms.uSpecularSharpness.value).toBe(48)
  })
})

describe('GROUND_SPECULAR', () => {
  it('shines on the snow and nowhere else', () => {
    // Wet rock and wet sand do shine, but the shader cannot tell wet
    // from dry — that is a fact about being near water, which lives in
    // the height map rather than in a fragment. A base shine here would
    // gloss every dry cliff in the world to catch one shore.
    expect(GROUND_SPECULAR.strength).toBe(0)
    expect(GROUND_SPECULAR.snowStrength).toBeGreaterThan(0)
  })

  it('keeps the lobe tight enough to read as glitter', () => {
    // Snow is a scatterer full of facets, not a mirror; a broad lobe on
    // it reads as wet plastic.
    expect(GROUND_SPECULAR.sharpness).toBeGreaterThan(8)
  })
})

describe('the sea\'s chop', () => {
  const WAVES = {
    waves: [
      { wavelength: 12, direction: [1, 0, 0], amplitude: 0.4, frequency: 0.5 },
      { wavelength: 6, direction: [0, 1, 0], amplitude: 0.2, frequency: 0.7 },
    ],
  }

  it('compiles out where nothing ripples', () => {
    // It brings a varying and a loop with it, and only the sea has any
    // use for either.
    expect(createStylizedMaterial({}).defines).not.toHaveProperty('USE_RIPPLE')
    expect(createStylizedMaterial({ ripple: WAVES }).defines).toHaveProperty('USE_RIPPLE')
  })

  it('sizes its loop to the wave set rather than the other way round', () => {
    // The count was three, and three made a lattice. It has to stay a
    // number in waterSurface.js.
    const material = createStylizedMaterial({ ripple: WAVES })
    expect(material.defines.RIPPLE_WAVES).toBe('2')
    expect(material.uniforms.uRippleWaves.value).toHaveLength(2)
    expect(material.fragmentShader).toContain('i < RIPPLE_WAVES')
  })

  it('turns each wavelength into a wave vector', () => {
    // A direction times a spatial frequency, so the shader's dot product
    // with a position is a phase in radians. Done here so the wavelength
    // stays written in world units, which is the only form anyone can
    // reason about.
    const material = createStylizedMaterial({ ripple: WAVES })
    const [first, second] = material.uniforms.uRippleWaves.value
    expect(first.length()).toBeCloseTo((Math.PI * 2) / 12, 6)
    expect(second.length()).toBeCloseTo((Math.PI * 2) / 6, 6)
    // Direction preserved, not just magnitude.
    expect(first.x).toBeGreaterThan(0)
    expect(first.y).toBeCloseTo(0, 6)
  })

  it('carries the frequencies the wave set derived', () => {
    const material = createStylizedMaterial({ ripple: WAVES })
    expect(material.uniforms.uRippleFrequencies.value).toEqual([0.5, 0.7])
    expect(material.uniforms.uRippleAmplitudes.value).toEqual([0.4, 0.2])
  })

  it('anchors the chop to the surface, not the screen', () => {
    // Otherwise it swims as the camera moves. The untransformed position
    // is the only frame that stands still while the camera does not.
    const material = createStylizedMaterial({ ripple: WAVES })
    expect(material.vertexShader).toContain('vLocalPosition = position;')
    expect(material.fragmentShader).toContain('varying vec3 vLocalPosition;')
  })

  it('replaces the normal, so the chop reaches the diffuse too', () => {
    // A tilted piece of water faces the sun differently in every
    // respect, and the wrapped diffuse turns that into the light and
    // dark of a moving surface even where no highlight is in frame.
    const material = createStylizedMaterial({ ripple: WAVES })
    expect(material.fragmentShader).toContain('normal = normalize(normalMatrix * rippled);')
    // Before the lighting reads it.
    const perturb = material.fragmentShader.indexOf('normal = normalize(normalMatrix * rippled);')
    expect(perturb).toBeLessThan(material.fragmentShader.indexOf('vec3 irradiance ='))
  })

  it('knows which way is up in either projection', () => {
    // The flat map's surface lies in local XY so its normal is Z; the
    // globe's is radial.
    const material = createStylizedMaterial({ ripple: WAVES, spherical: true })
    expect(material.fragmentShader).toContain('uSpherical > 0.5 ? normalize(vLocalPosition)')
    // And the fragment stage has to declare it: the vertex stage's copy
    // is a different declaration of the same program uniform.
    expect(material.fragmentShader).toContain('uniform float uSpherical;')
  })

  it('reads every uniform it declares', () => {
    const material = createStylizedMaterial({ ripple: WAVES })
    for (const name of ['uRippleWaves', 'uRippleAmplitudes', 'uRippleFrequencies', 'uRippleStrength']) {
      expect(Object.keys(material.uniforms)).toContain(name)
      expect(material.fragmentShader.split(name).length - 1).toBeGreaterThan(1)
    }
  })
})

describe('setRipple', () => {
  const WAVES = { waves: [{ wavelength: 12, direction: [1, 0, 0], amplitude: 0.4, frequency: 0.5 }] }

  it('starts at nothing, so a camera has to ask for it', () => {
    expect(createStylizedMaterial({ ripple: WAVES }).uniforms.uRippleStrength.value).toBe(0)
  })

  it('clamps, and treats nonsense as still water', () => {
    const material = createStylizedMaterial({ ripple: WAVES })
    setRipple(material, 0.42)
    expect(material.uniforms.uRippleStrength.value).toBeCloseTo(0.42)
    setRipple(material, 5)
    expect(material.uniforms.uRippleStrength.value).toBe(1)
    setRipple(material, -3)
    expect(material.uniforms.uRippleStrength.value).toBe(0)
    setRipple(material, Number.NaN)
    expect(material.uniforms.uRippleStrength.value).toBe(0)
  })

  it('rebuilds nothing, so the camera can call it every frame', () => {
    const material = createStylizedMaterial({ ripple: WAVES })
    const program = material.version
    setRipple(material, 0.6)
    expect(material.version).toBe(program)
  })
})

describe('the sky in the sea', () => {
  const SKY = { color: new THREE.Color(0.17, 0.5, 1), strength: 0.62, facing: 0.02, falloff: 1.5 }

  it('compiles out of every surface but the one that reflects', () => {
    expect(createStylizedMaterial({}).defines).not.toHaveProperty('USE_SKY_REFLECTION')
    expect(createStylizedMaterial({ skyReflection: SKY }).defines).toHaveProperty('USE_SKY_REFLECTION')
  })

  it('reflects the sky the scene claims to have, not the backdrop', () => {
    // The backdrop is a starfield, so reflecting what is literally up
    // there returns darkness — measured, the sea moved by -0.2 levels.
    // The ambient term IS this scene's sky: a light with no direction,
    // standing in for one shining from everywhere.
    const material = createStylizedMaterial({ skyReflection: SKY })
    expect(material.fragmentShader).toContain('ambientLightColor * uSkyColor')
  })

  it('takes brightness from the light and colour from the token', () => {
    // Which is what lets a theme repaint the air without also making
    // the sea darker or brighter than the light falling on it.
    const material = createStylizedMaterial({ skyReflection: SKY })
    expect(Math.max(...material.uniforms.uSkyColor.value.toArray())).toBeCloseTo(1, 6)
    expect(material.uniforms.uSkyReflection.value).toBe(0.62)
  })

  it('rises toward grazing rather than tinting flatly', () => {
    const material = createStylizedMaterial({ skyReflection: SKY })
    expect(material.fragmentShader).toContain('pow(1.0 - facing, uSkyReflectionFalloff)')
    expect(material.uniforms.uSkyReflectionFacing.value).toBe(0.02)
    expect(material.uniforms.uSkyReflectionFalloff.value).toBe(1.5)
  })

  it('brings its own opacity', () => {
    // The sea's alpha says how much of the FLOOR it hides, and a
    // reflection is not the floor. Without this the water's own
    // transparency blends away the thing that makes it read as a
    // surface.
    const material = createStylizedMaterial({ skyReflection: SKY, transparent: true })
    expect(material.fragmentShader).toContain('alpha = max(alpha, reflectance);')
  })

  it('lands after the lighting, like the highlight', () => {
    const material = createStylizedMaterial({ skyReflection: SKY })
    const mix = material.fragmentShader.indexOf('outgoing = mix(outgoing, ambientLightColor * uSkyColor')
    expect(mix).toBeGreaterThan(material.fragmentShader.indexOf('vec3 outgoing ='))
    expect(mix).toBeLessThan(material.fragmentShader.indexOf('gl_FragColor ='))
  })

  it('reads every uniform it declares', () => {
    const material = createStylizedMaterial({ skyReflection: SKY })
    for (const name of ['uSkyColor', 'uSkyReflection', 'uSkyReflectionFacing', 'uSkyReflectionFalloff']) {
      expect(Object.keys(material.uniforms)).toContain(name)
      expect(material.fragmentShader.split(name).length - 1).toBeGreaterThan(1)
    }
  })
})
