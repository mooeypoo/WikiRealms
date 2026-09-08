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
  #include <project_vertex>

  vViewPosition = -mvPosition.xyz;

  // World space, for the snow. Computed separately from the view normal
  // above because the camera moves and the sky does not.
  vec4 worldPosition = vec4(transformed, 1.0);
  vec3 worldNormal = objectNormal;
  #ifdef USE_INSTANCING
    worldPosition = instanceMatrix * worldPosition;
    // Instance scale is uniform per tree, so the rotation survives
    // normalisation and no inverse-transpose is needed.
    worldNormal = mat3(instanceMatrix) * worldNormal;
  #endif
  worldPosition = modelMatrix * worldPosition;
  worldNormal = normalize(mat3(modelMatrix) * worldNormal);

  // Flat map: one up for the whole world. Planet: the radial at this
  // vertex, or snow would pile on one face of the globe.
  vec3 up = mix(vec3(0.0, 1.0, 0.0), normalize(worldPosition.xyz), uSpherical);

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
 * @param {{ vertexColors?: boolean, flatShading?: boolean, spherical?: boolean }} options
 * @returns {THREE.ShaderMaterial}
 */
export function createStylizedMaterial({ vertexColors = false, flatShading = false, spherical = false } = {}) {
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    // Merges three's own light uniforms in, and tells the renderer to
    // keep them up to date as the scene's lights change.
    lights: true,
    vertexColors,
    flatShading,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.lights,
      {
        uSnowColor: { value: SNOW_COLOR.clone() },
        uSnowStart: { value: ALTITUDE.snowStart },
        uSnowFull: { value: ALTITUDE.snowFull },
        uSnowFacingStart: { value: SNOW_FACING_START },
        uSpherical: { value: spherical ? 1 : 0 },
      },
    ]),
  })
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
