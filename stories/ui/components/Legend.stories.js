import { h } from 'vue'
import Legend from '../../../src/ui/components/Legend.vue'

/**
 * The legend points at real features, so these stories fake the anchors the
 * renderer would supply. The thing to judge is whether a pin reads as
 * belonging to what it points at, and whether the key is scannable without
 * being a wall.
 */
export default {
  title: 'Instruments/Legend',
  component: Legend,
  parameters: { layout: 'fullscreen' },
}

const asStory = (build) => () => ({ setup: () => build })

export const Annotated = {
  render: asStory(() =>
    h(Legend, {
      show: true,
      anchors: {
        range: { x: 320, y: 380, label: 'Structure is a section' },
        portal: { x: 620, y: 260, label: 'A portal to Saturn' },
      },
    }),
  ),
}

/** Nothing visible to point at — everything falls back to the key. */
export const KeyOnly = { render: asStory(() => h(Legend, { show: true })) }

/** A pin near the top edge, where the label has nowhere to go above. */
export const NearTheEdge = {
  render: asStory(() => h(Legend, { show: true, anchors: { portal: { x: 80, y: 60 } } })),
}
