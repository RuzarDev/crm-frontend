import { describe, expect, it } from 'vitest'
import { nextTick, reactive, ref } from 'vue'
import type { Import40GoodsItemInput } from '@/types/api'
import { emptyDtForm, type DtFormState } from '../../dtPayload'
import { dtGoodsHasData, newDtGoodsItem, useDtGoods, type GoodsReadinessItem } from '../useDtGoods'

const item = (o: Partial<Import40GoodsItemInput> = {}): Import40GoodsItemInput => ({
  description: 'X', tnvedCode: '7318150000', tnvedDescription: null, countryOfOrigin: 'CN', quantity: 1, unit: null,
  unitCode: '796', grossWeightKg: 1, netWeightKg: 1, packagesCount: 1, quantityTypeCode: null, customsValue: 10,
  currency: 'USD', customsValueKzt: 5000, valuationMethodCode: '1', payments: [{ taxModeCode: '1010' } as never],
  needsTpinRecalc: false, markings: [], extras: null, ...o,
})

function setup(goods: Import40GoodsItemInput[] = [], opts: { currency?: string; canEdit?: boolean } = {}) {
  const form = reactive({ ...emptyDtForm(), currency: opts.currency ?? '', goodsItems: goods }) as DtFormState
  const readiness = ref<GoodsReadinessItem[] | null>(null)
  const canEdit = ref(opts.canEdit ?? true)
  const api = useDtGoods(form, { readiness: () => readiness.value, canEdit })
  return { form, readiness, canEdit, api }
}
const names = (form: DtFormState) => form.goodsItems.map((g) => g.description)

describe('useDtGoods: список', () => {
  it('items — сам form.goodsItems (правка на месте видна в форме)', () => {
    const { form, api } = setup([item({ description: 'A' })])
    expect(api.items.value).toBe(form.goodsItems)
    api.items.value[0].description = 'B'
    expect(form.goodsItems[0].description).toBe('B')
  })

  it('keyOf: стабилен при правке на месте и после перестановки; у копии и нового товара — свой', () => {
    const { form, api } = setup([item({ description: 'A' }), item({ description: 'B' })])
    const a = form.goodsItems[0]
    const k = api.keyOf(a)
    a.description = 'AA'
    a.customsValue = 99
    expect(api.keyOf(form.goodsItems[0])).toBe(k)
    api.move(0, 1)
    expect(api.keyOf(form.goodsItems[1])).toBe(k)
    const [copy] = api.duplicate([1])
    expect(api.keyOf(copy)).not.toBe(k)
    const added = api.add()!
    expect(new Set(form.goodsItems.map(api.keyOf)).size).toBe(4)
    expect(api.keyOf(added)).toBe(api.keyOf(form.goodsItems[3]))
  })

  it('add: в конец, валюта = гр. 22, без неё — USD; пустой товар без платежей', () => {
    const { form, api } = setup([], { currency: 'EUR' })
    const g = api.add()!
    expect(form.goodsItems).toHaveLength(1)
    expect(g.currency).toBe('EUR')
    expect(g.description).toBeNull()
    expect(g.payments).toEqual([])
    expect(g.markings).toEqual([])
    expect(g.needsTpinRecalc).toBe(false)
    form.currency = ''
    expect(api.add()!.currency).toBe('USD')
  })

  it('append (Excel): в конец, возвращает число', () => {
    const { form, api } = setup([item({ description: 'A' })])
    expect(api.append([item({ description: 'B' }), item({ description: 'C' })])).toBe(2)
    expect(names(form)).toEqual(['A', 'B', 'C'])
  })

  it('remove: по индексам (дубли и чужие индексы игнорируются), массив тот же', () => {
    const { form, api } = setup(['A', 'B', 'C', 'D'].map((d) => item({ description: d })))
    const arr = form.goodsItems
    const res = api.remove([3, 1, 1, 9, -1])
    expect(res.removed).toBe(2)
    expect(names(form)).toEqual(['A', 'C'])
    expect(form.goodsItems).toBe(arr)
  })

  it('duplicate: копия сразу после исходного, глубокая (платежи, маркировки, доп. сведения — свои объекты)', () => {
    const src = item({
      description: 'A',
      payments: [{ taxModeCode: '2010', amountKzt: 5 } as never],
      markings: [{ id: 'm1', number: 'KIZ' }],
      extras: { productionPlaceName: 'Z', exciseStamps: [{ quantity: 1 }], vehicles: [{ vin: 'V' }], packages: [{ kind: '1' }] },
    })
    const { form, api } = setup([src, item({ description: 'B' })])
    const copies = api.duplicate([0, 1])
    expect(names(form)).toEqual(['A', 'A', 'B', 'B'])
    const copy = form.goodsItems[1]
    expect(copies[0]).toBe(copy)
    expect(copy).not.toBe(form.goodsItems[0])
    expect(copy.payments).toEqual([{ taxModeCode: '2010', amountKzt: 5 }])
    expect(copy.payments![0]).not.toBe(form.goodsItems[0].payments![0])
    expect(copy.markings).toEqual([{ number: 'KIZ' }]) // id строки маркировки не копируется
    expect(copy.extras!.vehicles[0]).not.toBe(form.goodsItems[0].extras!.vehicles[0])
    copy.extras!.exciseStamps[0].quantity = 7
    expect(form.goodsItems[0].extras!.exciseStamps[0].quantity).toBe(1)
  })

  it('move: перестановка; неверные индексы — false', () => {
    const { form, api } = setup(['A', 'B', 'C'].map((d) => item({ description: d })))
    expect(api.move(0, 2)).toBe(true)
    expect(names(form)).toEqual(['B', 'C', 'A'])
    expect(api.move(2, 0)).toBe(true)
    expect(names(form)).toEqual(['A', 'B', 'C'])
    expect(api.move(1, 1)).toBe(false)
    expect(api.move(0, 3)).toBe(false)
    expect(api.move(-1, 0)).toBe(false)
  })

  it('applyToSelected — правит сами товары формы', () => {
    const { form, api } = setup([item(), item(), item()])
    expect(api.applyToSelected([0, 2], { oisIndicatorCode: 'N', tempImportMonths: 4 })).toBe(2)
    expect(form.goodsItems.map((g) => g.tempImportMonths ?? null)).toEqual([4, null, 4])
    expect(form.goodsItems[0].needsTpinRecalc).toBe(true)
    expect(form.goodsItems[1].needsTpinRecalc).toBe(false)
  })

  it('без права править — ничего не меняется', () => {
    const { form, api } = setup([item({ description: 'A' }), item({ description: 'B' })], { canEdit: false })
    expect(api.add()).toBeNull()
    expect(api.append([item()])).toBe(0)
    expect(api.remove([0]).removed).toBe(0)
    expect(api.duplicate([0])).toEqual([])
    expect(api.move(0, 1)).toBe(false)
    expect(api.applyToSelected([0], { countryOfOrigin: 'DE' })).toBe(0)
    expect(names(form)).toEqual(['A', 'B'])
    expect(form.goodsItems[0].countryOfOrigin).toBe('CN')
  })

  it('removalImpact: сколько товаров с данными — в т.ч. только КЕДЕН-данные (гр. 36, гр. 33, маркировка, доп. сведения, платежи)', () => {
    const { api } = setup([
      item(),
      newDtGoodsItem('EUR'), // пустой: валюта и признаки по умолчанию — не данные
      { ...newDtGoodsItem('USD'), prefDutyCode: 'ОО' },
      { ...newDtGoodsItem('USD'), prohibitionCode: 'D0110' },
      { ...newDtGoodsItem('USD'), markings: [{ number: 'KIZ' }] },
      { ...newDtGoodsItem('USD'), extras: { exciseStamps: [], vehicles: [{ vin: 'X' }], packages: [] } },
      { ...newDtGoodsItem('USD'), extras: { exciseStamps: [], vehicles: [], packages: [], traceable: false } },
      { ...newDtGoodsItem('USD'), payments: [{ taxModeCode: '1010' } as never] },
      { ...newDtGoodsItem('USD'), needsTpinRecalc: true },
    ])
    expect(api.removalImpact([0, 1, 2, 3, 4, 5, 6, 7, 8])).toMatchObject({ count: 9, withData: 6 })
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => dtGoodsHasData(api.items.value[i]))).toEqual([true, false, true, true, true, true, false, true, false])
  })
})

describe('useDtGoods: статусы', () => {
  it('без ответа сервера — местная проверка; с ответом — пункты по goodsIndex', () => {
    const { form, readiness, api } = setup([item(), item({ tnvedCode: null })])
    expect(api.statusOf(form.goodsItems[0])).toEqual({ kind: 'ready' })
    expect(api.statusOf(form.goodsItems[1])).toMatchObject({ kind: 'missing', count: 1 })
    readiness.value = [{ goodsIndex: 0 }, { goodsIndex: 0 }, { goodsIndex: null }]
    expect(api.statusOf(form.goodsItems[0])).toEqual({ kind: 'missing', count: 2 })
    expect(api.statusOf(form.goodsItems[1])).toEqual({ kind: 'ready' })
  })

  it('пункты сервера держатся за товар, а не за место: после удаления/перестановки статус не «переезжает»', async () => {
    const { form, readiness, api } = setup(['A', 'B', 'C'].map((d) => item({ description: d })))
    readiness.value = [{ goodsIndex: 2 }]
    const c = form.goodsItems[2]
    expect(api.statusOf(c)).toEqual({ kind: 'missing', count: 1 })
    api.remove([0])
    await nextTick()
    expect(api.statusOf(c)).toEqual({ kind: 'missing', count: 1 })
    expect(api.statusOf(form.goodsItems[0])).toEqual({ kind: 'ready' })
    // товар, которого не было в ответе сервера, проверяется на месте
    const fresh = api.add()!
    expect(api.statusOf(fresh)).toMatchObject({ kind: 'missing' })
  })

  it('«Пересчитать» — после markStale', () => {
    const { form, readiness, api } = setup([item(), item()])
    readiness.value = []
    api.markStale(form.goodsItems[1])
    expect(api.statusOf(form.goodsItems[1])).toEqual({ kind: 'stale' })
    expect(api.statusOf(form.goodsItems[0])).toEqual({ kind: 'ready' })
  })

  it('indexOfReadinessGoods: «Товар N» пункта — товар с той позиции на момент ответа (после удаления/перестановки)', () => {
    const { form, readiness, api } = setup(['A', 'B', 'C', 'D'].map((d) => item({ description: d })))
    // ответа ещё нет — сама позиция, если она в списке
    expect(api.indexOfReadinessGoods(2)).toBe(2)
    expect(api.indexOfReadinessGoods(4)).toBeNull()
    readiness.value = [{ goodsIndex: 2 }]
    api.remove([1]) // удалили «B» до нового ответа
    expect(form.goodsItems.map((g) => g.description)).toEqual(['A', 'C', 'D'])
    expect(api.indexOfReadinessGoods(2)).toBe(1) // «C»
    expect(api.indexOfReadinessGoods(1)).toBeNull() // «B» удалён
    api.move(1, 2)
    expect(api.indexOfReadinessGoods(2)).toBe(2) // «C» переехал в конец
    expect(api.indexOfReadinessGoods(9)).toBeNull()
  })
})

describe('useDtGoods: привязки гр. 44 / гр. 40 (G1)', () => {
  const withDocs = () => {
    const s = setup(['A', 'B', 'C'].map((d) => item({ description: d })))
    s.form.doc44Items = [
      { docTypeCode: '01011', docTypeName: null, docNumber: 'C-ONLY', docDate: null, goodsItemIndex: null, appliesToAll: false, goodsItemIndexes: '2' },
      { docTypeCode: '01011', docTypeName: null, docNumber: 'B-ONLY', docDate: null, goodsItemIndex: null, appliesToAll: false, goodsItemIndexes: '1' },
      { docTypeCode: '01011', docTypeName: null, docNumber: 'ALL', docDate: null, goodsItemIndex: null, appliesToAll: true, goodsItemIndexes: null },
    ]
    s.form.prevDocItems = [
      { docTypeCode: '09013', docNumber: 'P-C', docDate: null, goodsNumber: '7', goodsItemIndex: 2, sortOrder: 0 },
      { docTypeCode: '09013', docNumber: 'P-B', docDate: null, goodsNumber: '1', goodsItemIndex: 1, sortOrder: 1 },
      { docTypeCode: '09013', docNumber: 'P-ALL', docDate: null, goodsNumber: '2', goodsItemIndex: null, sortOrder: 2 },
    ]
    return s
  }
  const docGoods = (form: DtFormState) => form.doc44Items.map((d) => `${d.docNumber}:${d.appliesToAll ? '*' : d.goodsItemIndexes}`)

  it('удаление товара 2: документ товара 3 остаётся у товара «C», документы только товара 2 — удаляются', () => {
    const { form, api } = withDocs()
    expect(api.removalImpact([1])).toEqual({ count: 1, withData: 1, doc44: 1, prevDocs: 1 })
    const res = api.remove([1])
    expect(names(form)).toEqual(['A', 'C'])
    expect(docGoods(form)).toEqual(['C-ONLY:1', 'ALL:*'])
    expect(form.prevDocItems.map((p) => [p.docNumber, p.goodsItemIndex, p.goodsNumber, p.sortOrder])).toEqual([['P-C', 1, '7', 0], ['P-ALL', null, '2', 1]])
    expect(res).toMatchObject({ removed: 1 })
    expect(res.droppedDoc44.map((d) => d.docNumber)).toEqual(['B-ONLY'])
    expect(res.droppedPrevDocs.map((p) => p.docNumber)).toEqual(['P-B'])
  })

  it('перестановка: привязки едут за товаром', () => {
    const { form, api } = withDocs()
    api.move(2, 0) // C, A, B
    expect(names(form)).toEqual(['C', 'A', 'B'])
    expect(docGoods(form)).toEqual(['C-ONLY:0', 'B-ONLY:2', 'ALL:*'])
    expect(form.prevDocItems.map((p) => [p.goodsItemIndex, p.goodsNumber])).toEqual([[0, '7'], [2, '1'], [null, '2']])
  })

  it('дублирование: копия без привязок, товары после неё сдвигаются', () => {
    const { form, api } = withDocs()
    api.duplicate([0]) // A, A', B, C
    expect(docGoods(form)).toEqual(['C-ONLY:3', 'B-ONLY:2', 'ALL:*'])
    expect(form.prevDocItems.map((p) => [p.goodsItemIndex, p.goodsNumber])).toEqual([[3, '7'], [2, '1'], [null, '2']])
  })
})
