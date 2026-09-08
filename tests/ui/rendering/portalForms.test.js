import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  DEFAULT_PORTAL_FORM,
  PORTAL_FORMS,
  createApertureTexture,
  resolvePortalForm,
} from '../../../src/ui/rendering/portalForms.js'
import { placePortals } from '../../../src/ui/rendering/portalPlacement.js'
import { PORTAL_MARKERS } from '../../../src/ui/rendering/portalMarkers.js'
import { flatProjection } from '../../../src/ui/rendering/projection.js'

const ACCENT = { r: 1, g: 0.84, b: 0.55 }

function placement(overrides = {}) {
  const terrain = { width: 8, height: 8, heightMap: new Float64Array(64).fill(0.5) }
  const [base] = placePortals(
    [{ portalId: 'p-1', gridX: 4, gridY: 4, targetTitle: 'Saturn', sectionIndex: 2 }],
    terrain,
    10,
    flatProjection,
  )
  return { ...base, ...overrides }
}

describe('createApertureTexture', () => {
  it('produces a texture without typing a glyph', () => {
    // jsdom has no 2D context, so this is the one thing here that cannot
    // run under the suite — guarded rather than skipped outright so it
    // runs anywhere a canvas is available.
    const canvas = document.createElement('canvas')
    if (!canvas.getContext('2d')) return

    expect(createApertureTexture(ACCENT)).toBeInstanceOf(THREE.CanvasTexture)
  })
})

describe('PORTAL_FORMS', () => {
  it('registers the aperture as the default', () => {
    expect(DEFAULT_PORTAL_FORM).toBe('aperture')
    expect(PORTAL_FORMS[DEFAULT_PORTAL_FORM]).toBeDefined()
  })

  it('every registered form declares the whole contract', () => {
    for (const [id, form] of Object.entries(PORTAL_FORMS)) {
      expect(form.id, `${id} should know its own id`).toBe(id)
      expect(typeof form.create).toBe('function')
    }
  })
})

describe('resolvePortalForm', () => {
  it('falls back to the default for an unrecognised id', () => {
    // A stale stored preference should not leave a world with no portals
    // in it — the same tolerance getProjection() shows.
    expect(resolvePortalForm('a-shape-nobody-wrote').id).toBe(DEFAULT_PORTAL_FORM)
    expect(resolvePortalForm(undefined).id).toBe(DEFAULT_PORTAL_FORM)
  })

  it('returns the form an id names', () => {
    expect(resolvePortalForm('aperture').id).toBe('aperture')
  })
})

/**
 * The contract, exercised against a form that is not the aperture.
 *
 * This is the point of the registry: one form exists today and the shape
 * is meant to become something with geometry later. A second
 * implementation written here proves the seam carries a different shape
 * rather than merely describing the sprite that already worked — and it
 * runs under jsdom, which the aperture's canvas cannot.
 */
const stoneArchStub = {
  id: 'stone-arch-stub',
  create() {
    const material = new THREE.MeshBasicMaterial()
    const geometry = new THREE.BoxGeometry(1, 1, 1)
    let disposed = false

    return {
      id: 'stone-arch-stub',
      get disposed() {
        return disposed
      },
      build(place) {
        const group = new THREE.Group()
        // A lintel and two posts: a form whose objects are groups, which
        // is why the component resolves a hit by walking up to the
        // nearest ancestor claiming to be a portal.
        for (const offset of [-0.5, 0, 0.5]) {
          const part = new THREE.Mesh(geometry, material)
          part.position.x = offset
          group.add(part)
        }
        group.position.set(place.x, place.y, place.z)
        // Standing up along the ground's own normal, which the sprite
        // never needed and this does.
        group.quaternion.setFromUnitVectors(
          new THREE.Vector3(0, 0, 1),
          new THREE.Vector3(place.normal.x, place.normal.y, place.normal.z),
        )
        group.userData.markerType = 'portal'
        group.userData.portal = place.portal
        group.userData.destinationTitle = place.destinationTitle
        group.userData.baseScale = place.baseScale
        group.userData.pulsePhase = place.pulsePhase
        group.userData.hoverScale = 1
        group.userData.opacity = 1
        return group
      },
      apply(object, { scale, opacity }) {
        // Uniformly, not as a billboard's two axes — and opacity through
        // a material the render loop never sees.
        object.scale.setScalar(scale)
        object.children[0].material.opacity = opacity
      },
      dispose() {
        geometry.dispose()
        material.dispose()
        disposed = true
      },
    }
  },
}

describe('the form contract', () => {
  it('builds an object positioned where the placement says', () => {
    const form = stoneArchStub.create({ accentColor: ACCENT })
    const place = placement()
    const object = form.build(place)

    expect(object.position.toArray()).toEqual([place.x, place.y, place.z])
    form.dispose()
  })

  it('tags every object so the picker can identify it', () => {
    const form = stoneArchStub.create({ accentColor: ACCENT })
    const place = placement()
    const object = form.build(place)

    expect(object.userData.markerType).toBe('portal')
    expect(object.userData.portal).toBe(place.portal)
    expect(object.userData.destinationTitle).toBe('Saturn')
    form.dispose()
  })

  it('carries the per-frame state the render loop lerps between frames', () => {
    // hoverScale and opacity have to survive from one frame to the next,
    // or the growth snaps instead of easing.
    const form = stoneArchStub.create({ accentColor: ACCENT })
    const object = form.build(placement())

    expect(object.userData.hoverScale).toBe(1)
    expect(object.userData.opacity).toBe(1)
    expect(object.userData.baseScale).toBe(PORTAL_MARKERS.baseScale)
    form.dispose()
  })

  it('is the only route by which scale and opacity reach the object', () => {
    const form = stoneArchStub.create({ accentColor: ACCENT })
    const object = form.build(placement())

    form.apply(object, { scale: 4, opacity: 0.25 })

    expect(object.scale.toArray()).toEqual([4, 4, 4])
    expect(object.children[0].material.opacity).toBe(0.25)
    form.dispose()
  })

  it('resolves a hit on a child part to the portal object', () => {
    // The walk the component does, against a form that needs it.
    const form = stoneArchStub.create({ accentColor: ACCENT })
    const object = form.build(placement())

    let node = object.children[1]
    while (node && node.userData.markerType === undefined) node = node.parent

    expect(node).toBe(object)
    form.dispose()
  })

  it('stands its objects up along the placement normal', () => {
    const form = stoneArchStub.create({ accentColor: ACCENT })
    const object = form.build(placement({ normal: { x: 0, y: 1, z: 0 } }))
    const up = new THREE.Vector3(0, 0, 1).applyQuaternion(object.quaternion)

    expect(up.y).toBeCloseTo(1, 5)
    form.dispose()
  })

  it('releases its shared resources as a unit', () => {
    const form = stoneArchStub.create({ accentColor: ACCENT })
    form.build(placement())
    form.dispose()

    expect(form.disposed).toBe(true)
  })
})
