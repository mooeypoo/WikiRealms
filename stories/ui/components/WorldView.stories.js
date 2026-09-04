import WorldView from '../../../src/ui/components/WorldView.vue'
import { cassiniDivisionWorld } from '../../fixtures/cassiniDivision.js'

/**
 * The 2D canvas. Per docs/ux-vision.md D1 this stops being a peer of the 3D
 * views and becomes the rendering fallback for devices without usable WebGL,
 * so it needs to stay presentable without being promoted.
 */
export default {
  title: 'Stage/WorldView (2D fallback)',
  component: WorldView,
  args: {
    world: cassiniDivisionWorld,
    showPortals: true,
  },
  argTypes: {
    world: { control: false },
    onPortalClick: { action: 'portal-click' },
  },
}

export const Fallback = {}

export const WithoutPortals = {
  args: { showPortals: false },
}
