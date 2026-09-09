/**
 * The one lit material the world uses, for the terrain and for the trees.
 *
 * WHY NOT MeshStandardMaterial, WHICH THIS REPLACES
 *
 * It was doing physically based rendering for a scene with nothing
 * physical in it. There are two lights — one ambient, one directional —
 * no shadow maps, no environment map, and roughness was pinned at
 * 0.85/0.95 with metalness at 0 (tone mapping arrived later as a
 * renderer setting, not as a reason to keep PBR). So every fragment ran a
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
import { COLOR_LUT_SIZE, winterColorLut } from './colorLut.js'
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

/**
 * How far to exaggerate sky occlusion, as an exponent.
 *
 * 1 would be the geometrically honest answer, and it was measured: with
 * the raw sky fraction, occlusion darkened the terrain by a mean of 5
 * levels out of 255, about 4.6%. Correct, and too small to see. The
 * reason is that it can only touch the ambient term, which is a little
 * over half the light, and the raw fraction sits near 0.87 across most
 * of a world.
 *
 * At 2 the same measurement roughly doubles while the open ground it
 * should not affect stays put — an exponent leaves 1.0 at 1.0 and bends
 * only the occluded end, which is the reason to shape it this way
 * rather than scaling or subtracting.
 *
 * This is a look, and it is worth being plain about that: nothing in the
 * scene is physically lit, the sun is one unshadowed directional light,
 * and there is no bounce. Overstating the one term that knows about
 * enclosure is how the terrain reads as carved rather than painted.
 */
const OCCLUSION_STRENGTH = 2

const TAU = Math.PI * 2

/**
 * The ground's shine: none on rock, grass or sand, a tight highlight on
 * snow.
 *
 * A single profile for the whole terrain, because the only part of it
 * that reflects is the part the material draws itself. Snow is already
 * computed per fragment as `cover`, so the sparkle can ride it and no
 * caller has to say where the caps are.
 *
 * `strength` is 0 deliberately. Wet rock and wet sand do shine, but the
 * shader cannot tell wet from dry — that is a fact about proximity to
 * water, which lives in the height map and not in this fragment. Adding
 * a base shine here would put a highlight on every dry cliff in the
 * world to get one on the shore.
 */
export const GROUND_SPECULAR = Object.freeze({
  strength: 0,
  // Snow is not a mirror: it is a scatterer full of facets. So this is
  // a modest amount through a fairly tight lobe, which reads as glitter
  // catching the light rather than as a wet plastic cap.
  snowStrength: 0.55,
  sharpness: 32,
})

/** Snow's albedo, from the palette the 2D map and the legend also use. */
const SNOW_COLOR = new THREE.Color(
  SNOW_RGB[0] / 255,
  SNOW_RGB[1] / 255,
  SNOW_RGB[2] / 255,
)

/**
 * A snowline no surface can reach, for a mesh that never takes snow.
 *
 * `snowHeight` is a height in [0, 1], so a band starting above 1 can
 * never open. The sea uses it. It could instead bind no snowHeight at
 * all and lean on an unbound attribute reading 0, which today happens
 * to be below the snowline — but that is the same quiet assumption the
 * occlusion and sunlight defines exist to avoid, and it would make the
 * sea's dryness a consequence of where the snowline happens to sit
 * rather than a thing anybody decided.
 */
export const NO_SNOWLINE = Object.freeze({ start: 2, full: 3 })

const vertexShader = /* glsl */ `
#include <common>
#include <color_pars_vertex>
#include <normal_pars_vertex>
#include <fog_pars_vertex>

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

// How much of the sky this surface can see, in [0, 1], baked from the
// height map (see occlusion.js). Behind a define because an attribute
// with no buffer bound reads as 0, and 0 here means "lit by no sky at
// all" — a mesh that simply forgot to supply it would come out black
// rather than merely unoccluded.
#ifdef USE_OCCLUSION
  attribute float occlusion;
  uniform float uOcclusionStrength;
#endif

// Whether the sun reaches this surface, in [0, 1], traced along the
// sun's own bearing from the height map (see sunlight.js). Behind a
// define for the same reason as occlusion: an attribute with no buffer
// bound reads as 0, and 0 here is midnight.
#ifdef USE_SUNLIGHT
  attribute float sunlight;
#endif

// Needed by normal_fragment_begin, which derives a face normal from its
// screen-space derivatives when the material is flat shaded.
varying vec3 vViewPosition;
varying float vSnowHeight;
varying float vFacingUp;
varying float vOcclusion;
varying float vSunlight;

#ifdef USE_RIPPLE
  // The chop is anchored to the SURFACE, not to the screen, or it would
  // swim as the camera moves. This is the untransformed position, which
  // is the only frame that stands still while the camera does not.
  varying vec3 vLocalPosition;
#endif

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
  // Reads mvPosition, so it has to follow project_vertex. Carries the
  // view depth that the aerial haze is a function of.
  #include <fog_vertex>

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

  vOcclusion = 1.0;
  #ifdef USE_OCCLUSION
    // Shaped here rather than baked into the buffer, so the attribute
    // stays a true sky fraction and the exaggeration stays a look that
    // can be turned without retracing anything. Per vertex rather than
    // per fragment because the curve is smooth, so interpolating the
    // result costs one pow per vertex instead of one per pixel.
    vOcclusion = pow(occlusion, uOcclusionStrength);
  #endif

  #ifdef USE_RIPPLE
    vLocalPosition = position;
  #endif

  vSunlight = 1.0;
  #ifdef USE_SUNLIGHT
    vSunlight = sunlight;
  #endif
}
`

const fragmentShader = /* glsl */ `
#include <common>
#include <color_pars_fragment>
#include <normal_pars_fragment>
#include <lights_pars_begin>
#include <fog_pars_fragment>

uniform vec3 uSnowColor;
uniform float uSnowStart;
uniform float uSnowFull;
uniform float uSnowFacingStart;
// The seasons seam. See colorLut.js: a grade of the albedo keyed on
// the albedo itself, blended by how far this realm sits toward winter.
uniform sampler2D uColorLut;
uniform float uColorLutSize;
uniform float uSeason;

#ifdef USE_RIPPLE
  varying vec3 vLocalPosition;
  // Which way is up in local space, and so which way the sea's own
  // normal points before the chop tilts it. Declared in the vertex
  // stage as well, where the wind asks the same question.
  uniform float uSpherical;
  // A wave vector is a direction times a spatial frequency, so its dot
  // product with a position is a phase in radians and its magnitude is
  // what turns an amplitude into a slope. Sized by a define so the wave
  // COUNT stays a number in waterSurface.js rather than a shape the
  // shader imposes — it was three, and three made a lattice.
  uniform vec3 uRippleWaves[RIPPLE_WAVES];
  uniform float uRippleAmplitudes[RIPPLE_WAVES];
  uniform float uRippleFrequencies[RIPPLE_WAVES];
  uniform float uRippleStrength;
  // three declares this for the vertex stage only, but a uniform belongs
  // to the PROGRAM, so declaring it here binds the same matrix the
  // renderer already keeps current per object. It is needed because the
  // slope is derived in local space and the lighting happens in view
  // space.
  uniform mat3 normalMatrix;
#endif

#ifdef USE_SKY_REFLECTION
  uniform vec3 uSkyColor;
  uniform float uSkyReflection;
  uniform float uSkyReflectionFacing;
  uniform float uSkyReflectionFalloff;
#endif

#ifdef USE_SPECULAR
  uniform float uSpecular;
  uniform float uSpecularSnow;
  uniform float uSpecularSharpness;
#endif

#ifdef USE_SURF
  // The clock is declared in the vertex stage too; three writes one
  // uniform and both stages read it.
  uniform float uTime;
  uniform float uSurf;
  uniform float uSurfCeiling;
  uniform float uSurfBands;
  uniform float uSurfSpeed;
  uniform float uSurfSharpness;
  uniform float uSurfFoam;
  uniform vec3 uSurfColor;
#endif

varying vec3 vViewPosition;
varying float vSnowHeight;
varying float vFacingUp;
varying float vOcclusion;
varying float vSunlight;

void main() {
  vec3 albedo = vec3(1.0);
  // Opaque unless a mesh says otherwise, and the sea is the only one
  // that does. three's vColor is a vec4 in every case — it initialises
  // to vec4(1.0) and an RGB attribute multiplies only .rgb — so reading
  // alpha here costs nothing and needs no define of its own. What turns
  // it into a real per-vertex alpha is an itemSize of 4 on the colour
  // attribute, which makes three define USE_COLOR_ALPHA and multiply all
  // four channels. See waterSurface.js.
  float alpha = 1.0;
  #if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR )
    albedo = vColor.rgb;
    alpha = vColor.a;
  #endif

  // Surf, on whichever mesh carries a shelf to put it on.
  //
  // vColor.a here is the sea's opacity, a smoothstep of depth that
  // saturates at the outer edge of the shelf. Divided by that ceiling it
  // becomes a coordinate running 0 at the waterline to 1 where the shelf
  // ends — and whose contours follow the coast EXACTLY, because depth's
  // do. So a wave in this one number is a wave in the shape of the
  // shore, with no attribute, no second pass and no coastline to trace.
  //
  // Every number below is a uniform rather than a literal, and not for
  // flexibility: they are the difference between surf and contour lines
  // on a map, so they belong somewhere a test can reach them. See SURF
  // in waterSurface.js.
  #ifdef USE_SURF
    if (uSurf > 0.0) {
      float shelf = clamp(alpha / uSurfCeiling, 0.0, 1.0);
      float crest = sin((shelf * uSurfBands - uTime * uSurfSpeed) * PI2);
      // Sharpened from a swell into a crest, and gone by the time the
      // shelf ends, so this reads as surf and not as stripes at sea.
      float foam = pow(max(crest, 0.0), uSurfSharpness) * (1.0 - shelf) * uSurf;
      // Cover over the albedo, before the lighting, exactly as snow is:
      // foam that is lit like the water it sits on rather than pasted
      // over the finished pixel.
      albedo = mix(albedo, uSurfColor, foam);
      // And it has to bring its own opacity. At the waterline the sea is
      // drawn as nothing, and a white nothing is still nothing — this is
      // what lets the wash run up over the sand.
      alpha = min(1.0, alpha + foam * uSurfFoam);
    }
  #endif

  // Snow is cover over the albedo, not a wash over the finished pixel,
  // so it takes the same light as the ground beneath it.
  float altitude = smoothstep(uSnowStart, uSnowFull, vSnowHeight);
  float facing = smoothstep(uSnowFacingStart, 1.0, vFacingUp);
  // A negative height opts out entirely: smoothstep already returns 0
  // below its edge, and this states the intent where it is read.
  float cover = vSnowHeight < 0.0 ? 0.0 : altitude * facing;
  albedo = mix(albedo, uSnowColor, cover);

  // Season. A blend toward the winter grade of THIS colour, not a tint
  // over the frame: greens go olive, sand pales, near-whites stay put.
  // Runs after snow so a frosted crown keeps its cap, and before the
  // light so the sun's colour is not graded with the leaf.
  if (uSeason > 0.0) {
    float size = uColorLutSize;
    vec3 scaled = clamp(albedo, 0.0, 1.0) * (size - 1.0);
    float slice = floor(scaled.b);
    float sliceF = scaled.b - slice;
    float y = (scaled.g + 0.5) / size;
    float x0 = (scaled.r + slice * size + 0.5) / (size * size);
    float x1 = (scaled.r + min(slice + 1.0, size - 1.0) * size + 0.5) / (size * size);
    vec3 graded = mix(
      texture2D(uColorLut, vec2(x0, y)).rgb,
      texture2D(uColorLut, vec2(x1, y)).rgb,
      sliceF
    );
    albedo = mix(albedo, graded, uSeason);
  }

  // Declares \`normal\`, from the interpolated vertex normal or from
  // derivatives when flat shaded — which is what keeps the canopy's
  // faceted crowns faceted.
  #include <normal_fragment_begin>

  // Chop, as a slope rather than a shape.
  //
  // The sea's local normal is known without reading anything: the flat
  // map's surface lies in XY so it points along Z, and the globe's is
  // radial. Two vectors across that normal give a frame to tilt in, and
  // each wave's contribution to the tilt is its own derivative — the
  // cosine of the phase it is already computing, times how much of the
  // wave runs along each axis of the frame.
  //
  // This replaces the normal rather than adding to it, so the chop
  // reaches the diffuse term too and not only the highlight. That is
  // the honest version: a tilted piece of water faces the sun a little
  // differently in every respect, and the wrapped diffuse turns that
  // into the soft light-and-dark that reads as a moving surface even
  // where the sun's own image is nowhere near.
  #ifdef USE_RIPPLE
    if (uRippleStrength > 0.0) {
      vec3 upLocal = uSpherical > 0.5 ? normalize(vLocalPosition) : vec3(0.0, 0.0, 1.0);
      // Any two axes across the surface will do, so long as the one we
      // cross with is not parallel to the normal.
      vec3 across = abs(upLocal.z) > 0.9 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 0.0, 1.0);
      vec3 tangentA = normalize(cross(upLocal, across));
      vec3 tangentB = cross(upLocal, tangentA);

      vec2 slope = vec2(0.0);
      for (int i = 0; i < RIPPLE_WAVES; i++) {
        vec3 waveVector = uRippleWaves[i];
        float phase = dot(vLocalPosition, waveVector) + uTime * uRippleFrequencies[i];
        // The derivative of the wave, which is all the lighting needs:
        // a sine's slope is its cosine, so this is exact and there is
        // no height field to build or filter.
        float derivative = cos(phase) * uRippleAmplitudes[i];
        slope += derivative * vec2(dot(waveVector, tangentA), dot(waveVector, tangentB));
      }
      slope *= uRippleStrength;

      vec3 rippled = normalize(upLocal - tangentA * slope.x - tangentB * slope.y);
      normal = normalize(normalMatrix * rippled);
    }
  #endif

  // Occlusion attenuates the AMBIENT term and only that term, which is
  // what it means: the ambient light stands in for a sky shining from
  // every direction, and this is the fraction of that sky the surface
  // can actually see. The sun is one direction and either reaches a
  // surface or does not — that is a shadow, a different question, and
  // scaling the directional term by sky visibility would answer it
  // wrongly by dimming slopes that are in full sunlight.
  //
  // It is also why this shows up at all. A ravine floor and a plateau
  // top can face the same way, so half-Lambert hands them the same
  // colour and the ravine reads as a line painted on flat ground. This
  // is the only term in the shader that knows one is enclosed.
  vec3 irradiance = ambientLightColor * vOcclusion;

  // Half-Lambert, squared: never black on the far side, soft across the
  // terminator. Only the first directional light is read, because the
  // scene has exactly one and a loop would cost more than it buys.
  //
  // Scaled by the cast shadow, and by that alone — the two terms answer
  // the two halves of the question the comment above poses. Whether a
  // surface FACES the sun is the dot product, and it is a property of
  // this surface. Whether the sun REACHES it is vSunlight, and it is a
  // property of everything between here and the sun. A slope can face
  // the sun squarely and stand in the shadow of the ridge upsun of it,
  // and before this it was rendered in full daylight.
  //
  // Nothing is added back in shadow. That is not an omission: the light
  // a real shadow is filled by is skylight, which is the ambient term,
  // and it is already here and already attenuated by how much sky this
  // surface can see.
  #if NUM_DIR_LIGHTS > 0
    float wrapped = dot(normal, directionalLights[0].direction) * 0.5 + 0.5;
    irradiance += directionalLights[0].color * wrapped * wrapped * vSunlight;
  #endif

  // RECIPROCAL_PI is not decoration: it is the normalisation factor in
  // three's own BRDF_Lambert, and three's light uniforms carry no
  // compensating PI (WebGLLights stores colour x intensity and nothing
  // else). Omitting it renders every surface pi times too bright, which
  // does not look like a bug so much as a bleached palette — the greens
  // go pale and the whole world reads overexposed. The intensities in
  // the view configs were tuned against a material that divided, so
  // this is also what keeps them meaning what they meant.
  vec3 outgoing = albedo * irradiance * RECIPROCAL_PI;

  // A highlight: the sun seen IN the surface rather than on it.
  //
  // The SUN only. Grazing-angle reflection used to be weighted in here
  // as well and is not any more, because the two answer different
  // questions and wanted different curves: this one is where a single
  // small light sits, which is a fact about the sun's position, while
  // reflecting the sky is a fact about the viewing angle alone. They
  // are separated so that snow can have one without the other.
  //
  // This is added to the outgoing light and not mixed into the albedo,
  // which is the whole difference between a highlight and a coat of
  // white paint. Snow and foam above are cover — they change what the
  // surface IS, so they are lit by it. A reflection is not part of the
  // surface at all, so it arrives after the light has been applied and
  // is not multiplied by the albedo. A snowfield in shadow can still
  // catch the sun on the one facet turned the right way.
  //
  // Scaled by vSunlight for the same reason the diffuse term is: this
  // is the sun's own image, so a fragment the sun cannot reach has no
  // sun to show. It is NOT scaled by occlusion, which answers about
  // skylight from every direction and has nothing to say about where
  // one light sits.
  #if defined( USE_SPECULAR ) && NUM_DIR_LIGHTS > 0
    // Where the shine comes from. A base for surfaces that are shiny
    // everywhere, plus a term that rides the snow the material has
    // already decided to draw — so caps sparkle wherever they are,
    // without a second attribute or anyone naming a peak.
    float shine = uSpecular + uSpecularSnow * cover;

    if (shine > 0.0) {
      vec3 viewDir = normalize(vViewPosition);
      // Blinn's half vector rather than a mirrored ray: one normalize
      // instead of a reflect, and the lobe it makes is rounder, which
      // suits a world that is already lit by a wrapped diffuse.
      //
      // three gives directionalLights[].direction in VIEW space and
      // normal_fragment_begin leaves the normal there too, so all three
      // vectors agree without a matrix.
      vec3 halfDir = normalize(directionalLights[0].direction + viewDir);
      float highlight = pow(max(dot(normal, halfDir), 0.0), uSpecularSharpness);

      vec3 glint = directionalLights[0].color * highlight * shine * vSunlight;
      outgoing += glint;
    }
  #endif

  // The sky seen in the surface, which is the other half of what makes
  // water look like water — and the half that does not depend on where
  // the sun happens to be.
  //
  // A sun highlight is the sun's own image, so it appears only when the
  // eye is near the mirror direction. Measured on this world, whose sun
  // stands at 59 degrees, that condition is simply not met at the
  // cameras a reader uses: the mirror direction sits some 38 degrees off
  // the sea's normal and the lobe returns 4e-11. The sky, by contrast,
  // is everywhere the sun is not, so its reflection depends on the
  // viewing angle alone and is therefore always somewhere in frame.
  //
  // Schlick's approximation, with water's real numbers: about 2% of the
  // light striking it head-on comes back, rising to all of it at a
  // grazing angle. That rise is why a lake looks into itself at your
  // feet and looks like sky at the far shore, and it is the strongest
  // single cue that a surface is liquid rather than painted.
  //
  // The chop matters here more than it does to the highlight. It tilts
  // the normal a few degrees either way, which moves each fragment
  // along that steep curve, so the reflection arrives already broken up
  // into the light and dark bands of a moving surface.
  //
  // WHAT SKY, IN A WORLD WITH NO SKY
  //
  // The backdrop is a starfield, so reflecting what is literally up
  // there returns darkness: measured, the sea changed by -0.2 levels,
  // because the haze colour is dimmer than the lit water it was being
  // mixed into. But the scene does assert a sky — that is precisely
  // what its ambient term is, a light with no direction standing in for
  // one shining from everywhere. So the sea reflects THAT, tinted by
  // the same hue the haze uses, which keeps one story about the air and
  // makes the reflection follow the lighting for free: the globe's
  // brighter ambient gives a brighter sea without a second constant.
  #ifdef USE_SKY_REFLECTION
    {
      vec3 skyView = normalize(vViewPosition);
      float facing = clamp(dot(normal, skyView), 0.0, 1.0);
      float reflectance = mix(uSkyReflectionFacing, 1.0, pow(1.0 - facing, uSkyReflectionFalloff)) * uSkyReflection;
      // uSkyColor carries hue only — its brightest channel is 1 — so
      // the ambient decides how bright the sky is and the token decides
      // what colour it is.
      outgoing = mix(outgoing, ambientLightColor * uSkyColor, reflectance);
      // A reflection sits ON the water, so it hides the floor by as much
      // as it returns. Without this the sea's own transparency would
      // blend away the very thing that makes it read as a surface.
      alpha = max(alpha, reflectance);
    }
  #endif

  gl_FragColor = vec4(outgoing, alpha);

  #include <colorspace_fragment>

  // AFTER the colour space conversion, which is not an accident and not
  // a place this could be moved from. three applies fog last in every
  // one of its own materials and hands the shader a fogColor already
  // converted to the OUTPUT space (see refreshFogUniforms), precisely
  // because it is mixed into an sRGB-encoded value here. Mixing it
  // before the conversion, or using a linear colour, is the same class
  // of mistake as omitting colorspace_fragment: it looks like a palette
  // choice rather than a bug.
  //
  // Which is also the argument for not hand-rolling the haze at all.
  // Scene fog reaches the water's standard material with no work, so
  // land and sea recede together instead of the sea staying vivid
  // behind veiled hills.
  #include <fog_fragment>
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
 *   occlusion?: boolean,
 *   sunlight?: boolean,
 *   transparent?: boolean,
 *   surf?: { ceiling: number, bands: number, speed: number, sharpness: number, foam: number, color: number } | null,
 *   specular?: { strength: number, snowStrength: number, sharpness: number } | null,
 *   ripple?: { waves: Array<{ wavelength: number, direction: number[], amplitude: number, frequency: number }> } | null,
 *   skyReflection?: { color: THREE.Color, strength: number, facing: number, falloff: number } | null,
 * }} options
 * @returns {THREE.ShaderMaterial}
 */
export function createStylizedMaterial({
  vertexColors = false,
  flatShading = false,
  spherical = false,
  snowline = { start: ALTITUDE.snowStart, full: ALTITUDE.snowFull },
  swayHeight = 0,
  side = THREE.FrontSide,
  occlusion = false,
  sunlight = false,
  transparent = false,
  surf = null,
  specular = null,
  ripple = null,
  skyReflection = null,
} = {}) {
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    // Merges three's own light uniforms in, and tells the renderer to
    // keep them up to date as the scene's lights change.
    lights: true,
    // The same arrangement for scene.fog: the renderer keeps fogColor,
    // fogNear and fogFar current, so the aerial haze is set once on the
    // scene and every material that opts in follows it. See
    // AERIAL_PERSPECTIVE in the component for what drives the range.
    fog: true,
    vertexColors,
    // The sea, and only the sea. Its opacity arrives per vertex in the
    // colour's fourth channel, and without this the renderer would draw
    // it in the opaque pass and throw that channel away.
    transparent,
    // Unlike flatShading below, `side` IS declared on Material, so
    // setting it here works. It matters for anything built from strips
    // with no thickness — a grass blade is seen from behind half the
    // time, and DoubleSide makes the renderer define DOUBLE_SIDED,
    // which is what lets normal_fragment_begin flip the normal for the
    // back face instead of shading it as if it faced away from us.
    side,
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
    defines: {
      ...(flatShading ? { FLAT_SHADED: '' } : {}),
      // Opt in, so that the attribute is only read where a buffer is
      // actually bound. An unbound attribute reads as 0, which here
      // would mean a surface that sees no sky at all.
      ...(occlusion ? { USE_OCCLUSION: '' } : {}),
      // And the same for the cast shadow, where an unbound attribute
      // would read as midnight.
      ...(sunlight ? { USE_SUNLIGHT: '' } : {}),
      ...(surf ? { USE_SURF: '' } : {}),
      // Off by default, and worth being strict about: this is the one
      // term that runs a pow per fragment on surfaces that have no
      // reason to shine. Grass and rock do not.
      ...(specular ? { USE_SPECULAR: '' } : {}),
      // The chop, which brings a varying with it and a loop over the
      // wave set. Only the sea has any use for either.
      ...(ripple ? { USE_RIPPLE: '', RIPPLE_WAVES: String(ripple.waves.length) } : {}),
      ...(skyReflection ? { USE_SKY_REFLECTION: '' } : {}),
    },
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.lights,
      THREE.UniformsLib.fog,
      {
        uSnowColor: { value: SNOW_COLOR.clone() },
        uSnowStart: { value: snowline.start },
        uSnowFull: { value: snowline.full },
        // Strength is the only one the camera moves; the rest are the
        // shape of the wave and are fixed when the material is made.
        uSurf: { value: 0 },
        uSurfCeiling: { value: surf?.ceiling ?? 1 },
        uSurfBands: { value: surf?.bands ?? 0 },
        uSurfSpeed: { value: surf?.speed ?? 0 },
        uSurfSharpness: { value: surf?.sharpness ?? 1 },
        uSurfFoam: { value: surf?.foam ?? 0 },
        uSurfColor: { value: new THREE.Color(surf?.color ?? 0xffffff) },
        uSpecular: { value: specular?.strength ?? 0 },
        uSpecularSnow: { value: specular?.snowStrength ?? 0 },
        uSpecularSharpness: { value: specular?.sharpness ?? 1 },
        ...rippleUniforms(ripple),
        uSkyColor: { value: skyReflection?.color?.clone() ?? new THREE.Color(0xffffff) },
        uSkyReflection: { value: skyReflection?.strength ?? 0 },
        uSkyReflectionFacing: { value: skyReflection?.facing ?? 0 },
        uSkyReflectionFalloff: { value: skyReflection?.falloff ?? 5 },
        uSnowFacingStart: { value: SNOW_FACING_START },
        uOcclusionStrength: { value: OCCLUSION_STRENGTH },
        uSpherical: { value: spherical ? 1 : 0 },
        uTime: { value: 0 },
        uWindDirection: { value: new THREE.Vector3(1, 0, 0) },
        uWindFrequency: { value: windFrequency() },
        uWindSpeed: { value: WIND.speed },
        // Zero until a frame is drawn, so a material that nobody drives
        // is simply still rather than moving on default values.
        uSway: { value: 0 },
        uSwayHeight: { value: swayHeight },
        // Shared across every stylized material: one winter table, one
        // blend amount written each frame from the environment.
        uColorLut: { value: winterColorLut() },
        uColorLutSize: { value: COLOR_LUT_SIZE },
        uSeason: { value: 0 },
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
 * Writes how far toward winter this material should sit.
 *
 * A uniform rather than a rebuild: the vertex colours stay the summer
 * palette, and the grade is applied in the fragment shader. Same shape
 * as setSnowline — the seam is a number that can move at any time.
 *
 * @param {THREE.ShaderMaterial} material
 * @param {number} season [0, 1]
 */
export function setSeason(material, season) {
  material.uniforms.uSeason.value = Math.min(1, Math.max(0, Number(season) || 0))
}

/**
 * Turns a wave set into the three uniforms the chop's loop reads.
 *
 * A wave vector is a direction times a spatial frequency, so that the
 * shader's dot product of it with a position is a phase in radians and
 * its own magnitude is what converts a slope into a tilt. Doing that
 * here rather than in the shader means the wavelengths in RIPPLE stay
 * written in world units, which is the only form anybody can reason
 * about — see shortestRippleWavelength, which the camera needs.
 *
 * @param {{ waves: Array<object>, speed: number } | null} ripple
 */
function rippleUniforms(ripple) {
  const waves = ripple?.waves ?? []
  return {
    // A Vector3 per wave and a plain number per amplitude: three uploads
    // these as vec3[] and float[] to match the shader's arrays.
    uRippleWaves: {
      value: waves.map((wave) => new THREE.Vector3(...wave.direction).normalize().multiplyScalar(TAU / wave.wavelength)),
    },
    uRippleAmplitudes: { value: waves.map((wave) => wave.amplitude) },
    uRippleFrequencies: { value: waves.map((wave) => wave.frequency) },
    uRippleStrength: { value: 0 },
  }
}

/**
 * Sets how strongly the chop tilts the surface, which the camera decides
 * for the same reason it decides the surf's: a wave narrower than a few
 * pixels cannot carry a highlight without turning it into specks.
 *
 * @param {THREE.ShaderMaterial} material
 * @param {number} strength in [0, 1]
 */
export function setRipple(material, strength) {
  material.uniforms.uRippleStrength.value = Math.min(1, Math.max(0, Number(strength) || 0))
}

/**
 * Sets how strongly the surf is drawn, which the camera decides.
 *
 * The one part of the wave that is not fixed when the material is made,
 * because it answers a question about the SCREEN and not about water:
 * how wide one crest lands in pixels, and so whether it can be drawn
 * without shimmering. See surfStrength in waterSurface.js.
 *
 * @param {THREE.ShaderMaterial} material
 * @param {number} strength in [0, 1]
 */
export function setSurf(material, strength) {
  material.uniforms.uSurf.value = Math.min(1, Math.max(0, Number(strength) || 0))
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
