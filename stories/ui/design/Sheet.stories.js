import { h, ref } from 'vue'
import Sheet from '../../../src/ui/design/Sheet.vue'

/**
 * Every summoned surface is this component. The stories exist for the parts
 * a unit test can assert but not judge: whether the drag feels like it has
 * weight, whether the snap lands where a thumb expects, and whether focus
 * visibly returns to the control that opened the surface.
 *
 * Switch the viewport preset while `Responsive` is open — the presentation
 * changes underneath you, which is the behaviour the Ledger depends on at
 * the `short` breakpoint.
 */
export default {
  title: 'Design/Sheet',
  component: Sheet,
}

const trigger = {
  minHeight: 'var(--hit)',
  padding: '0 var(--spacing-lg)',
  border: '1px solid var(--edge-accent)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--accent-wash)',
  color: 'var(--accent-ink)',
  font: 'inherit',
  fontSize: 'var(--text-sm)',
}

const mono = { fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.12em', color: 'var(--ink-3)' }

function paragraphs(count) {
  return Array.from({ length: count }, (_, index) =>
    h(
      'p',
      { key: index, style: { color: 'var(--ink-2)', fontSize: 'var(--text-sm)', lineHeight: 1.55 } },
      'Ringlet positions were measured across several occultations and found to be stable. Density waves propagate outward from the inner edge at a predictable rate.',
    ),
  )
}

/**
 * @param {object} sheetProps passed through to Sheet
 * @param {string} blurb what to look for in this presentation
 */
function bench(sheetProps, blurb, bodyLength = 8) {
  return () => ({
    setup() {
      const open = ref(false)
      const snap = ref(sheetProps.snap ?? 1)

      return () =>
        h('div', { style: { padding: 'var(--spacing-xl)', display: 'grid', gap: 'var(--spacing-md)', justifyItems: 'start', color: 'var(--ink-1)' } }, [
          h('button', { style: trigger, onClick: () => (open.value = true) }, 'Open the surface'),
          h('p', { style: { ...mono, margin: 0, maxWidth: '46ch', lineHeight: 1.6 } }, blurb),
          h('p', { style: { ...mono, margin: 0 } }, `snap index: ${snap.value}`),

          h(
            Sheet,
            {
              ...sheetProps,
              open: open.value,
              snap: snap.value,
              'onUpdate:snap': (value) => (snap.value = value),
              onClose: () => (open.value = false),
            },
            {
              header: () =>
                h('div', { style: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 'var(--spacing-md)' } }, [
                  h('h2', { style: { margin: 0, fontSize: 'var(--text-lg)' } }, 'Cassini Division'),
                  h('span', { style: mono }, 'EN.WIKIPEDIA'),
                ]),
              default: () => paragraphs(bodyLength),
              footer: () =>
                h('button', { style: trigger, onClick: () => (open.value = false) }, 'Close'),
            },
          ),
        ])
    },
  })
}

export const Dialog = {
  render: bench(
    { id: 'story-dialog', presentation: 'dialog', label: 'Dialog example' },
    'Centred and modal. Escape closes it, the scrim closes it, Tab cycles inside it, and focus should land back on the trigger when it goes.',
  ),
}

export const BottomSheet = {
  render: bench(
    { id: 'story-sheet', presentation: 'sheet', label: 'Bottom sheet example', snapPoints: [0.14, 0.45, 0.9] },
    'Drag the grip. It should snap to a third, half or nearly full height, resist past the tallest, and dismiss if you throw it below the smallest.',
  ),
}

export const Drawer = {
  render: bench(
    { id: 'story-drawer', presentation: 'drawer', side: 'right', label: 'Drawer example' },
    'In from the side. This is what the Ledger becomes on a landscape phone, where height is the scarce axis — try the `short` viewport preset.',
  ),
}

export const LedgerPanel = {
  render: bench(
    {
      id: 'story-panel',
      presentation: 'panel',
      side: 'left',
      modal: false,
      label: 'Panel example',
    },
    'Non-modal: no scrim, no focus trap, no scroll lock, and the world behind stays usable. Tab should carry you out of it rather than cycling.',
    4,
  ),
}

export const Responsive = {
  render: bench(
    { id: 'story-auto', modal: false, label: 'Responsive example', snapPoints: [0.14, 0.45, 0.9] },
    'presentation="auto". Panel on desktop, bottom sheet below md, drawer when short. Change the viewport preset with this open and watch it move.',
  ),
}
