import { h } from 'vue'
import Icon from '../../../src/ui/design/Icon.vue'
import { ICON_NAMES } from '../../../src/ui/design/icons.js'

/**
 * A CSF `render` must produce a component DEFINITION, not a vnode: Storybook's
 * Vue renderer treats whatever it returns as a component, so a bare vnode
 * renders as "[object Object]". setup() returning the build function makes
 * that function the component's render function.
 */
const asStory = (build) => () => ({ setup: () => build })

const label = {
  fontFamily: 'var(--font-mono)',
  fontSize: '9px',
  letterSpacing: '0.08em',
  color: 'var(--ink-3)',
}

/**
 * The whole set on one screen. Worth a story rather than a doc page: the
 * point of a single stroke weight on a single grid is that irregularities
 * only show when the icons are seen side by side at the size they ship at.
 */
export default {
  title: 'Design/Icon',
  component: Icon,
  args: { name: 'search', size: 20 },
  argTypes: {
    name: { control: 'select', options: ICON_NAMES },
    size: { control: { type: 'range', min: 12, max: 64, step: 2 } },
  },
}

export const Single = {}

export const Sheet = {
  render: asStory(() =>
    h(
      'div',
      {
        style: {
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))',
          gap: 'var(--spacing-sm)',
          padding: 'var(--spacing-lg)',
          color: 'var(--ink-1)',
        },
      },
      ICON_NAMES.map((name) =>
        h(
          'div',
          {
            key: name,
            style: {
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 'var(--spacing-sm)',
              padding: 'var(--spacing-md) var(--spacing-sm)',
              border: '1px solid var(--edge-hair)',
              borderRadius: 'var(--radius-md)',
            },
          },
          [h(Icon, { name, size: 24 }), h('span', { style: label }, name)],
        ),
      ),
    ),
  ),
}

/** At the sizes the UI actually uses, where hinting problems show up. */
export const Scales = {
  render: asStory(() =>
    h(
      'div',
      {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--spacing-lg)',
          padding: 'var(--spacing-lg)',
          color: 'var(--ink-1)',
        },
      },
      [12, 16, 20, 24, 32, 48].map((size) =>
        h('div', { key: size, style: { display: 'grid', gap: 'var(--spacing-sm)', justifyItems: 'center' } }, [
          h(Icon, { name: 'globe', size }),
          h('span', { style: label }, `${size}px`),
        ]),
      ),
    ),
  ),
}
