import { describe, expect, it } from 'vitest'
import { obligationFieldsFrom, type ObligationFields } from '@/api/dtForms'
import type { Import40Doc44ItemInput } from '@/types/api'
import { applyObligationToDoc44, emptyObligationFields, obligationBody, obligationMissing } from '../dtObligation'

// Обязательство при условном выпуске (23.10.2026): поля окна, тело запроса, строка гр. 44 08999 после формирования.
const fields = (o: Partial<ObligationFields> = {}): ObligationFields => ({
  ...emptyObligationFields('2026-10-23', 'ИВАНОВ И.И.'),
  consigneeName: 'ТОО «ТЕСТ»', address: 'РК, г. Астана', ...o,
})

describe('поля обязательства', () => {
  it('ответ defaults — в поля: даты до дня, пустые строки и нет поля — null, нет даты — сегодня', () => {
    expect(obligationFieldsFrom({
      date: '2026-10-21T00:00:00', number: 'Б/Н', consigneeName: ' ', invoices: [{ number: 'INV-1', date: '2026-10-14T00:00:00' }, { number: null }],
      countryFrom: 'Китая', postCode: '57505',
    }, '2026-10-23')).toEqual({
      date: '2026-10-21', number: 'Б/Н', consigneeName: null,
      invoices: [{ number: 'INV-1', date: '2026-10-14' }, { number: null, date: null }],
      countryFrom: 'Китая', postCode: '57505', postName: null, warehouseName: null, address: null, signerPosition: null, signerName: null,
    })
    expect(obligationFieldsFrom(null, '2026-10-23')).toMatchObject({ date: '2026-10-23', invoices: [] })
  })

  it('без ответа сервера: сегодня, «Б/Н», «Директор», руководитель клиента', () => {
    expect(emptyObligationFields('2026-10-23', 'ИВАНОВ И.И.')).toMatchObject({
      date: '2026-10-23', number: 'Б/Н', signerPosition: 'Директор', signerName: 'ИВАНОВ И.И.', invoices: [],
    })
  })

  it('тело: строки обрезаны, пусто — null, пустые инвойсы убраны, не больше 20, адрес до 1000 знаков', () => {
    const body = obligationBody(fields({
      number: '  ', countryFrom: ' Китая ', address: 'а'.repeat(1200),
      invoices: [{ number: ' INV-1 ', date: '2026-10-14' }, { number: '', date: null }, { number: null, date: '2026-10-15' },
        ...Array.from({ length: 25 }, (_, i) => ({ number: `N${i}`, date: null }))],
    }))
    expect(body.number).toBeNull()
    expect(body.countryFrom).toBe('Китая')
    expect(body.address).toHaveLength(1000)
    expect(body.invoices).toHaveLength(20)
    expect(body.invoices.slice(0, 2)).toEqual([{ number: 'INV-1', date: '2026-10-14' }, { number: null, date: '2026-10-15' }])
  })

  it('не заполнены — Ф.И.О. и адрес', () => {
    expect(obligationMissing({ signerName: ' ', address: null })).toEqual(['name', 'address'])
    expect(obligationMissing({ signerName: 'ИВАНОВ И.И.', address: 'РК' })).toEqual([])
  })
})

describe('applyObligationToDoc44', () => {
  const row = (o: Partial<Import40Doc44ItemInput>): Import40Doc44ItemInput =>
    ({ docTypeCode: '08999', docTypeName: 'СВОЁ', docNumber: 'Б/Н', docDate: null, appliesToAll: false, goodsItemIndexes: '1', presentKindCode: '1', ...o })

  it('строка 08999 есть — номер и дата обязательства; вид, признак и привязка остаются', () => {
    const items = [row({})]
    expect(applyObligationToDoc44(items, { number: '15', date: '2026-10-21' }, [0, 1], 'ИНЫЕ')).toBe('updated')
    expect(items).toEqual([row({ docNumber: '15', docDate: '2026-10-21' })])
  })

  it('строки нет — добавить: к товарам с D0122 (нет таких — без привязки), признак 1', () => {
    const items: Import40Doc44ItemInput[] = [{ docTypeCode: '04021', docTypeName: 'ИНВОЙС', docNumber: 'INV-1', docDate: '2026-10-14' }]
    expect(applyObligationToDoc44(items, { number: null, date: '2026-10-21' }, [2, 0], 'ИНЫЕ')).toBe('added')
    expect(items[1]).toMatchObject({
      docTypeCode: '08999', docTypeName: 'ИНЫЕ', docNumber: null, docDate: '2026-10-21', appliesToAll: false, goodsItemIndexes: '0,2', presentKindCode: '1',
    })
    const lone: Import40Doc44ItemInput[] = []
    applyObligationToDoc44(lone, { number: 'Б/Н', date: '2026-10-21' }, [], 'ИНЫЕ')
    expect(lone[0]).toMatchObject({ goodsItemIndexes: null, appliesToAll: false })
  })
})
