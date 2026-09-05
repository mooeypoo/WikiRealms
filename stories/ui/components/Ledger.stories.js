import { h, ref } from 'vue'
import Ledger from '../../../src/ui/components/Ledger.vue'
import { cassiniDivisionArticle, cassiniDivisionWorld } from '../../fixtures/cassiniDivision.js'

/**
 * The panel this replaces had one binary — a title bar, or a 60vh scroller.
 * These stories are about the states in between, and about whether each is
 * genuinely useful rather than a stop on the way to another one.
 *
 * Worth trying at `xs` (a bottom sheet you can drag) and `short` (a right
 * drawer, because height is what is scarce on a landscape phone).
 */
export default {
  title: 'Instruments/Ledger',
  component: Ledger,
  parameters: { layout: 'fullscreen' },
  args: {
    article: cassiniDivisionArticle,
    world: cassiniDivisionWorld,
  },
  argTypes: {
    state: { control: 'inline-radio', options: ['collapsed', 'peek', 'open', 'full'] },
    article: { control: false },
    world: { control: false },
  },
}

const note = {
  fontFamily: 'var(--font-mono)',
  fontSize: '10px',
  letterSpacing: '0.12em',
  color: 'var(--ink-3)',
  padding: 'var(--spacing-xl)',
  maxWidth: '48ch',
  lineHeight: 1.7,
}

/** Drives the state itself, so the controls actually do something. */
function bench(initialState, blurb, extra = {}) {
  return () => ({
    setup() {
      const state = ref(initialState)
      const focused = ref(null)

      return () =>
        h('div', {}, [
          h('div', { style: note }, [
            h('p', { style: { margin: 0 } }, blurb),
            h(
              'p',
              { style: { margin: 'var(--spacing-md) 0 0' } },
              `state: ${state.value}`,
            ),
            h(
              'button',
              {
                style: {
                  marginTop: 'var(--spacing-md)',
                  minHeight: 'var(--hit)',
                  padding: '0 var(--spacing-md)',
                  border: '1px solid var(--edge-accent)',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--accent-wash)',
                  color: 'var(--accent-ink)',
                  font: 'inherit',
                  fontSize: 'var(--text-sm)',
                },
                onClick: () => {
                  // Stand in for a click on a section peak in the world.
                  focused.value = null
                  setTimeout(() => (focused.value = 'Structure'), 0)
                },
              },
              'Click the "Structure" peak',
            ),
          ]),
          h(Ledger, {
            article: cassiniDivisionArticle,
            world: cassiniDivisionWorld,
            state: state.value,
            focusedSection: focused.value,
            'onUpdate:state': (value) => (state.value = value),
            onShare: () => {},
            ...extra,
          }),
        ])
    },
  })
}

export const Open = {
  render: bench(
    'open',
    'The default on a desktop: summary, readouts and the section list, with the world still visible around it.',
  ),
}

export const Peek = {
  render: bench(
    'peek',
    'Where you are and four numbers, and nothing else. The default on a phone, and the state that makes turning the planet around possible without losing your bearings.',
  ),
}

export const Full = {
  render: bench('full', 'Everything, scrolling. Still non-modal: the world is behind it, not dimmed.'),
}

export const Collapsed = {
  render: bench(
    'collapsed',
    'Minimised, not gone. The bar names the realm and reopens the panel — a persistent surface that vanished would take its own way back with it.',
  ),
}

/** The state a click on a section peak produces. */
export const SectionFocus = {
  render: bench(
    'peek',
    'Press the button to stand in for clicking a section peak in the world: the panel should open far enough to show that section, scroll to it, and flash it once.',
  ),
}

export const Stale = {
  render: bench('open', 'The article changed on Wikipedia after this world was generated.', { stale: true }),
}
