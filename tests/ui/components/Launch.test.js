import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Launch from '../../../src/ui/components/Launch.vue'
import { CURATED_REALMS, randomRealm } from '../../../src/ui/content/realms.js'

vi.mock('../../../src/adapters/wikipediaSearchAdapter.js', () => ({ searchWikipediaTitles: vi.fn() }))

enableAutoUnmount(afterEach)

describe('Launch', () => {
  it('says what the app is before asking for anything', () => {
    // The empty state was one italic sentence. Someone deciding whether to
    // bother deserves a reason.
    const wrapper = mount(Launch)

    expect(wrapper.text()).toContain('Every Wikipedia article is a world')
    expect(wrapper.find('input').exists()).toBe(true)
  })

  it('offers somewhere to begin, so the field is not the only way in', () => {
    const wrapper = mount(Launch)
    const chips = wrapper.findAll('.launch__realms button')

    expect(chips).toHaveLength(CURATED_REALMS.length)
    expect(chips[0].text()).toContain(CURATED_REALMS[0].title)
  })

  it('starts a journey from a suggestion', async () => {
    const wrapper = mount(Launch)

    await wrapper.findAll('.launch__realms button')[2].trigger('click')

    expect(wrapper.emitted('select')[0][0].title).toBe(CURATED_REALMS[2].title)
  })

  it('picks somewhere for the undecided', async () => {
    const wrapper = mount(Launch)

    await wrapper.findAll('.launch__extra')[0].trigger('click')

    expect(CURATED_REALMS.map((realm) => realm.title)).toContain(wrapper.emitted('select')[0][0].title)
  })

  it('offers the guide, for someone who wants to know first', async () => {
    const wrapper = mount(Launch)

    await wrapper.findAll('.launch__extra')[1].trigger('click')

    expect(wrapper.emitted('guide')).toHaveLength(1)
  })

  it('takes the field, since typing is the point of the screen', () => {
    expect(mount(Launch).find('input').attributes('data-autofocus')).toBeDefined()
  })
})

describe('randomRealm', () => {
  it('never returns the realm already on screen', () => {
    // "Surprise me" that surprises you with where you already are is a bug.
    for (const realm of CURATED_REALMS) {
      for (let roll = 0; roll < CURATED_REALMS.length; roll += 1) {
        const picked = randomRealm(realm.title, () => roll / CURATED_REALMS.length)
        expect(picked.title).not.toBe(realm.title)
      }
    }
  })

  it('can reach every realm', () => {
    const reached = new Set()
    for (let roll = 0; roll < CURATED_REALMS.length; roll += 1) {
      reached.add(randomRealm(null, () => roll / CURATED_REALMS.length).title)
    }
    expect(reached.size).toBe(CURATED_REALMS.length)
  })
})
