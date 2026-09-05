import { h, ref } from 'vue'
import Helm from '../../../src/ui/components/Helm.vue'

/**
 * The helm is fixed to the viewport, so these stories are about POSITION as
 * much as appearance: whether it stays in the thumb zone, whether it clears
 * where the Ledger will sit, and whether it crosses to the opposite edge at
 * the `short` breakpoint. Change the viewport preset with it on screen.
 */
export default {
  title: 'Instruments/Helm',
  component: Helm,
  parameters: { layout: 'fullscreen' },
}

const note = {
  fontFamily: 'var(--font-mono)',
  fontSize: '10px',
  letterSpacing: '0.12em',
  color: 'var(--ink-3)',
  padding: 'var(--spacing-xl)',
  maxWidth: '44ch',
  lineHeight: 1.7,
}

const asStory = (build) => () => ({ setup: () => build })

export const Live = {
  render: () => ({
    setup() {
      const worldShape = ref('sphere')
      const recentres = ref(0)

      return () =>
        h('div', {}, [
          h('p', { style: note }, [
            'The only persistent control that changes the WORLD rather than the app, which is why it sits beside the stage rather than among the utility icons. ',
            `Shape: ${worldShape.value}. Recentres: ${recentres.value}.`,
          ]),
          h(Helm, {
            worldShape: worldShape.value,
            'onUpdate:worldShape': (value) => (worldShape.value = value),
            onRecenter: () => (recentres.value += 1),
          }),
        ])
    },
  }),
}

export const Flat = {
  render: asStory(() =>
    h('div', {}, [
      h('p', { style: note }, 'The flat map: the same generated world, seen as a 2:1 chart rather than a globe.'),
      h(Helm, { worldShape: 'flat' }),
    ]),
  ),
}

/** While a world is generating: present, holding its place, inert. */
export const Disabled = {
  render: asStory(() =>
    h('div', {}, [
      h('p', { style: note }, 'Inert while a world loads. It holds its position rather than disappearing and returning, so nothing shifts under the pointer.'),
      h(Helm, { worldShape: 'sphere', disabled: true }),
    ]),
  ),
}
