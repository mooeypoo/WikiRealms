import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { brightenFishVertexColors, preparePetScene } from '../../../src/ui/rendering/creatureAssets.js'

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

  it('lifts near-black vertex colours so fish markings read under globe light', () => {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3),
    )
    // Authored MTL Kd values for Clownfish_Dark / Main / Light.
    geometry.setAttribute(
      'color',
      new THREE.BufferAttribute(new Float32Array([0.003, 0.003, 0.003, 0.032, 0.009, 0.003, 0.04, 0.04, 0.04]), 3),
    )

    brightenFishVertexColors(geometry)
    const colors = geometry.getAttribute('color')
    let maxL = 0
    for (let i = 0; i < colors.count; i += 1) {
      const l = 0.2126 * colors.getX(i) + 0.7152 * colors.getY(i) + 0.0722 * colors.getZ(i)
      maxL = Math.max(maxL, l)
    }
    expect(maxL).toBeGreaterThan(0.7)
    // Darkest marking stays darker than the lightest.
    const l0 = 0.2126 * colors.getX(0) + 0.7152 * colors.getY(0) + 0.0722 * colors.getZ(0)
    const l2 = 0.2126 * colors.getX(2) + 0.7152 * colors.getY(2) + 0.0722 * colors.getZ(2)
    expect(l0).toBeLessThan(l2)
  })
})
