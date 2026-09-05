import { h } from 'vue'
import ToolsMenu from '../../../src/ui/components/ToolsMenu.vue'

/**
 * Only ever seen below md, so the viewport preset matters more than usual:
 * check it at `xs`, where it is a bottom sheet and the labels have to earn
 * the space the icons gave up.
 */
export default {
  title: 'Instruments/ToolsMenu',
  component: ToolsMenu,
  parameters: { layout: 'fullscreen' },
}

export const Open = { render: () => ({ setup: () => () => h(ToolsMenu, { show: true }) }) }
