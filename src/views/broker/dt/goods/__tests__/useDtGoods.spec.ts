import { describe, expect, it } from 'vitest'
import { nextTick, reactive, ref } from 'vue'
import type { Import40GoodsItemInput } from '@/types/api'
import { emptyDtForm, type DtFormState } from '../../dtPayload'
import { useDtGoods, type GoodsReadinessItem } from '../useDtGoods'

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

  it('removalImpact: сколько товаров с данными', () => {
    const { api } = setup([item(), item({ description: null, tnvedCode: null, countryOfOrigin: null, quantity: null, unitCode: null, grossWeightKg: null, netWeightKg: null, packagesCount: null, customsValue: null })])
    expect(api.removalImpact([0, 1])).toMatchObject({ count: 2, withData: 1 })
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
    expect(api.counts.value).toEqual({ missing: 1, stale: 0 })
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

  it('«Пересчитать» — после markStale; счётчик фильтров', () => {
    const { form, readiness, api } = setup([item(), item()])
    readiness.value = []
    api.markStale(form.goodsItems[1])
    expect(api.statusOf(form.goodsItems[1])).toEqual({ kind: 'stale' })
    expect(api.counts.value).toEqual({ missing: 0, stale: 1 })
  })
})
