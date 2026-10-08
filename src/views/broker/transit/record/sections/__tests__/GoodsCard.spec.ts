import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h, reactive } from 'vue'
import { confirmState } from '@/ui/confirm'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { ReestrGoodsItemInput } from '@/types/api'
import { good } from '../../__tests__/recordFixture'

const tnved = vi.hoisted(() => ({ node: vi.fn(), rates: vi.fn() }))
vi.mock('@/api/tnved', () => ({ tnvedApi: tnved }))
vi.mock('@/api/references', async () => ({ referencesApi: (await import('./harness')).refsApi }))

import GoodsCard from '../GoodsCard.vue'
import SectionGoods from '../SectionGoods.vue'
import { SelectStub, emptyDraft, primeRefs, refsApi } from './harness'

// Справочник ТН ВЭД (AntD-окно) — заглушка: видно, открыт ли и с каким запросом; «выбор» — кнопка.
const PickerStub = defineComponent({
  props: { open: Boolean, initialQuery: { type: String, default: '' } },
  emits: ['update:open', 'select'],
  setup: (props, { emit }) => () => h('div', { 'data-picker': '', 'data-open': String(props.open), 'data-query': props.initialQuery }, [
    h('button', { type: 'button', 'data-picker-select': '', onClick: () => emit('select', { code: '8471300000', name: 'Машины вычислительные' }) }),
  ]),
})
const stubs = { ZSelect: SelectStub, TnvedPickerModal: PickerStub }

let w: VueWrapper
const mountCard = async (item: ReestrGoodsItemInput, o: { readonly?: boolean; expanded?: boolean } = {}) => {
  const it = reactive(item) as ReestrGoodsItemInput
  w = mountWithI18n(GoodsCard, {
    props: { item: it, index: 1, readonly: o.readonly ?? false, expanded: o.expanded ?? true },
    attachTo: document.body,
    global: { stubs },
  })
  await flushPromises()
  return it
}
const f = (key: string) => w.get(`[data-f="${key}"]`)
const typeInto = async (key: string, text: string) => {
  const el = f(key)
  ;(el.element as HTMLInputElement).value = text
  await el.trigger('input')
}
/** Сводка и итоги — с неразрывными пробелами (не переносятся); в проверках — обычные. */
const txt = (sel: string) => w.get(sel).text().replace(/\u00a0/g, ' ')
const INVALID = 'Кода нет в справочнике ТН ВЭД — выберите через «Справочник»'

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  primeRefs()
  refsApi.listOkeiUnits.mockResolvedValue([{ id: 'o1', code: '796', name: 'шт', isActive: true }, { id: 'o2', code: '166', name: 'кг', isActive: true }])
})
afterEach(() => { confirmState.resolve(false); w?.unmount(); document.body.innerHTML = '' })

describe('GoodsCard — заголовок', () => {
  it('свёрнутая: номер, код с пробелами, описание, сводка «120 шт · 96,0 кг · 1 800 USD»; полей нет', async () => {
    await mountCard(good({
      tnvedCode: '8473302008', description: 'Блоки питания 65 Вт', quantity: 120, unitCode: '796', grossWeightKg: 96, customsValue: 1800, currency: 'USD',
    }), { expanded: false })
    expect(w.get('[data-goods-number]').text()).toBe('2')
    expect(w.get('[data-goods-code]').text()).toBe('8473 30 200 8')
    expect(w.get('[data-goods-title]').text()).toBe('Блоки питания 65 Вт')
    expect(txt('[data-goods-summary]')).toBe('120 шт · 96,0 кг · 1 800 USD')
    expect(w.get('[data-goods-toggle]').attributes('aria-expanded')).toBe('false')
    expect(w.find('[data-goods-body]').exists()).toBe(false)
  })

  it('сводка — только то, что есть; единица без кода — из поля «ед.»; без описания из инвойса — описание ТН ВЭД', async () => {
    await mountCard(good({ tnvedDescription: 'Сумки', quantity: 2.5, unit: 'коробка', customsValue: 900.5 }), { expanded: false })
    expect(w.get('[data-goods-code]').text()).toBe('Код не указан')
    expect(w.get('[data-goods-title]').text()).toBe('Сумки')
    expect(txt('[data-goods-summary]')).toBe('2,5 коробка · 900,5')
  })

  it('развёрнутая — без сводки; клик по заголовку — toggle', async () => {
    await mountCard(good({ quantity: 1 }))
    expect(w.find('[data-goods-summary]').exists()).toBe(false)
    expect(w.get('[data-goods-toggle]').attributes('aria-expanded')).toBe('true')
    await w.get('[data-goods-toggle]').trigger('click')
    expect(w.emitted('toggle')).toHaveLength(1)
  })
})

describe('GoodsCard — поля', () => {
  it('поля пишут прямо в товар; ед. — только чтение по коду; подпись стоимости — с валютой', async () => {
    const item = await mountCard(good({ currency: 'USD' }))
    await typeInto('quantity', '120')
    await typeInto('grossWeightKg', '420,5')
    await typeInto('netWeightKg', '384')
    await typeInto('packagesCount', '12')
    await typeInto('customsValue', '25000')
    await typeInto('tnvedDescription', 'Машины')
    await typeInto('description', 'Ноутбуки Lenovo')
    await f('countryOfOrigin').get('[data-option="156"]').trigger('click')
    await f('quantityTypeCode').get('[data-option="РК"]').trigger('click')
    await f('currency').get('[data-option="EUR"]').trigger('click')
    expect(item).toMatchObject({
      quantity: 120, grossWeightKg: 420.5, netWeightKg: 384, packagesCount: 12, customsValue: 25000,
      tnvedDescription: 'Машины', description: 'Ноутбуки Lenovo', countryOfOrigin: '156', quantityTypeCode: 'РК', currency: 'EUR',
    })
    expect(f('unitCode').attributes('data-disabled')).toBe('true')
    expect(w.text()).toContain('Стоимость, EUR')
    await typeInto('tnvedDescription', '')
    expect(item.tnvedDescription).toBeNull()
  })

  it('«Найти» зовёт tnvedApi.node и заполняет описание, единицу — по ставкам, если её не было', async () => {
    tnved.node.mockResolvedValue({ data: { is10: true, name: 'Машины вычислительные портативные' } })
    tnved.rates.mockResolvedValue({ data: { unitCode: '796', unitName: null } })
    const item = await mountCard(good({ tnvedCode: '8471300000' }))
    await w.get('[data-goods-find]').trigger('click')
    await flushPromises()
    expect(tnved.node).toHaveBeenCalledWith('8471300000')
    expect(tnved.rates).toHaveBeenCalledWith('8471300000')
    expect(item.tnvedDescription).toBe('Машины вычислительные портативные')
    expect(item).toMatchObject({ unitCode: '796', unit: 'шт' })
  })

  it('«Найти»: единица уже есть — ставки не запрашиваются; не лист — открывается справочник с этим кодом', async () => {
    tnved.node.mockResolvedValueOnce({ data: { is10: true, name: 'X' } })
    await mountCard(good({ tnvedCode: '8471300000', unit: 'шт' }))
    await w.get('[data-goods-find]').trigger('click')
    await flushPromises()
    expect(tnved.rates).not.toHaveBeenCalled()

    tnved.node.mockResolvedValueOnce({ data: { is10: false, name: 'Группа' } })
    await typeInto('tnvedCode', '847130')
    await w.get('[data-goods-find]').trigger('click')
    await flushPromises()
    expect(w.get('[data-picker]').attributes()).toMatchObject({ 'data-open': 'true', 'data-query': '847130' })
  })

  it('«Справочник» открывается на введённом коде; выбор ставит код и описание (если пусто), снимает ошибку', async () => {
    tnved.node.mockRejectedValue(new Error('404'))
    const item = await mountCard(good({ tnvedCode: '8471309999' }))
    await f('tnvedCode').trigger('blur')
    await flushPromises()
    expect(w.text()).toContain(INVALID)
    await w.get('[data-goods-picker]').trigger('click')
    expect(w.get('[data-picker]').attributes()).toMatchObject({ 'data-open': 'true', 'data-query': '8471309999' })
    await w.get('[data-picker-select]').trigger('click')
    expect(item).toMatchObject({ tnvedCode: '8471300000', tnvedDescription: 'Машины вычислительные' })
    expect(w.text()).not.toContain(INVALID)
  })

  it('уход с кода, которого нет в справочнике, — ошибка у поля; флаг проверки в товар не попадает', async () => {
    tnved.node.mockRejectedValue(new Error('404'))
    const item = await mountCard(good())
    const before = Object.keys(item).sort()
    await typeInto('tnvedCode', '1902303000')
    await f('tnvedCode').trigger('blur')
    await flushPromises()
    expect(tnved.node).toHaveBeenCalledWith('1902303000')
    expect(w.text()).toContain(INVALID)
    expect(f('tnvedCode').attributes('aria-invalid')).toBe('true')
    expect(Object.keys(item).sort()).toEqual(before)
    expect(JSON.stringify(item)).not.toMatch(/tnved(Invalid|Loading)/)
  })
})

describe('GoodsCard — только чтение', () => {
  it('без кнопок, значения текстом', async () => {
    await mountCard(good({ tnvedCode: '8471300000', quantity: 120, unitCode: '796', grossWeightKg: 420.5, countryOfOrigin: '156', currency: 'USD', customsValue: 25000 }), { readonly: true })
    expect(w.findAll('button').map((b) => b.attributes('data-goods-toggle') !== undefined)).toEqual([true])
    expect(w.find('input').exists()).toBe(false)
    const read = w.get('[data-goods-body]').text()
    expect(read).toContain('120')
    expect(read).toContain('796 — шт')
    expect(read).toContain('420,5')
    expect(read).toContain('156 — Китай')
    expect(read).toContain('8471 30 000 0')
  })
})

describe('GoodsCard в разделе — свёрнутость по ключу карточки', () => {
  it('после удаления соседа выше свёрнутость остаётся у своей карточки', async () => {
    const draft = emptyDraft()
    draft.goods.splice(0, draft.goods.length, good({ description: 'A' }), good({ description: 'B' }), good({ description: 'C' }))
    w = mountWithI18n(SectionGoods, { props: { draft, readonly: false }, attachTo: document.body, global: { stubs } })
    await flushPromises()
    const cards = () => w.findAll('[data-goods-card]')
    const expanded = () => cards().map((c) => c.get('[data-goods-toggle]').attributes('aria-expanded'))
    expect(expanded()).toEqual(['true', 'false', 'false'])
    await cards()[2].get('[data-goods-toggle]').trigger('click')
    await cards()[0].get('[data-goods-toggle]').trigger('click')
    expect(expanded()).toEqual(['false', 'false', 'true'])

    await cards()[0].get('[data-goods-delete]').trigger('click')
    confirmState.resolve(true)
    await flushPromises()
    expect(cards().map((c) => c.get('[data-goods-title]').text())).toEqual(['B', 'C'])
    expect(expanded()).toEqual(['false', 'true'])
  })
})

describe('GoodsCard — номер', () => {
  it('скруглён токеном набора, не rounded-md (сброшен в tokens.css)', async () => {
    await mountCard(good())
    const cls = w.get('[data-goods-number]').classes()
    expect(cls).toContain('rounded-field')
    expect(cls).not.toContain('rounded-md')
  })
})
