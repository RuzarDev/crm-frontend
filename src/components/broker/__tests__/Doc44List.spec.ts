import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { Import40Doc44ItemInput } from '@/types/api'

const refs = vi.hoisted(() => ({ listClassifiers: vi.fn(), listCountries: vi.fn() }))
vi.mock('@/api/references', () => ({ referencesApi: refs }))

import Doc44List from '../Doc44List.vue'

// Z-поля с Reka (список в портале) — заглушки: кнопка на каждый вариант; у multiple значение — массив.
const SelectStub = {
  props: ['value', 'options', 'disabled', 'mode'],
  emits: ['update:value'],
  template: `<div data-select-stub :data-value="JSON.stringify(value ?? null)" :data-disabled="disabled ? 'true' : 'false'">
    <button v-for="o in options" :key="o.value" type="button" :data-option="o.value" :disabled="disabled"
      @click="$emit('update:value', mode === 'multiple' ? [...(value ?? []), o.value] : o.value)">{{ o.label }}</button>
    <button type="button" data-clear @click="$emit('update:value', mode === 'multiple' ? [] : null)">x</button>
  </div>`,
}
const goods = [{ value: 0, label: 'Товар 1 · 7318150000' }, { value: 1, label: 'Товар 2 · 8501' }]
const doc = (o: Partial<Import40Doc44ItemInput> = {}): Import40Doc44ItemInput => ({
  docTypeCode: null, docTypeName: null, docNumber: null, docDate: null, goodsItemIndex: null, appliesToAll: false, goodsItemIndexes: null,
  docStartDate: null, docValidityDate: null, issueCountryCode: null, ...o,
})

let w: VueWrapper
let items: Import40Doc44ItemInput[]
const mount = async (list: Import40Doc44ItemInput[], o: { readonly?: boolean; goodsOptions?: typeof goods | null; extended?: boolean } = {}) => {
  items = reactive(list)
  w = mountWithI18n(Doc44List, {
    props: { items, readonly: o.readonly ?? false, ...(o.goodsOptions === null ? {} : { goodsOptions: o.goodsOptions ?? goods }), ...(o.extended ? { extended: true } : {}) },
    attachTo: document.body,
    global: { plugins: [createPinia()], stubs: { ZSelect: SelectStub } },
  })
  await flushPromises()
}
const rows = () => w.findAll('[data-doc44-row]')
const f = (key: string, i = 0) => rows()[i].get(`[data-f="${key}"]`)

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  refs.listClassifiers.mockResolvedValue([
    { id: '1', classifierCode: '2009', code: '04021', nameRu: 'Инвойс (счёт-фактура)', sortOrder: 0, isActive: true },
    { id: '2', classifierCode: '2009', code: '02015', nameRu: 'CMR', sortOrder: 0, isActive: true },
  ])
  refs.listCountries.mockResolvedValue([{ alpha2: 'KZ', name: 'Казахстан' }, { alpha2: 'CN', name: 'Китай' }])
})
afterEach(() => { w?.unmount(); document.body.innerHTML = '' })

describe('Doc44List — ДТ (привязка к товарам)', () => {
  it('«Добавить» (expose add) создаёт строку со всеми полями ДТ; монтирование массив не меняет', async () => {
    await mount([doc({ docNumber: '1' })])
    expect(items).toHaveLength(1)
    await (w.vm as unknown as { add: () => Promise<void> }).add()
    expect(items).toHaveLength(2)
    expect(items[1]).toEqual(doc())
  })

  it('«на все товары» и выбор товаров взаимоисключают друг друга; хранятся как раньше (CSV индексов)', async () => {
    await mount([doc()])
    await f('goodsItemIndexes').get('[data-option="1"]').trigger('click')
    expect(items[0].goodsItemIndexes).toBe('1')
    await f('goodsItemIndexes').get('[data-option="0"]').trigger('click')
    expect(items[0].goodsItemIndexes).toBe('1,0')
    await f('appliesToAll').trigger('click')
    expect(items[0]).toMatchObject({ appliesToAll: true, goodsItemIndexes: null })
    expect(f('goodsItemIndexes').attributes('data-disabled')).toBe('true')
    await f('appliesToAll').trigger('click')
    expect(items[0].appliesToAll).toBe(false)
    expect(f('goodsItemIndexes').attributes('data-disabled')).toBe('false')
    await f('goodsItemIndexes').get('[data-clear]').trigger('click')
    expect(items[0].goodsItemIndexes).toBeNull()
  })

  it('варианты товаров — «Товар N · код»; без выбора и без «на все» — подсказка, что это «все»', async () => {
    await mount([doc(), doc({ goodsItemIndexes: '1' })])
    expect(f('goodsItemIndexes').findAll('[data-option]').map((b) => b.text())).toEqual(['Товар 1 · 7318150000', 'Товар 2 · 8501'])
    expect(rows()[0].find('[data-doc44-goods-hint]').text()).toContain('относится ко всем')
    expect(rows()[1].find('[data-doc44-goods-hint]').exists()).toBe(false)
  })

  it('индекс удалённого товара остаётся в выборе (привязка не пропадает молча)', async () => {
    await mount([doc({ goodsItemIndexes: '4' })])
    expect(f('goodsItemIndexes').attributes('data-value')).toBe('[4]')
    expect(f('goodsItemIndexes').find('[data-option="4"]').text()).toBe('Товар 5')
  })

  it('«Ещё»: период действия и страна выдачи (alpha-2); счётчик заполненных', async () => {
    await mount([doc({ docStartDate: '2026-01-01', issueCountryCode: 'CN' }), doc()])
    expect(rows()[0].get('[data-doc44-more-count]').text()).toBe('2')
    expect(rows()[1].find('[data-doc44-more-count]').exists()).toBe(false)
    await rows()[1].get('[data-doc44-more]').trigger('click')
    expect(rows()[1].find('[data-f="authorizedBody"]').exists()).toBe(false)
    await f('issueCountryCode', 1).get('[data-option="KZ"]').trigger('click')
    expect(items[1].issueCountryCode).toBe('KZ')
    await f('issueCountryCode', 1).get('[data-clear]').trigger('click')
    expect(items[1].issueCountryCode).toBeNull()
  })

  it('только чтение: товары и доп. сведения — текстом, без полей', async () => {
    await mount([doc({ docTypeCode: '04021', docTypeName: 'Инвойс', docNumber: 'A1', goodsItemIndexes: '0,1', docValidityDate: '2026-12-31', issueCountryCode: 'CN' }), doc({ appliesToAll: true })], { readonly: true })
    expect(w.find('input').exists()).toBe(false)
    expect(w.find('button').exists()).toBe(false)
    expect(rows()[0].get('[data-doc44-goods-text]').text()).toBe('Товары: Товар 1 · 7318150000, Товар 2 · 8501')
    expect(rows()[0].get('[data-doc44-extras]').text()).toBe('Действует по: 31.12.2026 · Страна выдачи: CN')
    expect(rows()[1].get('[data-doc44-goods-text]').text()).toBe('Товары: все товары')
  })

  it('без опций товаров (запись транзита) привязки к товарам нет', async () => {
    await mount([doc()], { goodsOptions: null, extended: true })
    expect(w.find('[data-doc44-goods]').exists()).toBe(false)
    expect(refs.listCountries).not.toHaveBeenCalled()
  })
})
