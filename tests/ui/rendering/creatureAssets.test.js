import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { preparePetScene } from '../../../src/ui/rendering/creatureAssets.js'

describe('preparePetScene', () => {
  it('merges meshes into a Z-up unit-height model with feet on the ground', () => {
    const root = new THREE.Group()
    const body = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1))
    body.position.set(0, 0.5, 0) // Kenney-style: Y-up, resting on y=0
    root.add(body)

    const { geometry, material } = preparePetScene(root)
    geometry.computeBoundingBox()
    const size = new THREE.Vector3()
    geometry.boundingBox.getSize(size)

    expect(size.z).toBeCloseTo(1, 5)
    expect(geometry.boundingBox.min.z).toBeCloseTo(0, 5)
    expect(material).toBeTruthy()

    geometry.dispose()
    material.dispose()
  })
})
