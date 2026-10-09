import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { reactive } from 'vue'
import { mountWithI18n } from '@/test/mountWithI18n'

vi.mock('@/api/references', async () => ({ referencesApi: (await import('@/views/broker/transit/record/sections/__tests__/harness')).refsApi }))

import TransitDrawer from '../TransitDrawer.vue'
import { draftFromPartia, partiaToBody, transitFilled, type PartiaDraft } from '../partiaModel'
import { fullPartia } from './packageFixture'
import { ComboStub, SelectStub, primeRefs } from '@/views/broker/transit/record/sections/__tests__/harness'

const DrawerStub = {
  props: ['open', 'title'], emits: ['update:open'],
  template: '<div v-if="open" data-drawer :data-title="title"><slot /><slot name="footer" /></div>',
}
let w: VueWrapper
const mount = (d: PartiaDraft, readonly = false) => {
  w = mountWithI18n(TransitDrawer, {
    props: { open: true, draft: d.record, readonly },
    attachTo: document.body,
    global: { stubs: { ZDrawer: DrawerStub, ZSelect: SelectStub, ZCombobox: ComboStub } },
  })
}
const f = (key: string) => w.get(`[data-f="${key}"]`)

beforeEach(() => {
  setActivePinia(createPinia())
  primeRefs()
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
})
afterEach(() => { w?.unmount(); document.body.innerHTML = ''; vi.clearAllMocks() })

describe('TransitDrawer', () => {
  it('10 разделов по порядку и меню разделов декларации; «Основное» без «Пост»', async () => {
    mount(reactive(draftFromPartia(fullPartia())) as PartiaDraft)
    await flushPromises()
    expect(w.get('[data-drawer]').attributes('data-title')).toBe('Транзитная декларация')
    expect(w.findAll('[data-transit-sections] > section').map((s) => s.attributes('data-record-section'))).toEqual([
      'main', 'organizations', 'carriers', 'transport', 'seals', 'containers', 'packaging', 'preceding', 'guarantees', 'misc',
    ])
    expect(w.get('nav').attributes('aria-label')).toBe('Разделы декларации')
    expect(w.findAll('[data-nav-item]')).toHaveLength(10)
    expect(w.find('[data-f="post"]').exists()).toBe(false)
    expect(w.find('[data-record-section="goods"]').exists()).toBe(false)
    expect(w.find('[data-record-section="row"]').exists()).toBe(false)
  })

  it('правит record.transit и коллекции; счётчик «n из 10» следует за черновиком; тело несёт правки', async () => {
    const d = reactive(draftFromPartia(fullPartia({ transitDataJson: null }))) as PartiaDraft
    mount(d)
    await flushPromises()
    expect(transitFilled(d).filled).toEqual(['main'])
    const office = f('departureCustomsOffice')
    await office.get('[data-option]').trigger('click')
    expect(d.record.transit.departureCustomsOffice).toBe('57507')
    await w.get('[data-record-section="guarantees"] [data-section-add]').trigger('click')
    expect(d.record.guarantees).toHaveLength(1)
    await w.get('[data-record-section="organizations"] [data-section-add]').trigger('click')
    expect(d.record.organizations).toHaveLength(1)
    const name = w.get('[data-record-section="organizations"] [data-f="name"]')
    ;(name.element as HTMLInputElement).value = 'ТОО Брокер'
    await name.trigger('input')
    expect(d.record.organizations[0].name).toBe('ТОО Брокер')
    const number = w.get('[data-record-section="guarantees"] [data-f="number"]')
    ;(number.element as HTMLInputElement).value = 'G-1'
    await number.trigger('input')
    expect(transitFilled(d)).toEqual({ filled: ['main', 'organizations', 'guarantees'], total: 10 })
    expect(w.get('[data-nav-item="guarantees"]').attributes('data-state')).toBe('done')
    const json = JSON.parse(partiaToBody(d).transitDataJson!)
    expect(json.departureCustomsOffice).toBe('57507')
    expect(json.guarantees).toHaveLength(1)
    expect(json.organizations).toHaveLength(1)
  })

  it('«Готово» закрывает шторку; в чтении — без добавления и подсказки про сохранение', async () => {
    mount(reactive(draftFromPartia(fullPartia())) as PartiaDraft, true)
    await flushPromises()
    expect(w.find('[data-section-add]').exists()).toBe(false)
    expect(w.find('[data-transit-hint]').exists()).toBe(false)
    await w.get('[data-transit-done]').trigger('click')
    expect(w.emitted('update:open')![0]).toEqual([false])
  })
})
