import { h, ref } from 'vue'
import JourneyMenu from '../../../src/ui/components/JourneyMenu.vue'
import TopScrim from '../../../src/ui/components/TopScrim.vue'
import TrailMenu from '../../../src/ui/components/TrailMenu.vue'

/**
 * The scrim replaced two shells: a fixed taskbar and a floating panel that
 * carried duplicate Info, Settings and Share buttons below 1024px. These
 * stories are mostly about what survives narrowing — the wordmark goes at
 * md, the travel arrows at xs, and the realm name must still be readable
 * with four utility icons beside it.
 */
export default {
  title: 'Instruments/TopScrim',
  component: TopScrim,
  parameters: { layout: 'fullscreen' },
}

const asStory = (build) => () => ({ setup: () => build })

const PATH = [
  { id: 'n1', title: 'Saturn' },
  { id: 'n2', title: 'Rings of Saturn' },
  { id: 'n3', title: 'Cassini Division' },
]

export const WithRealm = {
  render: asStory(() =>
    h(TopScrim, { realm: 'Cassini Division', trailLength: 3, canGoBack: true, canGoForward: false }),
  ),
}

/** A title long enough to prove the truncation, not the happy path. */
export const LongRealm = {
  render: asStory(() =>
    h(TopScrim, {
      realm: 'List of stars in the constellation of Andromeda by apparent magnitude',
      trailLength: 7,
      canGoBack: true,
      canGoForward: true,
    }),
  ),
}

/** Before anything is chosen: identity, tools, nothing to travel through. */
export const Empty = {
  render: asStory(() => h(TopScrim, { realm: null, trailLength: 0 })),
}

/** The scrim with the two surfaces it summons, wired up. */
export const WithMenus = {
  render: () => ({
    setup() {
      const trail = ref(false)
      const journey = ref(false)

      return () =>
        h('div', {}, [
          h(TopScrim, {
            realm: 'Cassini Division',
            trailLength: PATH.length,
            canGoBack: true,
            onTrail: () => (trail.value = true),
            onJourney: () => (journey.value = true),
          }),
          h(TrailMenu, {
            show: trail.value,
            path: PATH,
            onSelect: () => (trail.value = false),
            onClose: () => (trail.value = false),
          }),
          h(JourneyMenu, {
            show: journey.value,
            canShare: true,
            onClose: () => (journey.value = false),
          }),
        ])
    },
  }),
}
