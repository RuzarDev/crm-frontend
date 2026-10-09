import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { mountWithI18n } from '@/test/mountWithI18n'
import { vUppercase } from '@/directives/uppercase'
import { useClassifiersStore } from '@/stores/classifiers'
import { emptyDtForm, type DtFormState } from '../dtPayload'
import SectionDocs from '../sections/SectionDocs.vue'

const refs = vi.hoisted(() => ({ listClassifiers: vi.fn(), listCountries: vi.fn() }))
vi.mock('@/api/references', () => ({ referencesApi: refs }))

const SelectStub = {
  props: ['value', 'options', 'disabled', 'mode'],
  emits: ['update:value'],
  template: `<div data-select-stub :data-value="JSON.stringify(value ?? null)">
    <button v-for="o in options" :key="o.value" type="button" :data-option="o.value" @click="$emit('update:value', mode === 'multiple' ? [...(value ?? []), o.value] : o.value)">{{ o.label }}</button>
    <button type="button" data-clear @click="$emit('update:value', mode === 'multiple' ? [] : null)">x</button>
  </div>`,
}
const item = (classifierCode: string, code: string, nameRu: string) => ({ id: `${classifierCode}-${code}`, classifierCode, code, nameRu, sortOrder: 0, isActive: true })
const goods = (n: number) => Array.from({ length: n }, (_, i) => ({ ...emptyDtForm().goodsItems[0], tnvedCode: `73181500${i}0`, description: `Т${i + 1}` })) as DtFormState['goodsItems']

let w: VueWrapper
let pinia: ReturnType<typeof createPinia>
let form: DtFormState
beforeEach(() => {
  vi.clearAllMocks()
  pinia = createPinia()
  setActivePinia(pinia)
  form = reactive(emptyDtForm())
  form.goodsItems = goods(2)
  refs.listClassifiers.mockResolvedValue([item('2009', '04021', 'Инвойс')])
  refs.listCountries.mockResolvedValue([{ alpha2: 'KZ', name: 'Казахстан' }])
  useClassifiersStore().cache = {
    'prev-doc-types': [item('prev-doc-types', '09013', 'Декларация на товары'), item('prev-doc-types', '10003', 'Транзитная декларация')],
    '2009': [item('2009', '04021', 'Инвойс')],
  }
})
afterEach(() => { w?.unmount(); document.body.innerHTML = '' })

const mount = async (over: Partial<DtFormState> = {}, props: Record<string, unknown> = {}) => {
  Object.assign(form, over)
  w = mountWithI18n(SectionDocs, {
    props: { form, readonly: false, ...props },
    global: { plugins: [pinia], directives: { uppercase: vUppercase }, stubs: { ZSelect: SelectStub, DtGraphHelp: { props: ['graph'], template: '<i data-help />' } } },
    attachTo: document.body,
  })
  await flushPromises()
}
const prevRows = () => w.findAll('[data-prev-row]')
const docRows = () => w.findAll('[data-doc44-row]')

describe('SectionDocs — гр. 40', () => {
  it('открытие списки не меняет; пустые состояния; data-graph у обеих граф', async () => {
    form.prevDocItems = [{ docTypeCode: '09013', docNumber: 'X1', docDate: null, goodsNumber: null, goodsItemIndex: null, sortOrder: 0 }]
    const before = JSON.stringify(form)
    await mount()
    expect(JSON.stringify(form)).toBe(before)
    expect(w.find('[data-graph="40"]').exists()).toBe(true)
    expect(w.find('[data-graph="44"]').exists()).toBe(true)
    form.prevDocItems = []
    await w.vm.$nextTick()
    expect(w.get('[data-prev-empty]').text()).toContain('Предшествующих документов нет')
  })

  it('«Добавить предшествующий документ»: пустая строка с sortOrder; вид — по классификатору; номер — в верхнем регистре', async () => {
    await mount()
    await w.get('[data-prev-add]').trigger('click')
    await flushPromises()
    expect(form.prevDocItems).toEqual([{ docTypeCode: null, docNumber: null, docDate: null, goodsNumber: null, goodsItemIndex: null, sortOrder: 0 }])
    const row = prevRows()[0]
    expect(row.findAll('[data-select-stub]')[0].findAll('[data-option]').map((b) => b.text())).toEqual(['09013 — Декларация на товары', '10003 — Транзитная декларация'])
    await row.get('[data-option="10003"]').trigger('click')
    expect(form.prevDocItems[0].docTypeCode).toBe('10003')
    const num = row.get('[data-f="docNumber"]')
    ;(num.element as HTMLInputElement).value = 'kz-123/a'
    await num.trigger('input')
    expect(form.prevDocItems[0].docNumber).toBe('KZ-123/A')
  })

  it('товар выбирается из товаров ДТ; хранится порядковым номером строкой («1», «2»), как раньше', async () => {
    form.prevDocItems = [{ docTypeCode: '09013', docNumber: 'X1', docDate: null, goodsNumber: null, goodsItemIndex: null, sortOrder: 0 }]
    await mount()
    const goodsStub = prevRows()[0].get('[data-f="goodsNumber"]')
    expect(goodsStub.findAll('[data-option]').map((b) => b.text())).toEqual(['Товар 1 · 7318150000', 'Товар 2 · 7318150010'])
    await goodsStub.get('[data-option="2"]').trigger('click')
    expect(form.prevDocItems[0].goodsNumber).toBe('2')
    await goodsStub.get('[data-clear]').trigger('click')
    expect(form.prevDocItems[0].goodsNumber).toBeNull()
  })

  it('старое свободное значение товара остаётся вариантом; удаление перенумеровывает sortOrder', async () => {
    form.prevDocItems = [
      { docTypeCode: null, docNumber: 'A', docDate: null, goodsNumber: '1,2', goodsItemIndex: null, sortOrder: 0 },
      { docTypeCode: null, docNumber: 'B', docDate: null, goodsNumber: null, goodsItemIndex: null, sortOrder: 1 },
      { docTypeCode: null, docNumber: 'C', docDate: null, goodsNumber: null, goodsItemIndex: null, sortOrder: 2 },
    ]
    await mount()
    expect(prevRows()[0].get('[data-f="goodsNumber"]').attributes('data-value')).toBe('"1,2"')
    await prevRows()[0].get('[data-prev-delete]').trigger('click')
    expect(form.prevDocItems.map((p) => [p.docNumber, p.sortOrder])).toEqual([['B', 0], ['C', 1]])
  })

  it('только чтение: текст, без кнопок «Добавить» и «Удалить»', async () => {
    form.prevDocItems = [{ docTypeCode: '09013', docNumber: 'X1', docDate: '2026-09-12', goodsNumber: '2', goodsItemIndex: null, sortOrder: 0 }]
    await mount({}, { readonly: true })
    const t = prevRows()[0].text()
    expect(t).toContain('09013 — Декларация на товары')
    expect(t).toContain('X1')
    expect(t).toContain('12.09.2026')
    expect(t).toContain('Товар 2 · 7318150010')
    expect(w.find('button').exists()).toBe(false)
    expect(w.find('input').exists()).toBe(false)
  })
})

describe('SectionDocs — гр. 44', () => {
  it('«Добавить документ» — строка с привязкой к товарам; варианты — «Товар N · код» (а без кода — описание)', async () => {
    form.goodsItems = [{ ...goods(1)[0], tnvedCode: '', description: 'ВИНТЫ' }, { ...goods(1)[0], tnvedCode: '', description: '' }]
    await mount()
    await w.get('[data-doc44-add]').trigger('click')
    await flushPromises()
    expect(form.doc44Items).toHaveLength(1)
    expect(form.doc44Items[0]).toMatchObject({ appliesToAll: false, goodsItemIndexes: null, goodsItemIndex: null })
    expect(docRows()[0].get('[data-f="goodsItemIndexes"]').findAll('[data-option]').map((b) => b.text())).toEqual(['Товар 1 · ВИНТЫ', 'Товар 2'])
  })

  it('код документа подставляет вид (классификатор 2009); данные других полей не теряются', async () => {
    form.doc44Items = [{ docTypeCode: null, docTypeName: null, docNumber: 'N1', docDate: null, goodsItemIndex: null, appliesToAll: true, goodsItemIndexes: null, docStartDate: null, docValidityDate: null, issueCountryCode: null }]
    await mount()
    await docRows()[0].get('[data-f="docTypeCode"]').get('[data-option="04021"]').trigger('click')
    expect(form.doc44Items[0]).toMatchObject({ docTypeCode: '04021', docTypeName: 'Инвойс', docNumber: 'N1', appliesToAll: true })
  })

  it('открытие со старыми данными (включая документ привязанный к товарам) форму не меняет', async () => {
    form.doc44Items = [{ docTypeCode: '04021', docTypeName: 'Инвойс', docNumber: 'N1', docDate: '2026-09-12', goodsItemIndex: null, appliesToAll: false, goodsItemIndexes: '0,1', docStartDate: null, docValidityDate: null, issueCountryCode: 'KZ' }]
    const before = JSON.stringify(form)
    await mount()
    expect(JSON.stringify(form)).toBe(before)
  })
})
