import { h, resolveComponent } from 'vue'
// Swapped for src/ui/design/tokens.css in the next commit; for now stories
// render on the theme the app actually ships, not on Storybook's white.
import '../src/style.css'

/**
 * The breakpoint ladder from docs/ux-vision.md §4.2, as viewport presets.
 * Keeping the two in step is the point: a story checked at every entry here
 * has been checked at every case the CSS branches on.
 *
 * `short` is the landscape-phone case the app currently has no answer for —
 * height is the scarce axis there, so it gets its own preset rather than
 * being approximated by rotating another one.
 */
export const VIEWPORTS = {
  xs: { name: 'xs · phone portrait (390×844)', styles: { width: '390px', height: '844px' }, type: 'mobile' },
  sm: { name: 'sm · large phone (480×900)', styles: { width: '480px', height: '900px' }, type: 'mobile' },
  md: { name: 'md · tablet portrait (768×1024)', styles: { width: '768px', height: '1024px' }, type: 'tablet' },
  lg: { name: 'lg · desktop (1280×900)', styles: { width: '1280px', height: '900px' }, type: 'desktop' },
  xl: { name: 'xl · wide desktop (1440×900)', styles: { width: '1440px', height: '900px' }, type: 'desktop' },
  short: { name: 'short · phone landscape (844×390)', styles: { width: '844px', height: '390px' }, type: 'mobile' },
}

const STAGE_STYLE = {
  position: 'relative',
  width: '100%',
  height: '100dvh',
  overflow: 'hidden',
  background: `radial-gradient(ellipse at 20% 15%,
    var(--surface-nebula) 0%, var(--surface-deep) 45%, var(--surface-void) 100%)`,
}

/**
 * Every story renders on the stage: full-bleed, the app's own background, and
 * a real height so the 3D canvas has something to size itself against.
 *
 * A decorator must return a COMPONENT DEFINITION, not a vnode. Storybook's
 * Vue renderer takes what this returns and registers the story being wrapped
 * as a component named `story` on it (see prepare() in @storybook/vue3), so
 * the story is reached with resolveComponent — which needs no runtime
 * template compiler. Returning h(...) directly hands Vue a bare vnode, which
 * renders as "[object Object]" or as the source of a render function.
 */
export const onStage = () => ({
  render: () => h('div', { style: STAGE_STYLE }, [h(resolveComponent('story'))]),
})

/** @type { import('@storybook/vue3-vite').Preview } */
const preview = {
  parameters: {
    layout: 'fullscreen',
    viewport: { options: VIEWPORTS },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
  initialGlobals: {
    viewport: { value: 'lg', isRotated: false },
  },
  decorators: [onStage],
}

export default preview
