import WorldView3D from '../../../src/ui/components/WorldView3D.vue'
import { cassiniDivisionArticle, cassiniDivisionWorld } from '../../fixtures/cassiniDivision.js'

/**
 * The stage. Both stories render the identical generated world — `worldShape`
 * is a rendering choice, never a regeneration — which is exactly the property
 * docs/ux-vision.md D1 turns into the Helm's single view axis.
 */
export default {
  title: 'Stage/WorldView3D',
  component: WorldView3D,
  args: {
    world: cassiniDivisionWorld,
    categories: cassiniDivisionArticle.categories,
    showSections: true,
    showPortals: true,
    showFoliage: true,
  },
  argTypes: {
    worldShape: { control: 'inline-radio', options: ['sphere', 'flat'] },
    world: { control: false },
    categories: { control: false },
    onPortalClick: { action: 'portal-click' },
    onSectionClick: { action: 'section-click' },
  },
  parameters: {
    // The canvas is one <canvas>; axe has nothing to say about it, and the
    // WebGL context makes its scan expensive. Chrome gets audited instead.
    a11y: { disable: true },
  },
}

export const Planet = {
  args: { worldShape: 'sphere' },
}

export const Flat = {
  args: { worldShape: 'flat' },
}

/** Every marker layer off — the terrain alone, as the immersive mode shows it. */
export const BareTerrain = {
  args: {
    worldShape: 'sphere',
    showSections: false,
    showPortals: false,
    showFoliage: false,
  },
}

/**
 * Close-up fauna: science-heavy categories (Cassini is astronomy) so blue
 * hoppers dominate, foliage on so blobs are visible in the living world.
 */
export const WithBlobs = {
  args: {
    worldShape: 'sphere',
    categories: [
      'Astronomy',
      'Planetary science',
      'Rings of Saturn',
      'Mammals of fiction',
      'Olympic sports',
    ],
  },
}

