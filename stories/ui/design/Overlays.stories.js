import { h, ref } from 'vue'
import { useKeymap } from '../../../src/ui/design/useKeymap.js'
import { useOverlays } from '../../../src/ui/design/useOverlays.js'
import { useViewport } from '../../../src/ui/design/useViewport.js'

/**
 * The overlay infrastructure has no visual form of its own — <Sheet> gives it
 * one next. This bench exists so the parts a unit test can only partly prove
 * can be felt: that Escape peels one layer at a time, that focus lands back
 * on the control that opened a surface, and that opening a peer replaces
 * rather than stacks.
 *
 * Try: open the guide, then settings (the guide goes). Open settings, then
 * the confirm (it layers). Press Escape twice. Watch where the focus ring
 * ends up.
 */
export default {
  title: 'Design/Overlay infrastructure',
  parameters: { layout: 'fullscreen' },
}

const panel = {
  padding: 'var(--spacing-lg)',
  border: '1px solid var(--edge-hair)',
  borderRadius: 'var(--radius-lg)',
  background: 'var(--surface-1)',
  display: 'grid',
  gap: 'var(--spacing-md)',
  alignContent: 'start',
}

const mono = { fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.12em', color: 'var(--ink-3)' }

const button = {
  minHeight: 'var(--hit)',
  padding: '0 var(--spacing-md)',
  border: '1px solid var(--edge-accent)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--accent-wash)',
  color: 'var(--accent-ink)',
  font: 'inherit',
  fontSize: 'var(--text-sm)',
}

function heading(text) {
  return h('div', { style: { ...mono, textTransform: 'uppercase' } }, text)
}

export const Bench = {
  render: () => ({
    setup() {
      const overlays = useOverlays()
      const viewport = useViewport()
      const { register, shortcuts } = useKeymap()
      const log = ref([])

      const note = (line) => {
        log.value = [`${new Date().toLocaleTimeString()} · ${line}`, ...log.value].slice(0, 8)
      }

      const summon = (id, options = {}) => {
        overlays.open(id, { ...options, onClose: () => note(`${id} closed`) })
        note(`${id} opened`)
      }

      register({ keys: 'g', label: 'Open the field guide', group: 'Bench', run: () => summon('guide') })
      register({ keys: 'mod+k', label: 'Search', group: 'Bench', run: () => summon('search') })

      return () =>
        h('div', { style: { padding: 'var(--spacing-xl)', display: 'grid', gap: 'var(--spacing-lg)', color: 'var(--ink-1)' } }, [
          h('div', { style: { display: 'grid', gap: 'var(--spacing-lg)', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' } }, [
            h('div', { style: panel }, [
              heading('Summon'),
              h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 'var(--spacing-sm)' } }, [
                h('button', { style: button, onClick: () => summon('guide') }, 'Guide (peer)'),
                h('button', { style: button, onClick: () => summon('settings') }, 'Settings (peer)'),
                h('button', { style: button, onClick: () => summon('confirm', { exclusive: false }) }, 'Confirm (layers)'),
                h('button', { style: button, onClick: () => summon('ledger', { modal: false, exclusive: false }) }, 'Ledger (non-modal)'),
                h('button', { style: button, onClick: () => summon('travelling', { dismissible: false }) }, 'Travelling (no Escape)'),
              ]),
              h('div', { style: { display: 'flex', gap: 'var(--spacing-sm)' } }, [
                h('button', { style: button, onClick: () => overlays.closeTop() }, 'Close top'),
                h('button', { style: button, onClick: () => overlays.closeAll() }, 'Close all'),
              ]),
            ]),

            h('div', { style: panel }, [
              heading('Stack · topmost last'),
              overlays.stack.value.length === 0
                ? h('p', { style: { ...mono, margin: 0 } }, 'empty')
                : h(
                    'ol',
                    { style: { margin: 0, paddingLeft: '1.2em', display: 'grid', gap: '4px' } },
                    overlays.stack.value.map((entry, index) =>
                      h(
                        'li',
                        {
                          key: entry.id,
                          style: {
                            fontFamily: 'var(--font-mono)',
                            fontSize: '11px',
                            color: index === overlays.stack.value.length - 1 ? 'var(--accent)' : 'var(--ink-2)',
                          },
                        },
                        `${entry.id}${entry.modal ? '' : ' · non-modal'}${entry.dismissible ? '' : ' · sticky'}`,
                      ),
                    ),
                  ),
              h('p', { style: { ...mono, margin: 0 } }, `scroll locked: ${overlays.hasModal.value}`),
            ]),

            h('div', { style: panel }, [
              heading('Viewport'),
              h('div', { style: { fontFamily: 'var(--font-mono)', fontSize: '13px', display: 'grid', gap: '4px' } }, [
                h('div', {}, `breakpoint  ${viewport.breakpoint.value}`),
                h('div', {}, `size        ${viewport.width.value} x ${viewport.height.value}`),
                h('div', {}, `short       ${viewport.isShort.value}`),
                h('div', {}, `touch       ${viewport.isTouch.value}`),
              ]),
              h('p', { style: { ...mono, margin: 0 } }, 'Switch viewport presets in the toolbar to watch these change.'),
            ]),

            h('div', { style: panel }, [
              heading('Shortcuts · generated, not restated'),
              ...shortcuts.value.map((group) =>
                h('div', { key: group.group, style: { display: 'grid', gap: '4px' } }, [
                  h('div', { style: mono }, group.group),
                  ...group.items.map((item) =>
                    h('div', { key: item.label, style: { display: 'flex', justifyContent: 'space-between', gap: 'var(--spacing-md)', fontSize: 'var(--text-sm)' } }, [
                      h('span', { style: { color: 'var(--ink-2)' } }, item.label),
                      h('span', { style: { fontFamily: 'var(--font-mono)', color: 'var(--accent)' } }, item.keys.join(' / ')),
                    ]),
                  ),
                ]),
              ),
            ]),
          ]),

          h('div', { style: panel }, [
            heading('Log'),
            ...(log.value.length === 0
              ? [h('p', { style: { ...mono, margin: 0 } }, 'nothing yet')]
              : log.value.map((line, index) => h('div', { key: index, style: { ...mono, color: 'var(--ink-2)' } }, line))),
          ]),
        ])
    },
  }),
}
