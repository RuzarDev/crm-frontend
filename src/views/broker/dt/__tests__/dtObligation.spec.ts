import { describe, expect, it } from 'vitest'
import { obligationFieldsFrom, type ObligationFields } from '@/api/dtForms'
import type { Import40Doc44ItemInput } from '@/types/api'
import {
  applyObligationToDoc44, conditionalReleaseGoods, emptyObligationFields, ensureObligationDoc44, obligationBody, obligationMissing,
  obligationWarnings,
} from '../dtObligation'

// Обязательство при условном выпуске (23.10.2026): поля окна, тело запроса, строка гр. 44 08999 после формирования;
// связка D0122 (гр. 33) ↔ 08999 (гр. 44) — автострока и предупреждения.
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
    expect(obligationBody(fields({ number: '7'.repeat(80) })).number).toHaveLength(50) // номер строки гр. 44 — Id50
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

  it('строка 08999 «Б/Н» — номер и дата обязательства; вид, признак и привязка остаются', () => {
    const items = [row({ docNumber: 'б/н' })]
    expect(applyObligationToDoc44(items, { number: '15', date: '2026-10-21' }, [0, 1], 'ИНЫЕ')).toBe('updated')
    expect(items).toEqual([row({ docNumber: '15', docDate: '2026-10-21' })])
  })

  it('исх. № пуст — в строке «Б/Н», а не пусто (иначе у документа в XML нет DocId)', () => {
    const items = [row({})]
    applyObligationToDoc44(items, { number: null, date: '2026-10-21' }, [1], 'ИНЫЕ')
    expect(items[0].docNumber).toBe('Б/Н')
    const lone: Import40Doc44ItemInput[] = []
    applyObligationToDoc44(lone, { number: '  ', date: '2026-10-21' }, [], 'ИНЫЕ')
    expect(lone[0].docNumber).toBe('Б/Н')
  })

  it('строки нет — добавить: к товарам с D0122 (нет таких — без привязки), признак 1', () => {
    const items: Import40Doc44ItemInput[] = [{ docTypeCode: '04021', docTypeName: 'ИНВОЙС', docNumber: 'INV-1', docDate: '2026-10-14' }]
    expect(applyObligationToDoc44(items, { number: '15', date: '2026-10-21' }, [2, 0], 'ИНЫЕ')).toBe('added')
    expect(items[1]).toMatchObject({
      docTypeCode: '08999', docTypeName: 'ИНЫЕ', docNumber: '15', docDate: '2026-10-21', appliesToAll: false, goodsItemIndexes: '0,2', presentKindCode: '1',
    })
    const lone: Import40Doc44ItemInput[] = []
    applyObligationToDoc44(lone, { number: 'Б/Н', date: '2026-10-21' }, [], 'ИНЫЕ')
    expect(lone[0]).toMatchObject({ goodsItemIndexes: null, appliesToAll: false })
  })

  it('08999 — чужой документ (привязан к товару без D0122) — не трогать, обязательство отдельной строкой', () => {
    const letter = row({ docNumber: '7', docDate: '2026-10-01', goodsItemIndexes: '3' })
    const items = [letter]
    expect(applyObligationToDoc44(items, { number: '15', date: '2026-10-21' }, [1], 'ИНЫЕ')).toBe('added')
    expect(letter).toEqual(row({ docNumber: '7', docDate: '2026-10-01', goodsItemIndexes: '3' }))
    expect(items[1]).toMatchObject({ docNumber: '15', docDate: '2026-10-21', goodsItemIndexes: '1' })
  })

  it('08999 со своим номером у товара с D0122 или «на все товары» — спросить; ответ: заменить или добавить отдельную', () => {
    const own = row({ docNumber: '12', docDate: '2026-10-01', goodsItemIndexes: '1' })
    const items = [own]
    expect(applyObligationToDoc44(items, { number: '15', date: '2026-10-21' }, [1], 'ИНЫЕ')).toEqual({ ask: own })
    expect(own.docNumber).toBe('12') // без ответа ничего не меняется
    expect(applyObligationToDoc44(items, { number: '15', date: '2026-10-21' }, [1], 'ИНЫЕ', { choice: 'overwrite' })).toBe('updated')
    expect(own).toMatchObject({ docNumber: '15', docDate: '2026-10-21' })

    const all = row({ docNumber: '7', appliesToAll: true, goodsItemIndexes: null })
    const items2 = [all]
    expect(applyObligationToDoc44(items2, { number: '15', date: '2026-10-21' }, [], 'ИНЫЕ')).toEqual({ ask: all })
    expect(applyObligationToDoc44(items2, { number: '15', date: '2026-10-21' }, [], 'ИНЫЕ', { choice: 'add' })).toBe('added')
    expect(items2).toHaveLength(2)
    expect(all.docNumber).toBe('7')
  })

  it('номер обязательства, сформированного на странице (known), — обновить без вопроса', () => {
    const prev = row({ docNumber: '15', appliesToAll: true, goodsItemIndexes: null })
    const items = [row({ docNumber: '7', goodsItemIndexes: '0' }), prev]
    expect(applyObligationToDoc44(items, { number: '16', date: '2026-10-22' }, [], 'ИНЫЕ', { known: ['15'] })).toBe('updated')
    expect(prev).toMatchObject({ docNumber: '16', docDate: '2026-10-22' })
    expect(items[0].docNumber).toBe('7')
  })
})

describe('D0122 ↔ 08999', () => {
  const invoice: Import40Doc44ItemInput = { docTypeCode: '04021', docTypeName: 'ИНВОЙС', docNumber: 'INV-1', docDate: '2026-10-14' }

  it('товары с D0122 — по кодам гр. 33 через запятую (с пробелами и кириллицей, как в форме)', () => {
    expect(conditionalReleaseGoods([{ prohibitionCode: 'C1700, D0122' }, { prohibitionCode: 'D0121' }, { prohibitionCode: 'Д0122' }, { prohibitionCode: 'd01 22' }]))
      .toEqual([0, 3])
  })

  it('D0122 появился, строки нет — добавить: «Б/Н», дата гр. А, признак 1, ко всем товарам с D0122', () => {
    const items = [{ ...invoice }]
    expect(ensureObligationDoc44(items, { all: [0, 2], added: [2] }, 'ИНЫЕ', '2026-10-21')).toBe('added')
    expect(items[1]).toEqual({
      docTypeCode: '08999', docTypeName: 'ИНЫЕ', docNumber: 'Б/Н', docDate: '2026-10-21',
      goodsItemIndex: null, appliesToAll: false, goodsItemIndexes: '0,2',
      docStartDate: null, docValidityDate: null, issueCountryCode: null, presentKindCode: '1',
    })
  })

  it('строка есть — не дублируется и не перетирается: только дописать новые товары в привязку', () => {
    const own: Import40Doc44ItemInput = {
      docTypeCode: '08999', docTypeName: 'СВОЁ', docNumber: '15', docDate: '2026-10-20', appliesToAll: false, goodsItemIndexes: '1', presentKindCode: '3',
    }
    const items = [{ ...invoice }, own]
    expect(ensureObligationDoc44(items, { all: [0, 1, 2], added: [0, 2] }, 'ИНЫЕ', '2026-10-21')).toBe('bound')
    expect(items).toHaveLength(2)
    expect(own).toEqual({ ...own, docTypeName: 'СВОЁ', docNumber: '15', docDate: '2026-10-20', presentKindCode: '3', goodsItemIndexes: '0,1,2' })
    // Товар уже в привязке — ничего; строка «Б/Н» «на все товары» — не меняется.
    expect(ensureObligationDoc44(items, { all: [0, 1, 2], added: [1] }, 'ИНЫЕ', null)).toBeNull()
    const all: Import40Doc44ItemInput = { docTypeCode: '08999', docNumber: 'Б/Н', appliesToAll: true, goodsItemIndexes: null }
    expect(ensureObligationDoc44([all], { all: [0], added: [0] }, 'ИНЫЕ', null)).toBeNull()
    expect(all.goodsItemIndexes).toBeNull()
    // Старая одиночная привязка goodsItemIndex — переходит в CSV.
    const single: Import40Doc44ItemInput = { docTypeCode: '08999', goodsItemIndex: 1, goodsItemIndexes: null, appliesToAll: false }
    ensureObligationDoc44([single], { all: [0, 1], added: [0] }, 'ИНЫЕ', null)
    expect(single).toMatchObject({ goodsItemIndex: null, goodsItemIndexes: '0,1' })
    // Нового D0122 нет — ничего не делаем.
    expect(ensureObligationDoc44([], { all: [0], added: [] }, 'ИНЫЕ', null)).toBeNull()
  })

  it('чужая 08999 (привязана к товарам без D0122 или «на все товары» со своим номером) — не трогать, добавить обязательство', () => {
    const letter: Import40Doc44ItemInput = { docTypeCode: '08999', docNumber: '7', docDate: '2026-10-01', appliesToAll: false, goodsItemIndexes: '3' }
    const items = [{ ...invoice }, letter]
    expect(ensureObligationDoc44(items, { all: [1], added: [1] }, 'ИНЫЕ', '2026-10-21')).toBe('added')
    expect(letter).toEqual({ docTypeCode: '08999', docNumber: '7', docDate: '2026-10-01', appliesToAll: false, goodsItemIndexes: '3' })
    expect(items[2]).toMatchObject({ docNumber: 'Б/Н', goodsItemIndexes: '1' })

    const allLetter: Import40Doc44ItemInput = { docTypeCode: '08999', docNumber: '7', appliesToAll: true }
    const items2 = [allLetter]
    expect(ensureObligationDoc44(items2, { all: [0], added: [0] }, 'ИНЫЕ', null)).toBe('added')
    expect(items2).toHaveLength(2)
    // …но номер обязательства, сформированного на странице, — это оно: строку не дублировать.
    expect(ensureObligationDoc44([allLetter], { all: [0], added: [0] }, 'ИНЫЕ', null, ['7'])).toBeNull()
  })

  it('предупреждения в обе стороны; «нет обязательства» — по товару, с той же привязкой, что у сервера', () => {
    const row: Import40Doc44ItemInput = { docTypeCode: '08999', docNumber: 'Б/Н' }
    expect(obligationWarnings([{ prohibitionCode: 'D0122' }], [invoice])).toEqual([{ kind: 'noDoc', goodsIndex: 0 }])
    expect(obligationWarnings([{ prohibitionCode: 'C1700' }], [invoice, row])).toEqual([{ kind: 'noCode' }])
    expect(obligationWarnings([{ prohibitionCode: 'D0122' }], [row])).toEqual([])
    expect(obligationWarnings([{ prohibitionCode: null }], [invoice])).toEqual([])
    // Строка привязана только к товару 1 — у товара 2 (тоже D0122) обязательства нет.
    const goods = [{ prohibitionCode: 'D0122' }, { prohibitionCode: 'D0122' }, { prohibitionCode: null }]
    expect(obligationWarnings(goods, [{ ...row, goodsItemIndexes: '0' }])).toEqual([{ kind: 'noDoc', goodsIndex: 1 }])
    expect(obligationWarnings(goods, [{ ...row, goodsItemIndex: 1 }])).toEqual([{ kind: 'noDoc', goodsIndex: 0 }])
    expect(obligationWarnings(goods, [{ ...row, appliesToAll: true, goodsItemIndexes: '2' }])).toEqual([])
  })
})
