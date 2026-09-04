import { h } from 'vue'

/**
 * The palette, type ramp and spacing scale rendered from the live custom
 * properties — so this page cannot drift from tokens.css the way a
 * hand-maintained style guide would.
 *
 * The contrast numbers are asserted in tests/ui/design/tokens.test.js; this
 * is where you check that the values also *look* right on the stage, which
 * no ratio can tell you.
 */
export default {
  title: 'Design/Tokens',
}

/**
 * A CSF `render` must produce a component DEFINITION, not a vnode: Storybook's
 * Vue renderer treats whatever it returns as a component, so a bare vnode
 * renders as "[object Object]". setup() returning the build function makes
 * that function the component's render function.
 */
const asStory = (build) => () => ({ setup: () => build })

const mono = { fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.1em', color: 'var(--ink-3)' }
const page = { padding: 'var(--spacing-xl)', display: 'grid', gap: 'var(--spacing-xl)', color: 'var(--ink-1)' }

function section(title, children) {
  return h('section', { style: { display: 'grid', gap: 'var(--spacing-md)' } }, [
    h('h2', { style: { ...mono, margin: 0, textTransform: 'uppercase' } }, title),
    ...children,
  ])
}

function swatch(name, note) {
  return h(
    'div',
    { key: name, style: { display: 'grid', gap: 'var(--spacing-sm)' } },
    [
      h('div', {
        style: {
          height: '56px',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--edge-hair)',
          background: `var(--${name})`,
        },
      }),
      h('div', { style: { display: 'grid', gap: '2px' } }, [
        h('span', { style: { ...mono, color: 'var(--ink-2)' } }, `--${name}`),
        note ? h('span', { style: { ...mono, fontSize: '9px' } }, note) : null,
      ]),
    ],
  )
}

export const Palette = {
  render: asStory(() =>
    h('div', { style: page }, [
      section('Surfaces', [
        h(
          'div',
          { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 'var(--spacing-md)' } },
          [
            swatch('surface-void', 'the stage'),
            swatch('surface-deep', null),
            swatch('surface-1', 'panels · alpha 0.90'),
            swatch('surface-2', 'raised'),
            swatch('surface-scrim', 'behind a modal'),
          ],
        ),
      ]),
      section('Ink · measured on a panel over snow', [
        h('div', { style: { display: 'grid', gap: 'var(--spacing-sm)' } }, [
          h('p', { style: { margin: 0, color: 'var(--ink-1)', fontSize: 'var(--text-md)' } }, '--ink-1 · 13.2:1 · body and headings'),
          h('p', { style: { margin: 0, color: 'var(--ink-2)', fontSize: 'var(--text-sm)' } }, '--ink-2 · 7.1:1 · secondary prose'),
          h('p', { style: { margin: 0, color: 'var(--ink-3)', ...mono } }, '--ink-3 · 3.6:1 · labels only, never body text'),
        ]),
      ]),
      section('Accents · one meaning each', [
        h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 'var(--spacing-md)' } }, [
          swatch('accent', 'interactive · portals'),
          swatch('trail', 'your path · nothing else'),
          swatch('danger', 'errors'),
        ]),
      ]),
    ]),
  ),
}

export const Type = {
  render: asStory(() =>
    h('div', { style: page }, [
      section('Space Grotesk · display and body', [
        h('div', { style: { fontSize: 'var(--text-xl)' } }, 'Cassini Division'),
        h('div', { style: { fontSize: 'var(--text-lg)' } }, 'Ring dynamics and resonances'),
        h('div', { style: { fontSize: 'var(--text-md)', color: 'var(--ink-2)' } }, 'A 4,800-kilometre-wide region between the A and B rings.'),
        h('div', { style: { fontSize: 'var(--text-sm)', color: 'var(--ink-2)' } }, 'Secondary prose at 13px, the Ledger summary size.'),
      ]),
      section('IBM Plex Mono · readouts', [
        // The reason for the second face: figures must not shift width as
        // they change, or a live readout jitters.
        h('div', { style: { fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', fontSize: '17px', display: 'grid', gap: '4px' } }, [
          h('div', {}, 'SECTIONS   7'),
          h('div', {}, 'CITATIONS 24'),
          h('div', {}, 'PORTALS   12'),
          h('div', {}, 'SEA LEVEL 0.42'),
        ]),
      ]),
    ]),
  ),
}

export const Space = {
  render: asStory(() =>
    h('div', { style: page }, [
      section('Spacing · one scale, scaled by --density', [
        ...['xs', 'sm', 'md', 'lg', 'xl', '2xl'].map((step) =>
          h('div', { key: step, style: { display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)' } }, [
            h('span', { style: { ...mono, width: '80px' } }, `--spacing-${step}`),
            h('span', { style: { height: '12px', width: `var(--spacing-${step})`, background: 'var(--accent)', borderRadius: '2px' } }),
          ]),
        ),
        h('p', { style: { ...mono, margin: 0 } }, 'Below 480px --density drops to 0.875 and every step shrinks together.'),
      ]),
      section('Radius and hit target', [
        h('div', { style: { display: 'flex', gap: 'var(--spacing-md)', alignItems: 'flex-end' } }, [
          ...['sm', 'md', 'lg', 'sheet'].map((r) =>
            h('div', { key: r, style: { display: 'grid', gap: 'var(--spacing-sm)', justifyItems: 'center' } }, [
              h('div', { style: { width: '56px', height: '56px', border: '1px solid var(--edge-line)', borderRadius: `var(--radius-${r})` } }),
              h('span', { style: mono }, r),
            ]),
          ),
          h('div', { style: { display: 'grid', gap: 'var(--spacing-sm)', justifyItems: 'center' } }, [
            h('div', { style: { width: 'var(--hit)', height: 'var(--hit)', background: 'var(--accent-wash)', border: '1px solid var(--edge-accent)', borderRadius: 'var(--radius-md)' } }),
            h('span', { style: mono }, '--hit'),
          ]),
        ]),
      ]),
    ]),
  ),
}
