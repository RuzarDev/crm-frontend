import { describe, expect, it } from 'vitest'
import { nextTick, ref } from 'vue'
import type { ReestrGoodsItemInput, ReestrTransitFields } from '@/types/api'
import { REESTR_TRANSIT_DEFAULTS } from '@/utils/reestrDtoMap'
import { useTransitTotals } from '@/composables/useTransitTotals'

const good = (o: Partial<ReestrGoodsItemInput> = {}): ReestrGoodsItemInput => ({
  description: null, tnvedCode: null, tnvedDescription: null, countryOfOrigin: null, quantity: null, unit: null, unitCode: null,
  grossWeightKg: null, netWeightKg: null, packagesCount: null, quantityTypeCode: null, customsValue: null, currency: null, ...o,
})
const SAVED = { goodsQuantity: 7, cargoPlacesCount: 11, grossWeightKg: 9000, totalValue: 123456.78 }
const totals = (t: ReestrTransitFields) => ({
  goodsQuantity: t.goodsQuantity, cargoPlacesCount: t.cargoPlacesCount, grossWeightKg: t.grossWeightKg, totalValue: t.totalValue,
})

describe('useTransitTotals', () => {
  it('подключение к открытой записи не трогает сохранённые итоги (даже если суммы по товарам другие)', async () => {
    const goods = ref([good({ packagesCount: 2, grossWeightKg: 10, customsValue: 100 })])
    const transit = ref<ReestrTransitFields>({ ...REESTR_TRANSIT_DEFAULTS, ...SAVED })
    useTransitTotals(goods, transit)
    await nextTick()
    expect(totals(transit.value)).toEqual(SAVED)
  })

  it('без товаров 0 не пишется — ни при открытии, ни после удаления всех товаров', async () => {
    const goods = ref<ReestrGoodsItemInput[]>([])
    const transit = ref<ReestrTransitFields>({ ...REESTR_TRANSIT_DEFAULTS })
    useTransitTotals(goods, transit)
    await nextTick()
    expect(totals(transit.value)).toEqual({ goodsQuantity: null, cargoPlacesCount: null, grossWeightKg: null, totalValue: null })

    goods.value = [good({ grossWeightKg: 5 })]
    await nextTick()
    expect(transit.value.goodsQuantity).toBe(1)
    expect(transit.value.grossWeightKg).toBe(5)
    goods.value = []
    await nextTick()
    expect(transit.value.goodsQuantity).toBe(1)
    expect(transit.value.grossWeightKg).toBe(5)
  })

  it('правка товаров пересчитывает только изменившийся итог; ручная правка остальных остаётся', async () => {
    const goods = ref([good({ packagesCount: 2, grossWeightKg: 10, customsValue: 100 })])
    const transit = ref<ReestrTransitFields>({ ...REESTR_TRANSIT_DEFAULTS, ...SAVED })
    useTransitTotals(goods, transit)
    await nextTick()

    goods.value = [good({ packagesCount: 2, grossWeightKg: 15, customsValue: 100 })]
    await nextTick()
    expect(totals(transit.value)).toEqual({ ...SAVED, grossWeightKg: 15 })

    goods.value[0].customsValue = 250 // правка поля внутри товара (deep)
    await nextTick()
    expect(transit.value.totalValue).toBe(250)

    goods.value = [...goods.value, good({ packagesCount: 3 })]
    await nextTick()
    expect(totals(transit.value)).toEqual({ goodsQuantity: 2, cargoPlacesCount: 5, grossWeightKg: 15, totalValue: 250 })
  })

  it('rebase(): новая запись в форме — её товары точка отсчёта, её итоги не перезаписываются', async () => {
    const goods = ref([good({ grossWeightKg: 10 })])
    const transit = ref<ReestrTransitFields>({ ...REESTR_TRANSIT_DEFAULTS, ...SAVED })
    const { rebase } = useTransitTotals(goods, transit)
    await nextTick()

    // форма загрузила другую запись: товары и итоги заменены разом, затем rebase()
    goods.value = [good({ grossWeightKg: 40, packagesCount: 4 }), good({ grossWeightKg: 2 })]
    transit.value = { ...REESTR_TRANSIT_DEFAULTS, goodsQuantity: 9, cargoPlacesCount: 99, grossWeightKg: 999, totalValue: 9999 }
    rebase()
    await nextTick()
    expect(totals(transit.value)).toEqual({ goodsQuantity: 9, cargoPlacesCount: 99, grossWeightKg: 999, totalValue: 9999 })

    goods.value = [good({ grossWeightKg: 40, packagesCount: 4 })]
    await nextTick()
    expect(totals(transit.value)).toEqual({ goodsQuantity: 1, cargoPlacesCount: 99, grossWeightKg: 40, totalValue: 9999 })
  })
})
