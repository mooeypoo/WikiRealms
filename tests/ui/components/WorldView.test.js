import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import WorldView from '../../../src/ui/components/WorldView.vue'

function makeWorld(overrides = {}) {
  const width = 4
  const height = 4
  const cellCount = width * height

  return {
    worldId: 'en:1@1:v1',
    terrain: {
      width,
      height,
      heightMap: new Float64Array(cellCount).fill(0.5),
      lushnessMap: new Float32Array(cellCount).fill(0.5),
      biomeMap: new Uint8Array(cellCount).fill(2),
    },
    portals: [{ portalId: 'portal-0', targetArticleId: 'Physics', gridX: 1, gridY: 2, origin: 'article-link' }],
    ...overrides,
  }
}

describe('WorldView', () => {
  it('sizes the canvas to the terrain grid at 4px per cell', () => {
    const wrapper = mount(WorldView, { props: { world: makeWorld() } })

    const canvas = wrapper.find('canvas')
    expect(canvas.attributes('width')).toBe('16')
    expect(canvas.attributes('height')).toBe('16')
  })

  it('renders one portal marker per portal, positioned by grid coordinates', () => {
    const wrapper = mount(WorldView, { props: { world: makeWorld() } })

    const portalButtons = wrapper.findAll('.world-view__portal')
    expect(portalButtons).toHaveLength(1)
    expect(portalButtons[0].attributes('style')).toContain('left: 4px')
    expect(portalButtons[0].attributes('style')).toContain('top: 8px')
    expect(portalButtons[0].attributes('title')).toBe('Travel to Physics')
  })

  it('emits portal-click with the portal and where its marker sits', async () => {
    const wrapper = mount(WorldView, { props: { world: makeWorld() } })

    await wrapper.find('.world-view__portal').trigger('click')

    expect(wrapper.emitted('portal-click')).toBeTruthy()
    const [payload] = wrapper.emitted('portal-click')[0]
    expect(payload.portal.targetArticleId).toBe('Physics')
    // The anchor is the marker's own centre, so a preview card points at
    // the portal rather than at wherever inside it the click landed.
    expect(payload.anchor).toEqual({ x: expect.any(Number), y: expect.any(Number) })
  })

  it('renders no portal markers when the world has none', () => {
    const wrapper = mount(WorldView, { props: { world: makeWorld({ portals: [] }) } })

    expect(wrapper.findAll('.world-view__portal')).toHaveLength(0)
  })
})
