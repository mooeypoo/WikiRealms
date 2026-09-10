import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { prepareFountainProp } from '../../../src/ui/rendering/fountainAssets.js'

describe('prepareFountainProp', () => {
  it('normalises a Y-up prop to unit Z-up height with feet on the ground', () => {
    const scene = new THREE.Group()
    const stone = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.5, 1, 8),
      new THREE.MeshStandardMaterial({ color: 0x888888 }),
    )
    stone.position.y = 0.5
    scene.add(stone)

    const root = prepareFountainProp(scene)
    const box = new THREE.Box3().setFromObject(root)
    expect(box.max.z - box.min.z).toBeCloseTo(1, 4)
    expect(box.min.z).toBeCloseTo(0, 4)
  })
})
