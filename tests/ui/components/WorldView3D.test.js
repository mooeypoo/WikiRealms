import { describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import WorldView3D from '../../../src/ui/components/WorldView3D.vue'

function makeWorld() {
  const width = 4
  const height = 4
  const cellCount = width * height
  return {
    worldId: 'en:1@1:v1',
    terrain: {
      width,
      height,
      heightMap: new Float64Array(cellCount).fill(0.5),
      moistureMap: new Float64Array(cellCount).fill(0.5),
      biomeMap: new Uint8Array(cellCount).fill(2),
    },
    portals: [{ portalId: 'portal-0', targetArticleId: 'Physics', gridX: 1, gridY: 2 }],
  }
}

describe('WorldView3D', () => {
  it('mounts without throwing and shows a fallback when WebGL is unavailable (e.g. jsdom test env)', async () => {
    const wrapper = mount(WorldView3D, { props: { world: makeWorld() } })
    await flushPromises()

    expect(wrapper.find('.world-view-3d__fallback').exists()).toBe(true)
    expect(wrapper.find('.world-view-3d__fallback').text()).toContain("isn't supported")
  })

  it('unmounts cleanly without throwing', () => {
    const wrapper = mount(WorldView3D, { props: { world: makeWorld() } })

    expect(() => wrapper.unmount()).not.toThrow()
  })

  it('reacts to a world prop change without throwing', async () => {
    const wrapper = mount(WorldView3D, { props: { world: makeWorld() } })

    await wrapper.setProps({ world: makeWorld() })

    expect(wrapper.exists()).toBe(true)
  })
})
