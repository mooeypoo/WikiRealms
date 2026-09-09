/**
 * The air around a planet, as a thin shell just outside the peaks.
 *
 * WHY THIS EXISTS
 *
 * Aerial perspective hazes the SURFACE toward --atmosphere, so ridges
 * pale with distance. It cannot paint anything OUTSIDE the silhouette:
 * three's fog only reaches fragments that were drawn, and the void
 * behind the planet is the CSS starfield showing through a transparent
 * canvas. The tokens file says it plainly — "the world's edge is a hard
 * silhouette against the starfield whatever colour the air is" — and
 * that hard cut is what stops the wide view reading as a world.
 *
 * A shell slightly larger than the tallest peak, drawn from the inside
 * (BackSide), is the cheap fix every planet renderer reaches for. Where
 * the shell extends past the terrain in screen space the planet does
 * not occlude it, so a fresnel rim appears as a glow around the disc.
 * Where the planet is in front, depth testing hides the shell. No
 * post-process, no second camera, one draw call.
 *
 * The colour is --atmosphere, the same sky the haze and the sea's
 * reflection already use. Day-side bias keeps the night limb quieter
 * without extinguishing it — real air still scatters on the dark side,
 * just less.
 *
 * Flat map: nothing. There is no limb.
 */
import * as THREE from 'three'
import { SPHERE_VIEW } from './projection.js'

export const LIMB_GLOW = Object.freeze({
  /**
   * How far the shell sits past the tallest peak, as a fraction of the
   * planet's radius. Peaks already reach planetRadius + heightScale
   * (= R × 1.15 with the current relief); this is the air beyond them.
   *
   * Too thin and the glow is a hairline the MSAA eats; too thick and
   * the planet wears a halo at every zoom, including close in where
   * the limb is off-screen and the shell's front becomes a tinted
   * film over the terrain. 0.045 clears the peaks by about a twentieth
   * of a radius — visible from the default orbit, gone underfoot.
   */
  thickness: 0.045,
  /**
   * Fresnel exponent. Higher packs the glow into a thinner ring at the
   * silhouette; lower washes a broader band of air over the disc's
   * edge. Measured on Everest from the default orbit: 3.2 changed
   * 40k pixels at a mean of 14 levels — present, but easy to miss
   * against the starfield. 2.3 doubles the footprint and lifts the
   * mean to ~20, which is a rim you notice without being told.
   */
  falloff: 2.3,
  /**
   * Peak additive brightness of the rim, before the day bias.
   * Past about 1.4 the day limb starts to read as a neon outline;
   * under 1.0 it disappears into the haze the surface already has.
   */
  strength: 1.15,
  /**
   * How much the day side outshines the night. 0 is a uniform ring;
   * 1 extinguishes the night limb entirely. 0.6 keeps a quiet night
   * rim — the terminator audit wants to see that the dark side still
   * has air — without competing with the day.
   */
  dayBias: 0.6,
  /** Sphere tessellation. Soft glow; faceting would show. */
  widthSegments: 64,
  heightSegments: 48,
})

/**
 * Radius of the atmosphere shell for a planet of this size.
 *
 * Clears every peak: planetRadius + heightScale is the summit of a
 * cell at height 1, and thickness adds the air beyond.
 *
 * @param {number} radius planetRadius(terrain)
 * @param {number} [heightScale] projection.heightScale(terrain); defaults
 *   to the sphere's own relief so callers that only have the radius
 *   still clear the peaks
 */
export function limbShellRadius(radius, heightScale = radius * SPHERE_VIEW.reliefRatio) {
  const r = Number(radius) || 0
  const relief = Number.isFinite(heightScale) ? Math.max(0, heightScale) : 0
  return r + relief + r * LIMB_GLOW.thickness
}

/**
 * How bright a point on the shell should be, given how squarely it
 * faces the camera and how squarely it faces the sun.
 *
 * Exported so the look can be asserted without a GL context: the
 * shader's pow and mix have to agree with this, or a tuning change
 * here would silently disagree with what the screen shows.
 *
 * @param {number} facingUp abs(dot(normal, viewDir)) in [0, 1] — 1 is
 *   looking straight at the shell, 0 is grazing
 * @param {number} sunFacing dot(worldNormal, sunDir) in [-1, 1]
 * @param {{ falloff?: number, strength?: number, dayBias?: number }} [shape]
 */
export function limbIntensity(facingUp, sunFacing, shape = LIMB_GLOW) {
  const falloff = shape.falloff ?? LIMB_GLOW.falloff
  const strength = shape.strength ?? LIMB_GLOW.strength
  const dayBias = shape.dayBias ?? LIMB_GLOW.dayBias
  const facing = Math.min(1, Math.max(0, Number(facingUp) || 0))
  const sun = Math.min(1, Math.max(0, 0.5 + 0.5 * (Number(sunFacing) || 0)))
  const fresnel = Math.pow(1 - facing, falloff)
  const day = 1 - dayBias + dayBias * sun
  return fresnel * day * strength
}

const vertexShader = /* glsl */ `
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;
varying vec3 vViewPosition;

void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorldPosition = world.xyz;
  // BackSide flips the normal in the fragment stage for lighting; the
  // fresnel wants the geometric outward normal, so it is transformed
  // here before any flip and handed across as a varying.
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vViewPosition = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`

const fragmentShader = /* glsl */ `
uniform vec3 uColor;
uniform float uFalloff;
uniform float uStrength;
uniform float uDayBias;
uniform vec3 uSunDirection;

varying vec3 vWorldNormal;
varying vec3 vWorldPosition;
varying vec3 vViewPosition;

void main() {
  vec3 viewDir = normalize(vViewPosition);
  // View-space normal of the outward shell. transformDirection would
  // also work; the view normal is what the fresnel is a function of,
  // because "grazing" is a statement about the camera.
  vec3 normal = normalize(vWorldNormal);
  // modelView's normal matrix for a uniform scale is the rotation of
  // modelViewMatrix; building it from the world normal keeps the
  // fresnel correct under the worldGroup's -90° tilt without a second
  // uniform.
  vec3 viewNormal = normalize((viewMatrix * vec4(normal, 0.0)).xyz);
  float facing = abs(dot(viewNormal, viewDir));
  float fresnel = pow(1.0 - facing, uFalloff);

  float sun = clamp(0.5 + 0.5 * dot(normal, uSunDirection), 0.0, 1.0);
  float day = 1.0 - uDayBias + uDayBias * sun;
  float intensity = fresnel * day * uStrength;

  // Additive against the starfield: the glow is light, not a fog that
  // has to occlude what is behind it. Alpha is the intensity so a
  // non-additive fallback still fades out.
  gl_FragColor = vec4(uColor * intensity, intensity);
}
`

/**
 * Builds the atmosphere shell for one planet.
 *
 * @param {object} options
 * @param {number} options.radius planetRadius(terrain)
 * @param {number} options.heightScale projection height scale
 * @param {THREE.Color} options.color --atmosphere, already resolved
 * @param {THREE.Vector3} options.sunDirection unit vector in WORLD space
 * @returns {THREE.Mesh}
 */
export function buildLimbGlow({ radius, heightScale, color, sunDirection }) {
  const shellRadius = limbShellRadius(radius, heightScale)
  const geometry = new THREE.SphereGeometry(
    shellRadius,
    LIMB_GLOW.widthSegments,
    LIMB_GLOW.heightSegments,
  )
  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uColor: { value: color.clone() },
      uFalloff: { value: LIMB_GLOW.falloff },
      uStrength: { value: LIMB_GLOW.strength },
      uDayBias: { value: LIMB_GLOW.dayBias },
      uSunDirection: { value: sunDirection.clone().normalize() },
    },
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    // Soft additive glow over the starfield. depthTest stays on so the
    // planet occludes the far side of the shell; without it the air
    // would paint across the whole disc.
    depthTest: true,
    blending: THREE.AdditiveBlending,
    fog: false,
  })

  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = 'limbGlow'
  // The shell does not cast or take shadows; it is light itself.
  mesh.frustumCulled = true
  return mesh
}
