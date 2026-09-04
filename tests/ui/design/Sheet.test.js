import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Sheet from '../../../src/ui/design/Sheet.vue'
import { resetKeymap } from '../../../src/ui/design/useKeymap.js'
import { resetOverlays, useOverlays } from '../../../src/ui/design/useOverlays.js'

function sizeViewport(width, height) {
  window.innerWidth = width
  window.innerHeight = height
  window.dispatchEvent(new Event('resize'))
}

function mountSheet(props = {}, slots = {}) {
  return mount(Sheet, {
    props: { open: true, id: 'test-sheet', label: 'Test surface', ...props },
    slots,
    attachTo: document.body,
  })
}

function pressEscape(target = document.body) {
  const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
  Object.defineProperty(event, 'target', { value: target })
  window.dispatchEvent(event)
}

/** jsdom has no PointerEvent; a MouseEvent of the same type reaches the handler. */
function pointer(type, clientY, target = window) {
  target.dispatchEvent(new MouseEvent(type, { clientY, bubbles: true, cancelable: true }))
}

/**
 * The surface is teleported to <body>, so it is not in the wrapper's own
 * tree — every query goes through the document instead.
 */
const sheetEl = () => document.querySelector('.sheet')
const gripEl = () => document.querySelector('.sheet__grip')
const scrimEl = () => document.querySelector('.scrim')

function keydown(element, init) {
  element.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }))
}

beforeEach(() => {
  document.body.innerHTML = ''
  document.body.style.overflow = ''
  sizeViewport(1280, 900)
})

afterEach(() => {
  resetOverlays()
  resetKeymap()
  document.body.innerHTML = ''
})

describe('Sheet', () => {
  describe('presentation', () => {
    it.each([
      [1280, 900, true, 'dialog'],
      [390, 844, true, 'sheet'],
      [844, 390, true, 'dialog'],
      [1280, 900, false, 'panel'],
      [390, 844, false, 'sheet'],
      [844, 390, false, 'drawer'],
    ])('at %ix%i, modal=%s, resolves to %s', (width, height, modal, expected) => {
      sizeViewport(width, height)
      const wrapper = mountSheet({ modal })

      expect(sheetEl().classList.contains(`sheet--${expected}`)).toBe(true)
      wrapper.unmount()
    })

    it('honours an explicit presentation over the viewport', () => {
      sizeViewport(390, 844)
      const wrapper = mountSheet({ presentation: 'dialog' })

      expect(sheetEl().classList.contains('sheet--dialog')).toBe(true)
      wrapper.unmount()
    })

    it('puts a drag grip only on a bottom sheet', () => {
      sizeViewport(390, 844)
      const asSheet = mountSheet()
      expect(gripEl()).not.toBeNull()
      asSheet.unmount()

      sizeViewport(1280, 900)
      const asDialog = mountSheet()
      expect(gripEl()).toBeNull()
      asDialog.unmount()
    })
  })

  describe('the overlay stack', () => {
    it('registers while open and leaves when closed', async () => {
      const { isOpen } = useOverlays()
      const wrapper = mountSheet()

      expect(isOpen('test-sheet')).toBe(true)

      await wrapper.setProps({ open: false })
      expect(isOpen('test-sheet')).toBe(false)
      wrapper.unmount()
    })

    it('leaves the stack when unmounted while still open', () => {
      // A surface torn down by a route or v-if must not wedge the stack.
      const { isOpen } = useOverlays()
      const wrapper = mountSheet()

      wrapper.unmount()

      expect(isOpen('test-sheet')).toBe(false)
    })

    it('asks to close when Escape reaches the stack', () => {
      const wrapper = mountSheet()

      pressEscape()

      expect(wrapper.emitted('close')).toHaveLength(1)
      wrapper.unmount()
    })

    it('ignores Escape when not dismissible', () => {
      const wrapper = mountSheet({ dismissible: false })

      pressEscape()

      expect(wrapper.emitted('close')).toBeUndefined()
      wrapper.unmount()
    })

    it('does not evict its peers when non-modal', () => {
      // The Ledger coexists with everything; it is not a "summon".
      const { open, isOpen } = useOverlays()
      open('field-guide')

      const wrapper = mountSheet({ modal: false, id: 'ledger' })

      expect(isOpen('field-guide')).toBe(true)
      expect(isOpen('ledger')).toBe(true)
      wrapper.unmount()
    })
  })

  describe('focus', () => {
    it('moves focus into the surface when it opens', async () => {
      const wrapper = mountSheet({}, { default: '<button id="first">First</button>' })
      await wrapper.vm.$nextTick()
      await wrapper.vm.$nextTick()

      expect(document.activeElement?.id).toBe('first')
      wrapper.unmount()
    })

    it('prefers an element marked data-autofocus', async () => {
      const wrapper = mountSheet(
        {},
        { default: '<button id="first">First</button><input id="search" data-autofocus />' },
      )
      await wrapper.vm.$nextTick()
      await wrapper.vm.$nextTick()

      expect(document.activeElement?.id).toBe('search')
      wrapper.unmount()
    })

    it('wraps Tab within a modal surface', async () => {
      const wrapper = mountSheet({}, { default: '<button id="a">A</button><button id="b">B</button>' })
      await wrapper.vm.$nextTick()

      document.getElementById('b').focus()
      keydown(sheetEl(), { key: 'Tab' })

      expect(document.activeElement?.id).toBe('a')

      document.getElementById('a').focus()
      keydown(sheetEl(), { key: 'Tab', shiftKey: true })

      expect(document.activeElement?.id).toBe('b')
      wrapper.unmount()
    })

    it('does not take focus when non-modal', async () => {
      // The Ledger appears with a world, unasked. Pulling focus out of
      // whatever the viewer was doing would be a theft, not a courtesy.
      const opener = document.createElement('button')
      opener.id = 'opener'
      document.body.appendChild(opener)
      opener.focus()

      const wrapper = mountSheet({ modal: false }, { default: '<button id="inside">Inside</button>' })
      await wrapper.vm.$nextTick()
      await wrapper.vm.$nextTick()

      expect(document.activeElement?.id).toBe('opener')
      wrapper.unmount()
    })

    it('does not trap Tab in a non-modal surface', async () => {
      // The Ledger must let the viewer tab back out to the world's controls.
      const wrapper = mountSheet({ modal: false }, { default: '<button id="a">A</button><button id="b">B</button>' })
      await wrapper.vm.$nextTick()

      document.getElementById('b').focus()
      keydown(sheetEl(), { key: 'Tab' })

      expect(document.activeElement?.id).toBe('b')
      wrapper.unmount()
    })
  })

  describe('the background', () => {
    it('hides body siblings from assistive technology while modal', async () => {
      const app = document.createElement('div')
      app.id = 'app'
      document.body.appendChild(app)

      const wrapper = mountSheet()
      await wrapper.vm.$nextTick()

      expect(app.hasAttribute('inert')).toBe(true)

      await wrapper.setProps({ open: false })
      expect(app.hasAttribute('inert')).toBe(false)
      wrapper.unmount()
    })

    it('does not hide the background when it closes mid-open', async () => {
      // applyInert runs after an await. A surface that closes during that
      // await used to inert the app anyway, and never restore it — because
      // the close had already run. Everything inside #app went dead while
      // the one panel teleported outside it kept working.
      const app = document.createElement('div')
      app.id = 'app'
      document.body.appendChild(app)

      const wrapper = mountSheet()
      // Close before the open's await settles.
      await wrapper.setProps({ open: false })
      await wrapper.vm.$nextTick()
      await wrapper.vm.$nextTick()

      expect(app.hasAttribute('inert')).toBe(false)
      wrapper.unmount()
    })

    it('leaves the background alone when non-modal', async () => {
      const app = document.createElement('div')
      app.id = 'app'
      document.body.appendChild(app)

      const wrapper = mountSheet({ modal: false })
      await wrapper.vm.$nextTick()

      expect(app.hasAttribute('inert')).toBe(false)
      wrapper.unmount()
    })

    it('renders a scrim only for a modal surface', () => {
      const modal = mountSheet()
      expect(scrimEl()).not.toBeNull()
      modal.unmount()

      const plain = mountSheet({ modal: false })
      expect(scrimEl()).toBeNull()
      plain.unmount()
    })

    it('closes when the scrim is clicked, unless it cannot be dismissed', async () => {
      const wrapper = mountSheet()
      scrimEl().dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await wrapper.vm.$nextTick()
      expect(wrapper.emitted('close')).toHaveLength(1)
      wrapper.unmount()

      const sticky = mountSheet({ dismissible: false })
      scrimEl().dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await sticky.vm.$nextTick()
      expect(sticky.emitted('close')).toBeUndefined()
      sticky.unmount()
    })
  })

  describe('drag and snap', () => {
    beforeEach(() => sizeViewport(390, 1000))

    it('sizes itself from the active snap point', () => {
      const wrapper = mountSheet({ snapPoints: [0.1, 0.5, 0.9], snap: 1 })

      expect(sheetEl().getAttribute('style')).toContain('height: 50dvh')
      wrapper.unmount()
    })

    it('snaps to the nearest point when released', async () => {
      const wrapper = mountSheet({ snapPoints: [0.1, 0.5, 0.9], snap: 1, modal: false })
      // From 500px tall, drag up 350px → ~850px → nearest is 0.9.
      pointer('pointerdown', 500, gripEl())
      pointer('pointermove', 150)
      pointer('pointerup', 150)
      await wrapper.vm.$nextTick()

      expect(wrapper.emitted('update:snap')?.at(-1)).toEqual([2])
      wrapper.unmount()
    })

    it('emits nothing when the drag lands back on the current snap', async () => {
      const wrapper = mountSheet({ snapPoints: [0.1, 0.5, 0.9], snap: 1, modal: false })
      pointer('pointerdown', 500, gripEl())
      pointer('pointermove', 490)
      pointer('pointerup', 490)

      expect(wrapper.emitted('update:snap')).toBeUndefined()
      wrapper.unmount()
    })

    it('dismisses a modal sheet dragged below its lowest snap', async () => {
      const wrapper = mountSheet({ snapPoints: [0.2, 0.5, 0.9], snap: 1 })
      pointer('pointerdown', 500, gripEl())
      pointer('pointermove', 950)
      pointer('pointerup', 950)
      await wrapper.vm.$nextTick()

      expect(wrapper.emitted('close')).toHaveLength(1)
      wrapper.unmount()
    })

    it('settles a non-modal sheet on its lowest snap instead of dismissing', async () => {
      // The Ledger's smallest state is peek, not gone: a hard drag down must
      // not leave the viewer with no way back to where they are.
      const wrapper = mountSheet({ snapPoints: [0.2, 0.5, 0.9], snap: 1, modal: false })
      pointer('pointerdown', 500, gripEl())
      pointer('pointermove', 950)
      pointer('pointerup', 950)
      await wrapper.vm.$nextTick()

      expect(wrapper.emitted('close')).toBeUndefined()
      expect(wrapper.emitted('update:snap')?.at(-1)).toEqual([0])
      wrapper.unmount()
    })
  })

  it('does not echo a close back when the parent closes it', async () => {
    // The parent already knows; a redundant emit invites a v-model loop.
    const wrapper = mountSheet()

    await wrapper.setProps({ open: false })

    expect(wrapper.emitted('close')).toBeUndefined()
    wrapper.unmount()
  })

  it('lets clicks through to the world around a non-modal surface', () => {
    // The surface root spans the viewport so the panel can sit in a corner.
    // Without pointer-events: none on it, that invisible root would swallow
    // every click meant for the terrain behind.
    const wrapper = mountSheet({ modal: false })

    const root = document.querySelector('[data-sheet-root]')
    expect(root.classList.contains('sheet-root')).toBe(true)
    wrapper.unmount()
  })

  it('renders nothing at all while closed', () => {
    const wrapper = mountSheet({ open: false })

    expect(document.querySelector('.sheet')).toBeNull()
    wrapper.unmount()
  })
})
