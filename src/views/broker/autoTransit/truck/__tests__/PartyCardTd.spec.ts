import { afterEach, describe, expect, it } from 'vitest'
import type { VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { Party } from '@/api/autoTransit'
import PartyCard from '../PartyCard.vue'
import { rights } from '../truckView'
import { card, party } from './truckFixtures'

let w: VueWrapper
const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: { template: '<div/>' } }] })
const mount = (p: Party, c = card({ currentStage: 5, can: { border: false, declare: true, manage: false } })) => {
  w = mountWithI18n(PartyCard, {
    props: { truckId: 't1', party: p, parties: [p], files: [], missing: [], rights: rights(c), canDeleteThis: false },
    global: { plugins: [router] },
  })
}
afterEach(() => w?.unmount())

describe('PartyCard: ТД партии', () => {
  it('без сохранённой ТД — «Заполнить ПИ», ссылка на страницу ТД', () => {
    mount(party('p1', 1, { hasDeclaration: false }))
    const b = w.get('[data-party-td-form]')
    expect(b.text()).toBe('Заполнить ПИ')
    expect(b.attributes('href')).toBe('/auto-transit/t1/parties/p1/td')
  })

  it('с сохранённой ТД — «Открыть ПИ / ТД» и счётчик незаполненного', () => {
    mount(party('p1', 1, { hasDeclaration: true, declarationMissingCount: 3 }))
    expect(w.get('[data-party-td-form]').text()).toBe('Открыть ПИ / ТД')
    expect(w.get('[data-party-td-missing]').text()).toBe('в ТД не заполнено: 3')
  })

  it('ничего не пропущено — счётчика нет', () => {
    mount(party('p1', 1, { hasDeclaration: true, declarationMissingCount: 0 }))
    expect(w.find('[data-party-td-missing]').exists()).toBe(false)
  })

  it('у «ТД подана» подпись «подаётся в КЕДЕН»', () => {
    mount(party('p1', 1))
    expect(w.get('[data-party-submit-keden]').text()).toBe('подаётся в КЕДЕН')
  })
})
