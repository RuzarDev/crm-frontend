import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h } from 'vue'
import * as XLSX from 'xlsx'
import { confirmState } from '@/ui/confirm'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { ReestrGoodsItemInput } from '@/types/api'
import { good } from '../../__tests__/recordFixture'

const api = vi.hoisted(() => ({ node: vi.fn(), rates: vi.fn(), toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }))
vi.mock('@/api/tnved', () => ({ tnvedApi: { node: api.node, rates: api.rates } }))
vi.mock('@/ui/message', () => ({ message: api.toast }))
vi.mock('@/api/references', async () => ({ referencesApi: (await import('./harness')).refsApi }))

import SectionGoods from '../SectionGoods.vue'
import { formatKg, formatQty, formatValue } from '../goods'
import { SelectStub, emptyDraft, primeRefs, refsApi } from './harness'

const PickerStub = defineComponent({ setup: () => () => h('div') })
let w: VueWrapper
const mount = async (goods: ReestrGoodsItemInput[], readonly = false) => {
  const draft = emptyDraft()
  draft.goods.splice(0, draft.goods.length, ...goods)
  w = mountWithI18n(SectionGoods, {
    props: { draft, readonly },
    attachTo: document.body,
    global: { stubs: { ZSelect: SelectStub, TnvedPickerModal: PickerStub } },
  })
  await flushPromises()
  return draft
}
const cards = () => w.findAll('[data-goods-card]')
const expanded = () => cards().map((c) => c.get('[data-goods-toggle]').attributes('aria-expanded'))
const total = (key: string) => w.get(`[data-total="${key}"] dd`).text().replace(/ /g, ' ')
const add = async () => { await w.get('[data-section-add]').trigger('click'); await flushPromises() }

const excelFile = (name: string, rows: unknown[][]): File => {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Лист1')
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  const file = new File([out], name)
  if (!('arrayBuffer' in file)) Object.assign(file, { arrayBuffer: async () => out })
  return file
}
const chooseFile = async (file: File) => {
  const input = w.get('[data-goods-excel-input]')
  Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
  await input.trigger('change')
  await flushPromises()
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  primeRefs()
  refsApi.listOkeiUnits.mockResolvedValue([{ id: 'o1', code: '796', name: 'шт', isActive: true }])
  api.node.mockResolvedValue({ data: { is10: true, name: 'X' } })
})
afterEach(() => { confirmState.resolve(false); w?.unmount(); document.body.innerHTML = '' })

describe('SectionGoods', () => {
  it('шапка: «Товары n», «Из Excel», «Добавить товар»; пусто — текст', async () => {
    await mount([])
    expect(w.get('section#sec-goods h2').text()).toBe('Товары')
    expect(w.get('[data-section-count]').text()).toBe('0')
    expect(w.get('[data-goods-excel]').text()).toBe('Из Excel')
    expect(w.get('[data-section-add]').text()).toBe('Добавить товар')
    expect(w.get('[data-goods-empty]').text()).toBe('Товаров пока нет')
    expect(w.find('[data-goods-totals]').exists()).toBe(false)
  })

  it('при открытии записи развёрнута первая карточка; добавленная — в конце, развёрнута, фокус на коде, валюта USD', async () => {
    const d = await mount([good({ description: 'A' }), good({ description: 'B' })])
    expect(expanded()).toEqual(['true', 'false'])
    await add()
    expect(d.goods).toHaveLength(3)
    expect(d.goods[2]).toEqual(good({ currency: 'USD' }))
    expect(expanded()).toEqual(['true', 'false', 'true'])
    expect(w.get('[data-section-count]').text()).toBe('3')
    expect(document.activeElement).toBe(cards()[2].get('[data-f="tnvedCode"]').element)
  })

  it('удалить пустую — сразу; с данными — после подтверждения; «Отмена» оставляет товар', async () => {
    const d = await mount([good({ description: 'A', quantity: 5 })])
    await add()
    await cards()[1].get('[data-goods-delete]').trigger('click')
    await flushPromises()
    expect(confirmState.open).toBe(false)
    expect(d.goods).toHaveLength(1)

    await cards()[0].get('[data-goods-delete]').trigger('click')
    expect(confirmState.open).toBe(true)
    expect(confirmState.title).toBe('Удалить товар 1?')
    expect(confirmState.danger).toBe(true)
    confirmState.resolve(false)
    await flushPromises()
    expect(d.goods).toHaveLength(1)

    await cards()[0].get('[data-goods-delete]').trigger('click')
    confirmState.resolve(true)
    await flushPromises()
    expect(d.goods).toHaveLength(0)
    expect(w.find('[data-goods-empty]').exists()).toBe(true)
  })

  it('черновик подменили целиком («Отменить», перечитывание) — снова развёрнута только первая', async () => {
    const d = await mount([good({ description: 'A' }), good({ description: 'B' })])
    await cards()[1].get('[data-goods-toggle]').trigger('click')
    expect(expanded()).toEqual(['true', 'true'])
    d.goods = [good({ description: 'A' }), good({ description: 'B' }), good({ description: 'C' })]
    await flushPromises()
    expect(expanded()).toEqual(['true', 'false', 'false'])
  })

  it('пустой сохранённый товар (только id, sortOrder, валюта) удаляется без вопроса', async () => {
    const saved = { ...good({ currency: 'USD' }), id: '6f1c2c1e-0000-4000-8000-000000000001', sortOrder: 0 } as ReestrGoodsItemInput
    const d = await mount([saved])
    await cards()[0].get('[data-goods-delete]').trigger('click')
    await flushPromises()
    expect(confirmState.open).toBe(false)
    expect(d.goods).toHaveLength(0)
  })

  it('итоги — из goodsTotals: наименований, мест, брутто, стоимость с общей валютой; пересчёт при правке', async () => {
    const d = await mount([
      good({ packagesCount: 12, grossWeightKg: 420.5, customsValue: 25000, currency: 'USD' }),
      good({ packagesCount: 4, grossWeightKg: 96, customsValue: 1800, currency: 'USD' }),
      good({ packagesCount: 20, grossWeightKg: 54, customsValue: 900, currency: 'USD' }),
    ])
    expect(w.get('[data-total="items"] dt').text()).toBe('Наименований')
    expect([total('items'), total('places'), total('gross'), total('value')]).toEqual(['3', '36', '570,5', '27 700 USD'])
    expect(w.text()).toContain('Итоги считаются по товарам и попадают в «Основное»; там их можно поправить вручную.')

    d.goods[2].currency = 'EUR'
    d.goods[0].grossWeightKg = null
    await flushPromises()
    expect([total('gross'), total('value')]).toEqual(['150,0', '27 700'])
    // Итоги записи пишет useTransitRecord, раздел их не трогает.
    expect(d.transit.grossWeightKg).not.toBe(150)
  })

  it('при открытии проверяет коды сохранённых товаров (один запрос на код)', async () => {
    api.node.mockImplementation(async (code: string) => {
      if (code === '1902303000') throw new Error('404')
      return { data: { is10: true, name: 'ok' } }
    })
    await mount([good({ tnvedCode: '8471300000' }), good({ tnvedCode: '8471300000' }), good({ tnvedCode: '1902303000' })])
    expect(api.node).toHaveBeenCalledTimes(2)
    await cards()[2].get('[data-goods-toggle]').trigger('click')
    expect(cards()[2].text()).toContain('Кода нет в справочнике ТН ВЭД')
    expect(cards()[0].text()).not.toContain('Кода нет в справочнике ТН ВЭД')
  })

  it('«Из Excel»: строки в конец, свёрнуты, тост «Загружено n»', async () => {
    const d = await mount([good({ description: 'Был' })])
    await chooseFile(excelFile('goods.xlsx', [
      ['Код ТН ВЭД', 'Коммерческое описание', 'Брутто', 'Количество товара', 'Количество грузовых мест'],
      ['8471300000', 'Ноутбуки', 420.5, 120, 12],
      ['8473302008', 'Блоки питания', '96,0', 120, 4],
    ]))
    expect(d.goods.map((g) => g.description)).toEqual(['Был', 'Ноутбуки', 'Блоки питания'])
    expect(d.goods[1]).toEqual(good({ tnvedCode: '8471300000', description: 'Ноутбуки', tnvedDescription: 'Ноутбуки', grossWeightKg: 420.5, quantity: 120, packagesCount: 12 }))
    expect(api.toast.success).toHaveBeenCalledWith('Загружено 2 товаров')
    expect(expanded()).toEqual(['true', 'false', 'false'])
  })

  it('«Из Excel»: не Excel — ошибка; без товаров — предупреждение; ничего не добавляется', async () => {
    const d = await mount([])
    await chooseFile(new File(['x'], 'goods.pdf'))
    expect(api.toast.error).toHaveBeenCalledWith('Допустим только Excel-файл (.xlsx)')
    await chooseFile(excelFile('goods.xlsx', [['Наименование'], ['Ноутбук']]))
    expect(api.toast.warning).toHaveBeenCalledWith('Не найдено товаров для импорта')
    expect(d.goods).toHaveLength(0)
  })

  it('только чтение: без «Из Excel», «Добавить», «Удалить»; карточки раскрываются; коды не проверяются', async () => {
    await mount([good({ tnvedCode: '8471300000', quantity: 3 })], true)
    expect(w.find('[data-section-actions]').exists()).toBe(false)
    expect(w.find('[data-goods-delete]').exists()).toBe(false)
    expect(api.node).not.toHaveBeenCalled()
    expect(cards()[0].find('input').exists()).toBe(false)
    expect(cards()[0].get('[data-goods-body]').text()).toContain('8471 30 000 0')
  })
})

describe('числа сводки и итогов — по языку интерфейса', () => {
  const plain = (v: string) => v.replace(/\u00a0/g, ' ')
  it('ru и kk — пробел и запятая, en — запятая и точка', () => {
    expect([formatQty(1800), formatKg(96), formatValue(27700.5)].map(plain)).toEqual(['1 800', '96,0', '27 700,5'])
    expect(plain(formatValue(27700.5, 'kk'))).toBe('27 700,5')
    expect([formatQty(1800, 'en'), formatKg(96, 'en'), formatValue(27700.5, 'en')]).toEqual(['1,800', '96.0', '27,700.5'])
  })
})
