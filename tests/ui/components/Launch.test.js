import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Launch from '../../../src/ui/components/Launch.vue'
import { CURATED_REALMS, SUGGESTION_COUNT, pickRealms, randomRealm } from '../../../src/ui/content/realms.js'
import { resetKeymap } from '../../../src/ui/design/useKeymap.js'
import { resetOverlays, useOverlays } from '../../../src/ui/design/useOverlays.js'

vi.mock('../../../src/adapters/wikipediaSearchAdapter.js', () => ({ searchWikipediaTitles: vi.fn() }))

enableAutoUnmount(afterEach)

afterEach(() => {
  resetOverlays()
  resetKeymap()
})

describe('Launch', () => {
  it('says what the app is before asking for anything', () => {
    // The empty state was one italic sentence. Someone deciding whether to
    // bother deserves a reason.
    const wrapper = mount(Launch)

    expect(wrapper.text()).toContain('Every Wikipedia article is a world')
    expect(wrapper.find('input').exists()).toBe(true)
  })

  it('offers a handful to begin from, not the whole shelf', () => {
    const wrapper = mount(Launch)
    const chips = wrapper.findAll('.launch__realms button')
    const firstTitle = chips[0]
      .find('strong')
      .text()
      .replace(/^\s*EN\s+/, '')
      .trim()

    expect(chips).toHaveLength(SUGGESTION_COUNT)
    expect(CURATED_REALMS.map((realm) => realm.title)).toContain(firstTitle)
  })

  it('shows somewhere new each time it is opened', () => {
    // The point of a shelf larger than the grid: a viewer who comes back
    // should not meet the same six forever.
    const seen = new Set()
    for (let visit = 0; visit < 12; visit += 1) {
      for (const chip of mount(Launch).findAll('.launch__realms button')) {
        seen.add(chip.text())
      }
    }

    expect(seen.size).toBeGreaterThan(SUGGESTION_COUNT)
  })

  it('starts a journey from a suggestion on English Wikipedia', async () => {
    const wrapper = mount(Launch)
    const chosen = wrapper.findAll('.launch__realms button')[2]

    await chosen.trigger('click')

    expect(wrapper.emitted('select')[0][0]).toMatchObject({
      title: expect.any(String),
      language: 'en',
    })
    expect(chosen.text()).toContain(wrapper.emitted('select')[0][0].title)
  })

  it('picks somewhere for the undecided, from beyond what is on screen', async () => {
    const wrapper = mount(Launch)
    const shown = wrapper.findAll('.launch__realms button').map((chip) =>
      chip
        .find('strong')
        .text()
        .replace(/^\s*EN\s+/, '')
        .trim(),
    )

    await wrapper.findAll('.launch__extra')[0].trigger('click')

    const picked = wrapper.emitted('select')[0][0]
    expect(picked.language).toBe('en')
    expect(CURATED_REALMS.map((realm) => realm.title)).toContain(picked.title)
    expect(shown).not.toContain(picked.title)
  })

  it('offers the guide, for someone who wants to know first', async () => {
    const wrapper = mount(Launch)

    await wrapper.findAll('.launch__extra')[1].trigger('click')

    expect(wrapper.emitted('guide')).toHaveLength(1)
  })

  it('takes the field, since typing is the point of the screen', () => {
    expect(mount(Launch).find('input').attributes('data-autofocus')).toBeDefined()
  })

  describe('summoned again over a live world', () => {
    it('offers a way back, which a first visit does not', () => {
      // On a first visit there is nowhere to dismiss TO, and choosing is
      // the point. Once there is a world behind it, leaving must be possible.
      expect(mount(Launch).find('[aria-label="Back to the world"]').exists()).toBe(false)
      expect(
        mount(Launch, { props: { dismissible: true } }).find('[aria-label="Back to the world"]').exists(),
      ).toBe(true)
    })

    it('asks to be closed rather than closing itself', async () => {
      const wrapper = mount(Launch, { props: { dismissible: true } })

      await wrapper.find('[aria-label="Back to the world"]').trigger('click')

      expect(wrapper.emitted('close')).toHaveLength(1)
    })

    it('takes its turn in the overlay stack, so Escape works on it too', () => {
      mount(Launch, { props: { dismissible: true } })

      expect(useOverlays().isOpen('launch')).toBe(true)
    })

    it('stays out of the stack on a first visit', () => {
      mount(Launch)

      expect(useOverlays().isOpen('launch')).toBe(false)
    })
  })
})

describe('the realm shelf', () => {
  it('is large enough that a sample means something', () => {
    expect(CURATED_REALMS.length).toBeGreaterThan(SUGGESTION_COUNT * 3)
  })

  it('names each realm once', () => {
    const titles = CURATED_REALMS.map((realm) => realm.title)
    expect(new Set(titles).size).toBe(titles.length)
  })

  it('gives every realm a hint, since a bare title invites nobody', () => {
    for (const realm of CURATED_REALMS) {
      expect(realm.hint, realm.title).toBeTruthy()
    }
  })

  describe('pickRealms', () => {
    it('returns the asked-for number, without repeats', () => {
      for (let seed = 0; seed < 20; seed += 1) {
        const picked = pickRealms(SUGGESTION_COUNT, () => seed / 20)
        expect(picked).toHaveLength(SUGGESTION_COUNT)
        expect(new Set(picked.map((realm) => realm.title)).size).toBe(SUGGESTION_COUNT)
      }
    })

    it('can reach beyond the first few entries of the shelf', () => {
      // A sample that always returns the head of the list is not a sample.
      const reached = new Set()
      for (let seed = 0; seed < 40; seed += 1) {
        for (const realm of pickRealms(SUGGESTION_COUNT, () => (seed * 0.137) % 1)) {
          reached.add(realm.title)
        }
      }
      expect(reached.size).toBeGreaterThan(SUGGESTION_COUNT * 2)
    })

    it('copes with being asked for more than the shelf holds', () => {
      expect(pickRealms(CURATED_REALMS.length + 5)).toHaveLength(CURATED_REALMS.length)
    })
  })

  describe('randomRealm', () => {
    it('never returns something already on screen', () => {
      // "Surprise me" that offers what the viewer just declined is a bug.
      const shown = CURATED_REALMS.slice(0, SUGGESTION_COUNT).map((realm) => realm.title)

      for (let roll = 0; roll < 30; roll += 1) {
        expect(shown).not.toContain(randomRealm(shown, () => roll / 30).title)
      }
    })

    it('still answers when everything is excluded', () => {
      const all = CURATED_REALMS.map((realm) => realm.title)
      expect(randomRealm(all)).toBeTruthy()
    })
  })
})
