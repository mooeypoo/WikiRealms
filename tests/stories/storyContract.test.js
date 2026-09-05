import { mount } from '@vue/test-utils'
import { h, isVNode } from 'vue'
import { describe, expect, it } from 'vitest'
import { onStage } from '../../.storybook/preview.js'
import * as iconStories from '../../stories/ui/design/Icon.stories.js'
import * as overlayStories from '../../stories/ui/design/Overlays.stories.js'
import * as sheetStories from '../../stories/ui/design/Sheet.stories.js'
import * as helmStories from '../../stories/ui/components/Helm.stories.js'
import * as ledgerStories from '../../stories/ui/components/Ledger.stories.js'
import * as scrimStories from '../../stories/ui/components/TopScrim.stories.js'
import * as launchStories from '../../stories/ui/components/Launch.stories.js'
import * as tokenStories from '../../stories/ui/design/Tokens.stories.js'

/**
 * Storybook's Vue renderer has one contract that is easy to get wrong and
 * fails silently-ish: a decorator and a custom `render` must each produce a
 * COMPONENT DEFINITION, never a vnode. Hand it a vnode and the story renders
 * as "[object Object]" or as the source text of a render function — which is
 * exactly what shipped in the first pass of these stories.
 *
 * Storybook itself cannot run in CI here, so this reproduces the contract
 * directly: prepare() in @storybook/vue3 registers the wrapped story as a
 * component named `story` on whatever the decorator returned.
 */

const FakeStory = { render: () => h('p', { class: 'inner-story' }, 'inner story rendered') }

/** What @storybook/vue3's prepare() does to a decorator's return value. */
function applyDecorator(decorator, story) {
  const decorated = decorator()
  return { ...decorated, components: { ...(decorated.components ?? {}), story } }
}

function storiesWithRender(module) {
  return Object.entries(module)
    .filter(([name]) => name !== 'default')
    .filter(([, story]) => typeof story?.render === 'function')
}

describe('Storybook story contract', () => {
  describe('the stage decorator', () => {
    it('returns a component definition rather than a vnode', () => {
      const decorated = onStage()

      expect(isVNode(decorated)).toBe(false)
      expect(typeof decorated.render).toBe('function')
    })

    it('renders the story it wraps, inside the stage', () => {
      const wrapper = mount(applyDecorator(onStage, FakeStory))

      expect(wrapper.find('.inner-story').exists()).toBe(true)
      expect(wrapper.text()).toContain('inner story rendered')
      // The stage element itself, which gives the 3D canvas a height.
      expect(wrapper.element.tagName).toBe('DIV')
      expect(wrapper.element.style.height).toBe('100dvh')
    })

    it('does not stringify what it wraps', () => {
      const html = mount(applyDecorator(onStage, FakeStory)).html()

      expect(html).not.toContain('[object Object]')
      expect(html).not.toContain('=>')
    })
  })

  describe.each([
    ['Icon', iconStories],
    ['Tokens', tokenStories],
    ['Overlays', overlayStories],
    ['Sheet', sheetStories],
    ['Helm', helmStories],
    ['Ledger', ledgerStories],
    ['TopScrim', scrimStories],
    ['Launch', launchStories],
  ])('%s stories', (_name, module) => {
    const cases = storiesWithRender(module)

    it('has stories with a custom render to check', () => {
      expect(cases.length).toBeGreaterThan(0)
    })

    it.each(cases)('%s renders real markup', (_storyName, story) => {
      const produced = story.render()

      expect(isVNode(produced), 'render must return a component definition, not a vnode').toBe(false)

      const html = mount(produced).html()
      expect(html).not.toContain('[object Object]')
      expect(html.length).toBeGreaterThan(50)
    })
  })
})
