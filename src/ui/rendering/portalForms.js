/**
 * WHAT a portal looks like — one implementation per shape, behind one
 * contract, so the shape can be replaced without touching the renderer.
 *
 * Three shapes ship: `fountain` (Kenney Fantasy Town round fountain —
 * the spike default), `vortex` (pink/cyan swirl), and `aperture` (the
 * older additive billboard, kept so a preference can still ask).
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
 * portal cap (see PORTAL_LIMITS.maxPortals) separate meshes are cheap enough that we do not
 * instance yet.
 */
import * as THREE from 'three'
import { PORTAL_MARKERS } from './portalMarkers.js'
import {
  FOUNTAIN_BEAM,
  FOUNTAIN_GROUND_CLEARANCE,
  FOUNTAIN_SCALE_MUL,
  getFountainAsset,
} from './fountainAssets.js'

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
        const glow = opacity * PORTAL_MARKERS.vortex.intensity
        for (const child of object.children[0]?.children ?? []) {
          if (child.material) child.material.opacity = glow
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

/**
 * Soft vertical falloff for the fountain beacon — brighter at the base,
 * fading upward, with a radial soft edge. DataTexture so jsdom tests
 * do not need a canvas 2D context.
 *
 * @returns {THREE.DataTexture}
 */
export function createFountainBeamTexture() {
  const width = 32
  const height = 64
  const data = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    const along = y / (height - 1)
    // Bottom of the texture is the base of the beam (brighter).
    const vertical = Math.pow(1 - along, 1.15)
    for (let x = 0; x < width; x += 1) {
      const nx = ((x + 0.5) / width) * 2 - 1
      const radial = Math.pow(Math.max(0, 1 - Math.abs(nx)), 2.1)
      const alpha = Math.round(255 * vertical * radial)
      const i = (y * width + x) * 4
      // Cyan-tinted white; material colour multiplies this.
      data[i] = 200
      data[i + 1] = 240
      data[i + 2] = 255
      data[i + 3] = alpha
    }
  }
  const texture = new THREE.DataTexture(data, width, height)
  texture.needsUpdate = true
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  return texture
}

/**
 * 0 at rest → 1 at full hover grow, matching the lerped hoverScale the
 * render loop already carries on each portal object.
 *
 * @param {number} hoverScale
 */
export function fountainHoverAmount(hoverScale) {
  const max = PORTAL_MARKERS.hover.scale
  if (!(max > 1)) return 0
  return Math.min(1, Math.max(0, (hoverScale - 1) / (max - 1)))
}

/**
 * Kenney Fantasy Town round fountain — a place you walk to, not a VFX orb.
 *
 * Sits lightly above the ground (undoes the vortex hoverOffset), tilts
 * with the surface normal, and raises a soft vertical beacon so it stays
 * findable through vegetation without carpeting the section.
 */
const fountainForm = {
  id: 'fountain',

  create() {
    const up = new THREE.Vector3(0, 0, 1)
    const normal = new THREE.Vector3()
    const rimGeometry = new THREE.TorusGeometry(0.48, 0.028, 6, 24)
    rimGeometry.rotateX(Math.PI / 2)
    const glowGeometry = new THREE.SphereGeometry(0.85, 12, 10)
    const beamTexture = createFountainBeamTexture()
    const beamGeometry = new THREE.PlaneGeometry(FOUNTAIN_BEAM.width, FOUNTAIN_BEAM.height)
    // Plane was XY; tip it so height runs along local +Z (surface up).
    beamGeometry.rotateX(Math.PI / 2)
    const sharedMaterials = []
    const beamMaterials = []

    const makeGlowMaterial = (opacity) => {
      const material = new THREE.MeshBasicMaterial({
        color: PORTAL_MARKERS.vortex.cyan,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
        opacity,
      })
      sharedMaterials.push(material)
      return material
    }

    const makeBeamMaterial = () => {
      const material = new THREE.MeshBasicMaterial({
        map: beamTexture,
        color: PORTAL_MARKERS.vortex.cyan,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
        side: THREE.DoubleSide,
        opacity: FOUNTAIN_BEAM.idleOpacity,
      })
      beamMaterials.push(material)
      return material
    }

    /** Skip picking — the stone prop is the hit target, not the VFX. */
    const unpickable = (mesh) => {
      mesh.raycast = () => {}
      return mesh
    }

    return {
      id: 'fountain',

      build(placement) {
        const asset = getFountainAsset()
        const group = new THREE.Group()

        if (asset?.template) {
          const prop = asset.template.clone(true)
          const opacities = new Map()
          prop.traverse((child) => {
            if (!child.isMesh || !child.material) return
            if (Array.isArray(child.material)) {
              child.material = child.material.map((material) => {
                const own = material.clone()
                opacities.set(own, material.opacity ?? 1)
                return own
              })
            } else {
              const own = child.material.clone()
              opacities.set(own, child.material.opacity ?? 1)
              child.material = own
            }
          })
          group.add(prop)
          group.userData.baseOpacities = opacities
        } else {
          // Asset still loading — a quiet placeholder so the layer is not empty.
          const stub = new THREE.Mesh(
            new THREE.CylinderGeometry(0.28, 0.32, 0.45, 10),
            makeGlowMaterial(0.4),
          )
          stub.rotation.x = Math.PI / 2
          group.add(stub)
          group.userData.baseOpacities = new Map()
        }

        // Soft aura first so the stone reads on top of the glow.
        const glow = unpickable(new THREE.Mesh(glowGeometry, makeGlowMaterial(FOUNTAIN_BEAM.glowIdle)))
        glow.position.z = 0.35
        group.add(glow)
        group.userData.glow = glow

        const rim = unpickable(new THREE.Mesh(rimGeometry, makeGlowMaterial(FOUNTAIN_BEAM.rimIdle)))
        rim.position.z = 0.03
        group.add(rim)
        group.userData.rim = rim

        // Crossed sheets: a soft column that reads from most angles without
        // a heavy solid volume. Own materials so hover can brighten each.
        const beamA = unpickable(new THREE.Mesh(beamGeometry, makeBeamMaterial()))
        const beamB = unpickable(new THREE.Mesh(beamGeometry, makeBeamMaterial()))
        beamB.rotation.z = Math.PI / 2
        // Base of the texture sits just above the basin.
        const beamLift = FOUNTAIN_BEAM.height * 0.5 + 0.35
        beamA.position.z = beamLift
        beamB.position.z = beamLift
        group.add(beamA, beamB)
        group.userData.beams = [beamA, beamB]

        normal.set(placement.normal.x, placement.normal.y, placement.normal.z)
        if (normal.lengthSq() > 0) normal.normalize()
        else normal.set(0, 0, 1)

        group.position.set(placement.x, placement.y, placement.z)
        // Placement still uses the vortex hoverOffset; a ground prop sits
        // back down with a light clearance so it rides the contour.
        group.position.addScaledVector(normal, -(PORTAL_MARKERS.hoverOffset - FOUNTAIN_GROUND_CLEARANCE))
        group.quaternion.setFromUnitVectors(up, normal)
        group.scale.setScalar(placement.baseScale * FOUNTAIN_SCALE_MUL)
        return tagPortalObject(group, placement)
      },

      apply(object, { scale, opacity, hoverScale = object.userData.hoverScale ?? 1 }) {
        object.scale.setScalar(scale * FOUNTAIN_SCALE_MUL)
        const hover = fountainHoverAmount(hoverScale)
        const glowOpacity =
          opacity * (FOUNTAIN_BEAM.glowIdle + (FOUNTAIN_BEAM.glowHover - FOUNTAIN_BEAM.glowIdle) * hover)
        const rimOpacity =
          opacity * (FOUNTAIN_BEAM.rimIdle + (FOUNTAIN_BEAM.rimHover - FOUNTAIN_BEAM.rimIdle) * hover)
        const beamOpacity =
          opacity * (FOUNTAIN_BEAM.idleOpacity + (FOUNTAIN_BEAM.hoverOpacity - FOUNTAIN_BEAM.idleOpacity) * hover)

        const opacities = object.userData.baseOpacities
        object.traverse((child) => {
          if (!child.isMesh || !child.material) return
          if (child === object.userData.glow) {
            child.material.opacity = glowOpacity
            return
          }
          if (child === object.userData.rim) {
            child.material.opacity = rimOpacity
            return
          }
          if (object.userData.beams?.includes(child)) {
            child.material.opacity = beamOpacity
            return
          }
          const materials = Array.isArray(child.material) ? child.material : [child.material]
          for (const material of materials) {
            const base = opacities?.get(material) ?? 1
            material.opacity = base * opacity
          }
        })
      },

      dispose() {
        for (const material of sharedMaterials) material.dispose()
        for (const material of beamMaterials) material.dispose()
        sharedMaterials.length = 0
        beamMaterials.length = 0
        rimGeometry.dispose()
        glowGeometry.dispose()
        beamGeometry.dispose()
        beamTexture.dispose()
      },
    }
  },
}

/** Every shape a portal can take, by id. */
export const PORTAL_FORMS = Object.freeze({
  [fountainForm.id]: fountainForm,
  [vortexForm.id]: vortexForm,
  [apertureForm.id]: apertureForm,
})

/** The shape the map uses when nothing says otherwise. */
export const DEFAULT_PORTAL_FORM = fountainForm.id

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
