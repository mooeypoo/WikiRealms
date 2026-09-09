/**
 * WHAT a portal looks like — one implementation per shape, behind one
 * contract, so the shape can be replaced without touching the renderer.
 *
 * Two shapes ship: `vortex` (the default — a pink/cyan swirl that reads
 * as a destination, deliberately unlike section halos) and `aperture`
 * (the older additive billboard, kept so a preference can still ask).
 *
 * THE CONTRACT
 *
 * A form is created once per layer, so shapes that want shared resources
 * — one texture, one geometry, one material — can hold them:
 *
 *   const form = createPortalForm('vortex', { accentColor })
 *   const object = form.build(placement)     // one per placement
 *   form.apply(object, { scale, opacity, time })  // every frame
 *   form.dispose()                           // on teardown
 *
 * `build` takes a placement from portalPlacement.js and returns an
 * Object3D positioned in the mesh's local frame. `apply` is the only
 * route by which per-frame state reaches it: the render loop computes a
 * scale multiplier and an opacity and hands them over, and never touches
 * a material or a transform itself. That indirection is the whole point.
 *
 * WHAT AN INSTANCED FORM WOULD STILL NEED
 *
 * Picking. Every object carries `userData.portal`, and the component
 * resolves a raycast hit by walking up to the nearest ancestor that has
 * it. That works for one Object3D per portal and would not for a single
 * InstancedMesh, where a hit reports an `instanceId` instead. At the
 * portal cap (24) separate meshes are cheap enough that we do not
 * instance yet.
 */
import * as THREE from 'three'
import { PORTAL_MARKERS } from './portalMarkers.js'

/**
 * The aperture texture: a soft aura, two rings, four cardinal ticks and a
 * bright core, drawn once and shared by every portal in the layer.
 *
 * Drawn rather than typed. It was an emoji, which cannot take the accent
 * colour, renders differently on every platform, and was the last thing
 * in the app still doing that — in the place a viewer looks most.
 *
 * @param {{ r: number, g: number, b: number }} accentColor channels in [0, 1]
 * @returns {THREE.CanvasTexture}
 */
export function createApertureTexture(accentColor) {
  const { size, coreRatio, auraRatio, ringRatio, innerRingRatio, tickRatio, strokeRatio } = PORTAL_MARKERS.texture
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  const center = size / 2
  const { r, g, b } = accentColor
  const rgb = `${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}`

  // The aura is what makes a portal read as a light source at exploration
  // zoom; a bare glyph at this scale disappears into the terrain colours,
  // especially over the bright biomes.
  const aura = ctx.createRadialGradient(center, center, size * coreRatio, center, center, center)
  aura.addColorStop(0, 'rgba(255, 255, 255, 0.85)')
  aura.addColorStop(auraRatio, `rgba(${rgb}, 0.4)`)
  aura.addColorStop(1, `rgba(${rgb}, 0)`)
  ctx.fillStyle = aura
  ctx.beginPath()
  ctx.arc(center, center, center, 0, Math.PI * 2)
  ctx.fill()

  ctx.lineWidth = size * strokeRatio
  ctx.lineCap = 'round'

  ctx.strokeStyle = `rgba(${rgb}, 0.9)`
  ctx.beginPath()
  ctx.arc(center, center, size * ringRatio, 0, Math.PI * 2)
  ctx.stroke()

  ctx.strokeStyle = `rgba(${rgb}, 0.55)`
  ctx.beginPath()
  ctx.arc(center, center, size * innerRingRatio, 0, Math.PI * 2)
  ctx.stroke()

  for (let quarter = 0; quarter < 4; quarter += 1) {
    const angle = (quarter * Math.PI) / 2
    const from = size * ringRatio
    const to = from + size * tickRatio
    ctx.beginPath()
    ctx.moveTo(center + Math.cos(angle) * from, center + Math.sin(angle) * from)
    ctx.lineTo(center + Math.cos(angle) * to, center + Math.sin(angle) * to)
    ctx.stroke()
  }

  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)'
  ctx.beginPath()
  ctx.arc(center, center, size * coreRatio, 0, Math.PI * 2)
  ctx.fill()

  return new THREE.CanvasTexture(canvas)
}

/**
 * Marks an object as a portal for the picker, and hangs on it the state
 * the render loop carries between frames.
 *
 * Every form has to do this, so it lives here rather than in each one.
 * `hoverScale` is mutable per-frame state deliberately: it is lerped
 * toward its target so the growth eases in instead of snapping, which
 * means the previous frame's value has to survive somewhere.
 */
function tagPortalObject(object, placement) {
  object.userData.markerType = 'portal'
  object.userData.portal = placement.portal
  object.userData.destinationTitle = placement.destinationTitle
  object.userData.baseScale = placement.baseScale
  object.userData.pulsePhase = placement.pulsePhase
  object.userData.hoverScale = 1
  // Lerped presence, kept here rather than read back off a material, so
  // the render loop never has to know how a form stores it.
  object.userData.opacity = 1
  return object
}

/**
 * The billboard aperture. One Sprite per portal, each with its own
 * material because opacity is per-material in three.js and the
 * section-link dimming is per-portal — but all of them sharing one
 * texture, which a per-sprite canvas was previously duplicating 24 times
 * over.
 */
const apertureForm = {
  id: 'aperture',

  create({ accentColor }) {
    const texture = createApertureTexture(accentColor)
    const materials = []

    return {
      id: 'aperture',

      build(placement) {
        const material = new THREE.SpriteMaterial({
          map: texture,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          // Exempt from the scene's aerial haze. The terrain recedes
          // with distance because that is what makes distance read; a
          // portal is somewhere the reader can GO, and a destination
          // that dissolves into the backdrop is a destination that
          // cannot be found. Scenery fades, affordances do not.
          fog: false,
        })
        materials.push(material)

        const sprite = new THREE.Sprite(material)
        sprite.position.set(placement.x, placement.y, placement.z)
        sprite.scale.set(placement.baseScale, placement.baseScale, 1)
        return tagPortalObject(sprite, placement)
      },

      apply(object, { scale, opacity }) {
        // A sprite's third scale component is unused, and the aura is
        // round, so the glyph stays circular at any size.
        object.scale.set(scale, scale, 1)
        object.material.opacity = opacity
      },

      dispose() {
        for (const material of materials) material.dispose()
        materials.length = 0
        texture.dispose()
      },
    }
  },
}

/**
 * A pink/cyan swirl — deliberately not a ring in the accent colour.
 *
 * Section halos are additive gold ribbons draped on the ground. A lit
 * stone torus read as another of those, especially from orbit. This form
 * uses a different vocabulary: magenta and cyan, a knot that reads as
 * motion, spinning around the surface normal so it never settles into
 * the halo language.
 */
const vortexForm = {
  id: 'vortex',

  create() {
    // Shared geometries — ≤24 portals, low segment counts.
    const knot = new THREE.TorusKnotGeometry(0.42, 0.11, 48, 6, 2, 3)
    const rim = new THREE.TorusGeometry(0.62, 0.045, 6, 24)
    rim.rotateX(Math.PI / 2)
    const core = new THREE.SphereGeometry(0.14, 10, 8)
    const geometries = [knot, rim, core]
    const materials = []
    const up = new THREE.Vector3(0, 0, 1)
    const normal = new THREE.Vector3()
    const { pink, cyan, core: coreHex } = PORTAL_MARKERS.vortex

    const makeGlow = (hex) => {
      const material = new THREE.MeshBasicMaterial({
        color: hex,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        // Destinations must not haze into the backdrop — same rule as
        // the aperture and the section markers' exemption.
        fog: false,
      })
      materials.push(material)
      return material
    }

    return {
      id: 'vortex',

      build(placement) {
        const swirl = new THREE.Group()
        swirl.add(new THREE.Mesh(knot, makeGlow(pink)))
        const cyanRim = new THREE.Mesh(rim, makeGlow(cyan))
        cyanRim.rotation.z = 0.6
        swirl.add(cyanRim)
        swirl.add(new THREE.Mesh(core, makeGlow(coreHex)))

        const group = new THREE.Group()
        group.add(swirl)
        group.position.set(placement.x, placement.y, placement.z)
        normal.set(placement.normal.x, placement.normal.y, placement.normal.z)
        if (normal.lengthSq() > 0) {
          normal.normalize()
          group.quaternion.setFromUnitVectors(up, normal)
        }
        group.scale.setScalar(placement.baseScale)
        group.userData.swirl = swirl
        return tagPortalObject(group, placement)
      },

      apply(object, { scale, opacity, time = 0 }) {
        object.scale.setScalar(scale)
        for (const child of object.children[0]?.children ?? []) {
          if (child.material) child.material.opacity = opacity
        }
        // Spin around the surface normal (local Z after orientation).
        const swirl = object.userData.swirl
        if (swirl) {
          swirl.rotation.z = time * PORTAL_MARKERS.vortex.spin + object.userData.pulsePhase
        }
      },

      dispose() {
        for (const material of materials) material.dispose()
        materials.length = 0
        for (const geometry of geometries) geometry.dispose()
      },
    }
  },
}

/** Every shape a portal can take, by id. */
export const PORTAL_FORMS = Object.freeze({
  [vortexForm.id]: vortexForm,
  [apertureForm.id]: apertureForm,
})

/** The shape the map uses when nothing says otherwise. */
export const DEFAULT_PORTAL_FORM = vortexForm.id

/**
 * Which form an id names, falling back to the default for an
 * unrecognised one rather than throwing — the same tolerance
 * getProjection() shows, and for the same reason: a stale stored
 * preference should not leave a world with no portals in it.
 *
 * Separate from createPortalForm so the choice can be checked without
 * building anything. Creating the aperture draws to a canvas, which a
 * headless test has no context for.
 *
 * @param {string} [id] key in PORTAL_FORMS
 */
export function resolvePortalForm(id = DEFAULT_PORTAL_FORM) {
  return PORTAL_FORMS[id] ?? PORTAL_FORMS[DEFAULT_PORTAL_FORM]
}

/**
 * Creates the form for one layer, which then owns whatever its objects
 * share until it is disposed.
 *
 * @param {string} [id] key in PORTAL_FORMS
 * @param {{ accentColor: { r: number, g: number, b: number } }} options
 */
export function createPortalForm(id, options) {
  return resolvePortalForm(id).create(options)
}
