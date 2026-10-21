import { describe, expect, it } from 'vitest'
import type { Import40GoodsItemInput } from '@/types/api'
import { paymentsStale } from '../../dtPageModel'
import {
  PAYMENT_FIELDS, goodsPaymentsStale, goodsStatusView, localMissingFields, localStatus, markStale, missingByGoodsIndex, netOverGross,
  setGoodsField, statusFrom, type GoodsReadinessItem,
} from '../goodsStatus'

const complete = (o: Partial<Import40GoodsItemInput> = {}): Import40GoodsItemInput => ({
  description: 'ВИНТЫ', tnvedCode: '7318150000', tnvedDescription: null, countryOfOrigin: 'CN',
  quantity: 100, unit: 'шт', unitCode: '796', grossWeightKg: 12, netWeightKg: 11, packagesCount: 2,
  quantityTypeCode: null, customsValue: 1500, currency: 'USD', customsValueKzt: 750000, valuationMethodCode: '1',
  payments: [{ taxModeCode: '1010' } as never], needsTpinRecalc: false,
  ...o,
})

// Статус товара на позиции index: так его считает useDtGoods.statusOf (пункты сервера → statusFrom; ответа нет — localStatus).
const goodsStatus = (g: Import40GoodsItemInput, index: number, readiness: readonly GoodsReadinessItem[] | Map<number, number> | null) => {
  if (!readiness) return localStatus(g)
  const by = readiness instanceof Map ? readiness : missingByGoodsIndex(readiness)
  return statusFrom(g, by.get(index) ?? 0)
}

describe('goodsStatus: признак «платежи устарели»', () => {
  it('товар устарел: стоит needsTpinRecalc или нет ни одной строки гр. 47 (как точка раздела на странице)', () => {
    expect(goodsPaymentsStale(complete())).toBe(false)
    expect(goodsPaymentsStale(complete({ needsTpinRecalc: true }))).toBe(true)
    expect(goodsPaymentsStale(complete({ payments: [] }))).toBe(true)
    expect(goodsPaymentsStale(complete({ payments: undefined }))).toBe(true)
    // страница считает раздел тем же правилом
    expect(paymentsStale([complete(), complete({ needsTpinRecalc: true })])).toBe(true)
    expect(paymentsStale([complete()])).toBe(false)
  })

  it('PAYMENT_FIELDS: все поля товара, которые уходят в расчёт платежей, + гр. 36 ×4', () => {
    // поля товара, которые сервер берёт для расчёта платежей из сохранённой ДТ (вход calculate-payments).
    // Список СТАТИЧЕСКИЙ (раньше сверялся с toPaymentsInput): при новом входном поле расчёта обновить его вручную и PAYMENT_FIELDS.
    const inputToItem: Record<string, keyof Import40GoodsItemInput> = {
      tnvedCode: 'tnvedCode', invoiceValue: 'customsValue', currency: 'currency', grossWeightKg: 'grossWeightKg',
      quantity: 'quantity', vatRatePreferential: 'vatRatePreferential', tempImportMonths: 'tempImportMonths',
      netWeightKg: 'netWeightKg', customsValueKzt: 'customsValueKzt', originCountry: 'countryOfOrigin',
      exciseKind: 'exciseKind', antiDumpingKind: 'antiDumpingKind', unitCode: 'unitCode', volumeL: 'taxVolumeL',
      alcoholL: 'taxAlcoholL', pieces: 'taxPieces', engineVolumeCm3: 'engineVolumeCm3',
    }
    for (const f of Object.values(inputToItem)) expect(PAYMENT_FIELDS).toContain(f)
    for (const f of ['prefClearanceCode', 'prefDutyCode', 'prefExciseCode', 'prefVatCode'] as const) expect(PAYMENT_FIELDS).toContain(f)
    expect(PAYMENT_FIELDS).not.toContain('description')
    expect(PAYMENT_FIELDS).not.toContain('needsTpinRecalc')
  })

  it('markStale ставит needsTpinRecalc', () => {
    const g = complete()
    markStale(g)
    expect(g.needsTpinRecalc).toBe(true)
  })

  it('setGoodsField: правка поля платежей помечает устаревшими, прочего — нет; то же значение — ничего', () => {
    const g = complete()
    expect(setGoodsField(g, 'description', 'БОЛТЫ')).toBe(true)
    expect(g.description).toBe('БОЛТЫ')
    expect(g.needsTpinRecalc).toBe(false)
    expect(setGoodsField(g, 'grossWeightKg', 12)).toBe(false)
    expect(g.needsTpinRecalc).toBe(false)
    expect(setGoodsField(g, 'grossWeightKg', 13)).toBe(true)
    expect(g.grossWeightKg).toBe(13)
    expect(g.needsTpinRecalc).toBe(true)
  })
})

describe('goodsStatus: статус товара', () => {
  it('с сервером: «не хватает N» — пункты готовности с этим goodsIndex (с 0)', () => {
    const items = [
      { goodsIndex: 1 }, { goodsIndex: 1 }, { goodsIndex: null }, { goodsIndex: 0 },
    ]
    const by = missingByGoodsIndex(items)
    expect(by.get(1)).toBe(2)
    expect(by.get(0)).toBe(1)
    expect(goodsStatus(complete(), 1, items)).toEqual({ kind: 'missing', count: 2 })
    expect(goodsStatus(complete(), 0, by)).toEqual({ kind: 'missing', count: 1 })
    expect(goodsStatus(complete(), 2, items)).toEqual({ kind: 'ready' })
  })

  it('с сервером: пунктов нет, но платежи устарели — «Пересчитать»; «не хватает» важнее', () => {
    expect(goodsStatus(complete({ needsTpinRecalc: true }), 0, [])).toEqual({ kind: 'stale' })
    expect(goodsStatus(complete({ payments: [] }), 0, [])).toEqual({ kind: 'stale' })
    expect(goodsStatus(complete({ needsTpinRecalc: true }), 0, [{ goodsIndex: 0 }])).toEqual({ kind: 'missing', count: 1 })
  })

  it('без сервера — местная проверка, как прежняя отметка раздела (код, описание, веса, кол-во, ДЕИ, стоимости, гр. 43)', () => {
    expect(localMissingFields(complete())).toEqual([])
    expect(goodsStatus(complete(), 0, null)).toEqual({ kind: 'ready' })
    // описание из ТН ВЭД годится вместо описания из инвойса
    expect(localMissingFields(complete({ description: null, tnvedDescription: 'винты' }))).toEqual([])
    const empty = complete({
      description: '  ', tnvedDescription: null, tnvedCode: null, grossWeightKg: null, netWeightKg: null, quantity: null,
      unitCode: null, customsValue: null, customsValueKzt: null, valuationMethodCode: null,
    })
    const fields = localMissingFields(empty)
    expect(fields).toEqual(['tnvedCode', 'description', 'grossWeightKg', 'netWeightKg', 'quantity', 'unitCode', 'customsValue', 'customsValueKzt', 'valuationMethodCode'])
    expect(goodsStatus(empty, 0, null)).toEqual({ kind: 'missing', count: 9, fields })
    // 0 — это значение, не пусто
    expect(localMissingFields(complete({ grossWeightKg: 0, netWeightKg: 0 }))).toEqual([])
    // нетто больше брутто — ошибка (как в проверке перед XML на сервере); равны — можно
    expect(localMissingFields(complete({ grossWeightKg: 719.1, netWeightKg: 1128 }))).toEqual(['netOverGross'])
    expect(localMissingFields(complete({ grossWeightKg: 11, netWeightKg: 11 }))).toEqual([])
    expect(goodsStatus(complete({ needsTpinRecalc: true }), 0, null)).toEqual({ kind: 'stale' })
  })
})

describe('goodsStatus: нетто > брутто (№14а)', () => {
  it('netOverGross: оба веса указаны и нетто строго больше; равны, пусто — не эта ошибка; 0 — значение', () => {
    expect(netOverGross({ grossWeightKg: 22222, netWeightKg: 44444 })).toBe(true)
    expect(netOverGross({ grossWeightKg: 11, netWeightKg: 11 })).toBe(false)
    expect(netOverGross({ grossWeightKg: 12, netWeightKg: 11 })).toBe(false)
    expect(netOverGross({ grossWeightKg: null, netWeightKg: 11 })).toBe(false)
    expect(netOverGross({ grossWeightKg: 12, netWeightKg: undefined })).toBe(false)
    expect(netOverGross({ grossWeightKg: 0, netWeightKg: 1 })).toBe(true)
    expect(netOverGross({ grossWeightKg: 0, netWeightKg: 0 })).toBe(false)
    // строка Excel до переноса: строки чисел тоже сравниваются как числа
    expect(netOverGross({ grossWeightKg: '9', netWeightKg: '10' })).toBe(true)
    expect(netOverGross({ grossWeightKg: ' ', netWeightKg: '10' })).toBe(false)
  })

  it('goodsStatusView: «Нетто > брутто» вместо «Не хватает 1»; больше пунктов — «· ещё N»; прочие виды прежние', () => {
    const bad = complete({ grossWeightKg: 22222, netWeightKg: 44444 })
    expect(goodsStatusView({ kind: 'missing', count: 1 }, bad)).toEqual({ tone: 'danger', key: 'status.netOverGross' })
    expect(goodsStatusView({ kind: 'missing', count: 3 }, bad)).toEqual({ tone: 'danger', key: 'status.netOverGrossMore', params: { n: 2 } })
    expect(goodsStatusView({ kind: 'missing', count: 2 }, complete())).toEqual({ tone: 'danger', key: 'status.missing', params: { n: 2 } })
    expect(goodsStatusView({ kind: 'badCode' }, bad)).toEqual({ tone: 'danger', key: 'status.badCode' })
    expect(goodsStatusView({ kind: 'stale' }, complete())).toEqual({ tone: 'accent', key: 'status.stale' })
    expect(goodsStatusView({ kind: 'ready' }, complete())).toEqual({ tone: 'done', key: 'status.ready' })
    // без ответа сервера: местная проверка считает netOverGross одним пунктом
    expect(goodsStatusView(localStatus(bad), bad)).toEqual({ tone: 'danger', key: 'status.netOverGross' })
  })
})
