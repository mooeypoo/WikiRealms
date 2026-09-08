/**
 * The one lit material the world uses, for the terrain and for the trees.
 *
 * WHY NOT MeshStandardMaterial, WHICH THIS REPLACES
 *
 * It was doing physically based rendering for a scene with nothing
 * physical in it. There are two lights — one ambient, one directional —
 * no shadow maps, no environment map, no tone mapping, and roughness was
 * pinned at 0.85/0.95 with metalness at 0. So every fragment ran a
 * Cook-Torrance BRDF, sampled an IBL path that resolves to nothing, and
 * arrived at an answer a diffuse term could have given.
 *
 * That cost was not the reason to change it, though it is welcome on a
 * phone. The reason is that appearance had nowhere to live. Snow was
 * mixed into vertex and instance colours at build time, so a snowline
 * could not move without regenerating the world, and it whitened a
 * tree's shaded underside as much as its crown. Wind will want to
 * displace vertices next. Neither is expressible as a parameter of a
 * standard material.
 *
 * WHAT IT DOES INSTEAD
 *
 * Half-Lambert diffuse: `(dot(N, L) * 0.5 + 0.5)²`, Valve's wrap, rather
 * than `max(dot(N, L), 0)`. It never reaches black on the facing-away
 * side, so a hillside turned from the sun keeps its band colour instead
 * of going to silhouette, and the terminator is soft rather than a hard
 * line across a peak. That is most of the difference between this
 * reading as a diagram and reading as a place, and it is the same
 * reason cel-shaded games use it.
 *
 * Lighting is read from the scene's own lights (`lights: true` and
 * three's `lights_pars_begin`), not from parameters passed in here. The
 * projection already sets ambient intensity per view — a globe needs a
 * real terminator, the flat map would be unreadably black with one — and
 * that has to keep working without this module knowing about it.
 *
 * BUILT ON THREE'S OWN CHUNKS, ON PURPOSE
 *
 * The `#include`s are not decoration. `project_vertex` and
 * `defaultnormal_vertex` are what make instancing work: they apply
 * `instanceMatrix` to the position and to the normal, which the canopy's
 * InstancedMesh depends on for all of its trees. `color_vertex`
 * multiplies BOTH the per-vertex `color` attribute and the per-instance
 * `instanceColor` into `vColor`, which is why one material serves the
 * terrain (per-vertex) and the canopy (per-instance) without a branch
 * here. `colorspace_fragment` performs the working-space to output
 * conversion the renderer expects; omitting it is the classic way a
 * hand-written material comes out looking washed out.
 *
 * Hand-rolling any of that would mean maintaining a copy of whatever
 * three does this version, which is precisely the fragility a custom
 * material is otherwise accused of.
 *
 * SNOW
 *
 * Snow is cover over an albedo, applied before the lighting so that it
 * is lit like the surface it sits on rather than pasted over the top.
 *
 * Two things gate it. `snowHeight`, per vertex or per instance, is how
 * high this surface sits in [0, 1] — or a negative number, meaning "this
 * surface takes no snow at any altitude", which is how water and the
 * polar caps opt out. And the world-space normal against the world's own
 * up, so cover lands on what faces the sky: caps on crowns, clean
 * undersides, and a north face that stays rock.
 *
 * The altitude rule itself is a smoothstep between two uniforms, so the
 * snowline is a number that can move at any time with nothing rebuilt.
 * Which cells are ELIGIBLE remains a decision made in JS — see
 * biomeSnowCover and computeGroundAttributes — because that part is
 * policy, and policy in a shader cannot be tested.
 *
 * The band is per material, and the two meshes do not share one: the
 * canopy frosts from ALTITUDE.frostStart, well below the ground's
 * snowStart. That is a deliberate split, not drift — see the config for
 * the measurement that forced it.
 *
 * WIND
 *
 * Plants lean along a single travelling wave sampled at their ROOT in
 * world space, not per instance. That choice is the whole difference
 * between weather and a fidget: trees standing near each other sit close
 * together in the field, so a hillside leans, pauses and leans again as
 * one thing. Sampling per instance, or at the moving vertex rather than
 * the root, both produce the same wrong result — every crown keeping its
 * own time.
 *
 * The bend is weighted by height above the plant's own base and squared,
 * so a trunk stays in the ground while its crown travels. It is applied
 * to `transformed` before project_vertex, which means it costs one
 * vertex shader branch and nothing on the CPU: no per-frame matrix
 * writes, no instanceMatrix uploads, no rebuild.
 *
 * Only instanced geometry is moved. The terrain shares this material and
 * `#ifdef USE_INSTANCING` compiles the branch out of it, rather than
 * leaving a uniform at zero and trusting nobody sets it.
 *
 * WORLD UP IS NOT ONE DIRECTION
 *
 * On the flat map every surface shares an up: the world group is rotated
 * -90° about X, so the mesh's local +Z is world +Y. On the planet, up is
 * the radial from the world's centre, different for every vertex. The
 * `uSpherical` uniform picks between them, and gets it wrong in a very
 * visible way if confused — snow gathering on one side of the globe
 * rather than on every summit.
 */
import * as THREE from 'three'
import { ALTITUDE } from '../../engine/generation/config.js'
import { SNOW_RGB } from './biomeColor.js'
import { WIND, windFrequency } from './environment.js'

/**
 * How square-on to the sky a surface must be before it holds any snow.
 *
 * A cosine, so 0 would let a vertical face carry as much as a flat one
 * and 1 would allow snow only on the perfectly level. This sits low
 * enough that a mountain's shoulders keep their caps, and high enough
 * that a trunk and the underside of a crown stay bare — which is the
 * whole visual point of gating on the normal at all.
 */
const SNOW_FACING_START = 0.35

/** Snow's albedo, from the palette the 2D map and the legend also use. */
const SNOW_COLOR = new THREE.Color(
  SNOW_RGB[0] / 255,
  SNOW_RGB[1] / 255,
  SNOW_RGB[2] / 255,
)

const vertexShader = /* glsl */ `
#include <common>
#include <color_pars_vertex>
#include <normal_pars_vertex>

uniform float uSpherical;

uniform float uTime;
uniform vec3 uWindDirection;
uniform float uWindFrequency;
uniform float uWindSpeed;
uniform float uSway;
uniform float uSwayHeight;

// Per vertex on the terrain, per instance on the canopy. Negative means
// this surface never takes snow, whatever the snowline does.
attribute float snowHeight;

// Needed by normal_fragment_begin, which derives a face normal from its
// screen-space derivatives when the material is flat shaded.
varying vec3 vViewPosition;
varying float vSnowHeight;
varying float vFacingUp;

void main() {
  #include <color_vertex>
  #include <beginnormal_vertex>
  #include <defaultnormal_vertex>
  #include <normal_vertex>
  #include <begin_vertex>

  // Where this vertex stands in the world BEFORE the wind moves it.
  // Sampling the field at the moved position instead would let a swaying
  // crown drive its own phase, and the sway would feed back on itself.
  vec4 rootPosition = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    rootPosition = instanceMatrix * rootPosition;
  #endif
  rootPosition = modelMatrix * rootPosition;

  // Flat map: one up for the whole world. Planet: the radial here, or
  // snow piles on one face of the globe and the wind blows into it.
  vec3 up = mix(vec3(0.0, 1.0, 0.0), normalize(rootPosition.xyz), uSpherical);

  // Wind moves plants, and a plant is an instance. The terrain shares
  // this material and is not instanced, so it compiles out entirely
  // rather than relying on its uSway being left at zero.
  #ifdef USE_INSTANCING
    if (uSway > 0.0) {
      // Keep only the part of the wind lying in the tangent plane here.
      // On the flat map that changes nothing; on the globe it is what
      // stops the wind blowing into the surface on one side of the
      // planet and out of it on the other.
      vec3 windWorld = uWindDirection - dot(uWindDirection, up) * up;
      float windLength = length(windWorld);
      if (windLength > 1e-4) {
        windWorld /= windLength;

        // One field for the whole world, sampled at the root in world
        // space. This is the difference between weather and every tree
        // twitching to its own clock: neighbours sit close together in
        // the field, so a stand leans, pauses and leans as a stand.
        float phase = dot(rootPosition.xyz, uWindDirection) * uWindFrequency - uTime * uWindSpeed;
        // A second faster crest at a ratio that is not a whole number,
        // so the canopy does not visibly repeat on the wavelength.
        float wave = sin(phase) + 0.5 * sin(phase * 2.3 + 1.7);

        // Bend grows with height above the plant's OWN base, squared, so
        // the trunk stays in the ground and the crown does the moving.
        // uSwayHeight is this archetype's full height — one material per
        // archetype is what makes that an exact number rather than an
        // average that would leave a shrub thrashing and an emergent stiff.
        float lift = clamp(transformed.z / uSwayHeight, 0.0, 1.0);
        vec3 lean = windWorld * (wave * uSway * uSwayHeight * lift * lift);

        // Back into the instance's own frame. instanceMatrix's columns
        // ARE this tree's axes in world space, so two dot products are
        // the whole conversion: no inverse to compute, and it stays
        // correct for a tree standing on the side of a globe.
        transformed.x += dot(lean, normalize(instanceMatrix[0].xyz));
        transformed.y += dot(lean, normalize(instanceMatrix[1].xyz));
      }
    }
  #endif

  #include <project_vertex>

  vViewPosition = -mvPosition.xyz;

  // World space, for the snow. Computed separately from the view normal
  // above because the camera moves and the sky does not.
  vec3 worldNormal = objectNormal;
  #ifdef USE_INSTANCING
    // Instance scale is uniform per tree, so the rotation survives
    // normalisation and no inverse-transpose is needed.
    worldNormal = mat3(instanceMatrix) * worldNormal;
  #endif
  worldNormal = normalize(mat3(modelMatrix) * worldNormal);

  vFacingUp = dot(worldNormal, up);
  vSnowHeight = snowHeight;
}
`

const fragmentShader = /* glsl */ `
#include <common>
#include <color_pars_fragment>
#include <normal_pars_fragment>
#include <lights_pars_begin>

uniform vec3 uSnowColor;
uniform float uSnowStart;
uniform float uSnowFull;
uniform float uSnowFacingStart;

varying vec3 vViewPosition;
varying float vSnowHeight;
varying float vFacingUp;

void main() {
  vec3 albedo = vec3(1.0);
  #if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR )
    albedo = vColor.rgb;
  #endif

  // Snow is cover over the albedo, not a wash over the finished pixel,
  // so it takes the same light as the ground beneath it.
  float altitude = smoothstep(uSnowStart, uSnowFull, vSnowHeight);
  float facing = smoothstep(uSnowFacingStart, 1.0, vFacingUp);
  // A negative height opts out entirely: smoothstep already returns 0
  // below its edge, and this states the intent where it is read.
  float cover = vSnowHeight < 0.0 ? 0.0 : altitude * facing;
  albedo = mix(albedo, uSnowColor, cover);

  // Declares \`normal\`, from the interpolated vertex normal or from
  // derivatives when flat shaded — which is what keeps the canopy's
  // faceted crowns faceted.
  #include <normal_fragment_begin>

  vec3 irradiance = ambientLightColor;

  // Half-Lambert, squared: never black on the far side, soft across the
  // terminator. Only the first directional light is read, because the
  // scene has exactly one and a loop would cost more than it buys.
  #if NUM_DIR_LIGHTS > 0
    float wrapped = dot(normal, directionalLights[0].direction) * 0.5 + 0.5;
    irradiance += directionalLights[0].color * wrapped * wrapped;
  #endif

  // RECIPROCAL_PI is not decoration: it is the normalisation factor in
  // three's own BRDF_Lambert, and three's light uniforms carry no
  // compensating PI (WebGLLights stores colour x intensity and nothing
  // else). Omitting it renders every surface pi times too bright, which
  // does not look like a bug so much as a bleached palette — the greens
  // go pale and the whole world reads overexposed. The intensities in
  // the view configs were tuned against a material that divided, so
  // this is also what keeps them meaning what they meant.
  gl_FragColor = vec4(albedo * irradiance * RECIPROCAL_PI, 1.0);

  #include <colorspace_fragment>
}
`

/**
 * The lit material for terrain and canopy.
 *
 * `vertexColors` is set by the caller for the terrain, where colour
 * arrives per vertex; the canopy leaves it off and three defines
 * USE_INSTANCING_COLOR itself once the InstancedMesh has an
 * instanceColor. Both end up in vColor, so the shader is the same.
 *
 * `snowline` defaults to the ground's band and is overridden by the
 * canopy, which frosts lower — see ALTITUDE.frostStart for why. The
 * material takes it as a parameter rather than deciding per caller,
 * because which band a mesh uses is a fact about the mesh.
 *
 * `swayHeight` is the full height of the thing being drawn, in the same
 * units as its geometry. Left at 0 the wind branch never runs, which is
 * what the terrain wants; the canopy passes its archetype's height.
 *
 * @param {{
 *   vertexColors?: boolean,
 *   flatShading?: boolean,
 *   spherical?: boolean,
 *   snowline?: { start: number, full: number },
 *   swayHeight?: number,
 * }} options
 * @returns {THREE.ShaderMaterial}
 */
export function createStylizedMaterial({
  vertexColors = false,
  flatShading = false,
  spherical = false,
  snowline = { start: ALTITUDE.snowStart, full: ALTITUDE.snowFull },
  swayHeight = 0,
} = {}) {
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    // Merges three's own light uniforms in, and tells the renderer to
    // keep them up to date as the scene's lights change.
    lights: true,
    vertexColors,
    // A DEFINE, not the `flatShading` property. ShaderMaterial does not
    // declare that property, and Material.setValues skips any key it
    // does not already own — logging a warning nobody was reading. So
    // the canopy asked to be flat shaded and simply was not: every
    // crown was a smoothly shaded ball, because PolyhedronGeometry
    // normalises its normals at any detail above 0 and the sphere it
    // was carved from came back.
    //
    // Setting the define is what the call site always meant, and it is
    // worth more now than it was: normal_fragment_begin derives the
    // face normal from screen-space derivatives, so a crown the wind
    // has bent is lit by the shape it actually has this frame rather
    // than by the normals it was built with.
    defines: flatShading ? { FLAT_SHADED: '' } : {},
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.lights,
      {
        uSnowColor: { value: SNOW_COLOR.clone() },
        uSnowStart: { value: snowline.start },
        uSnowFull: { value: snowline.full },
        uSnowFacingStart: { value: SNOW_FACING_START },
        uSpherical: { value: spherical ? 1 : 0 },
        uTime: { value: 0 },
        uWindDirection: { value: new THREE.Vector3(1, 0, 0) },
        uWindFrequency: { value: windFrequency() },
        uWindSpeed: { value: WIND.speed },
        // Zero until a frame is drawn, so a material that nobody drives
        // is simply still rather than moving on default values.
        uSway: { value: 0 },
        uSwayHeight: { value: swayHeight },
      },
    ]),
  })
}

/**
 * Writes one frame of weather onto a material.
 *
 * Takes the sample from environment.js rather than a time, because what
 * the shader needs is the answer and not the clock: a frozen environment
 * hands over a sway of 0 and the wind branch stops, with no second path
 * here for reduced motion.
 *
 * @param {THREE.ShaderMaterial} material
 * @param {{ time: number, sway: number }} sample from sampleEnvironment
 * @param {THREE.Vector3} windDirection unit vector in WORLD space
 */
export function setWind(material, { time, sway }, windDirection) {
  material.uniforms.uTime.value = time
  material.uniforms.uSway.value = sway
  material.uniforms.uWindDirection.value.copy(windDirection)
}

/**
 * Moves the snowline on an existing material, with nothing rebuilt.
 *
 * This is the payoff for holding snow apart from the ground colour, and
 * the shape every later environment control should take: two numbers
 * written to a uniform, no geometry touched, no world regenerated.
 *
 * @param {THREE.ShaderMaterial} material
 * @param {{ start: number, full: number }} snowline heights in [0, 1]
 */
export function setSnowline(material, { start, full }) {
  material.uniforms.uSnowStart.value = start
  material.uniforms.uSnowFull.value = full
}

export { SNOW_FACING_START }
