import { describe, expect, it } from 'vitest'
import type { Import40GoodsItemInput } from '@/types/api'
import { BULK_FIELDS, BULK_GROUPS, applyBulkPatch, bulkPatchFrom } from '../goodsBulk'

const g = (o: Partial<Import40GoodsItemInput> = {}): Import40GoodsItemInput =>
  ({ description: 'X', currency: 'USD', payments: [{}], needsTpinRecalc: false, ...o } as Import40GoodsItemInput)

describe('goodsBulk: «Применить к выбранным»', () => {
  it('поля доски: страна, гр. 37 и предш., особенность, гр. 43, гр. 36 ×4, ОИС ×3, С/М/П, гр. 33, сертификация, месяцы, упаковка', () => {
    expect([...BULK_FIELDS].sort()).toEqual([
      'certificationNote', 'countryOfOrigin', 'goodsMoveFeatureCode', 'oisCountryCode', 'oisIndicatorCode', 'oisRegNumber',
      'packageAvailabilityCode', 'packageKindCode', 'prefClearanceCode', 'prefDutyCode', 'prefExciseCode', 'prefVatCode',
      'previousProcedureCode', 'procedureCode', 'prohibitionCode', 'restrictionMarks', 'tempImportMonths', 'valuationMethodCode',
    ].sort())
    // группы покрывают все поля ровно по разу
    const grouped = Object.values(BULK_GROUPS).flat()
    expect(grouped.sort()).toEqual([...BULK_FIELDS].sort())
  })

  it('пишет только переданные поля и только выбранным товарам; null — очистить; возвращает число изменённых товаров', () => {
    const goods = [g({ countryOfOrigin: 'CN' }), g({ countryOfOrigin: 'DE', oisRegNumber: 'OLD' }), g({ countryOfOrigin: 'CN' })]
    const n = applyBulkPatch(goods, [1, 2, 7], { countryOfOrigin: 'CN', oisRegNumber: null })
    expect(n).toBe(1) // товар 3: страна та же, ОИС и так пуст → не изменён
    expect(goods.map((x) => x.countryOfOrigin)).toEqual(['CN', 'CN', 'CN'])
    expect(goods[1].oisRegNumber).toBeNull()
    expect(goods[0].oisRegNumber).toBeUndefined()
  })

  it('K1: ОИС / С/М/П / коды гр. 33 / сертификация доходят до самих объектов товаров (не до копий)', () => {
    const src = g({ oisIndicatorCode: 'N', oisRegNumber: 'ТЗ-1', oisCountryCode: 'KZ', restrictionMarks: 'С,М', prohibitionCode: 'D0110,D0120', certificationNote: 'СЕРТ' })
    const a = g()
    const b = g()
    const goods = [src, a, b]
    const patch = bulkPatchFrom(src, [...BULK_GROUPS.ois, ...BULK_GROUPS.restrictions, ...BULK_GROUPS.gr33Codes, ...BULK_GROUPS.certification])
    expect(applyBulkPatch(goods, [1, 2], patch)).toBe(2)
    for (const t of [a, b]) {
      expect(t).toMatchObject({ oisIndicatorCode: 'N', oisRegNumber: 'ТЗ-1', oisCountryCode: 'KZ', restrictionMarks: 'С,М', prohibitionCode: 'D0110,D0120', certificationNote: 'СЕРТ' })
    }
  })

  it('рег. № ОИС — заглавными; пустая строка = null', () => {
    const t = g({ certificationNote: 'СЕРТ' })
    applyBulkPatch([t], [0], { oisRegNumber: 'tz-12', certificationNote: '' })
    expect(t.oisRegNumber).toBe('TZ-12')
    expect(t.certificationNote).toBeNull()
  })

  it('поля платежей (страна, гр. 36, месяцы) помечают платежи устаревшими; прочие — нет', () => {
    const a = g()
    const b = g()
    applyBulkPatch([a, b], [0], { procedureCode: '4000', packageKindCode: 'CT' })
    expect(a.needsTpinRecalc).toBe(false)
    applyBulkPatch([a, b], [0, 1], { tempImportMonths: 6 })
    expect(a.needsTpinRecalc).toBe(true)
    expect(b.needsTpinRecalc).toBe(true)
    const c = g({ prefDutyCode: 'ОО' })
    applyBulkPatch([c], [0], { prefDutyCode: 'ОО' })
    expect(c.needsTpinRecalc).toBe(false) // значение не изменилось
    applyBulkPatch([c], [0], { prefDutyCode: 'ОП' })
    expect(c.needsTpinRecalc).toBe(true)
  })

  it('«Проставить месяцы всем» = месяцы первого товара во все', () => {
    const goods = [g({ tempImportMonths: 12 }), g(), g({ tempImportMonths: 3 })]
    applyBulkPatch(goods, [0, 1, 2], bulkPatchFrom(goods[0], BULK_GROUPS.tempImport))
    expect(goods.map((x) => x.tempImportMonths)).toEqual([12, 12, 12])
  })

  it('поля вне списка в заплатке игнорируются', () => {
    const t = g({ tnvedCode: '1' })
    applyBulkPatch([t], [0], { tnvedCode: '2' } as never)
    expect(t.tnvedCode).toBe('1')
  })
})
