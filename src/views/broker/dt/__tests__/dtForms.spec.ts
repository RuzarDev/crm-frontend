import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { Import40Doc44ItemInput, Import40GoodsItemInput } from '@/types/api'
import { ensureOkeiUnits } from '../goods/editor/okei'
import {
  dtFormFileName, loadNotice130Choice, notice130Forms, notice130GoodsKeys, notice130Missing, pickRows, saveNotice130Choice,
  singleItemOverOne, upsertNotice130Doc44,
} from '../dtForms'

// Окно «Уведомление (Решение 130)» (23.10.2026): строки таблицы, формы по подпунктам, строки гр. 44 01416, имя файла.
vi.mock('@/api/references', () => ({
  referencesApi: { listOkeiUnits: vi.fn(async () => [{ id: '1', code: '796', name: 'Штука', shortName: 'ШТ', isActive: true }]) },
}))
beforeAll(async () => { await ensureOkeiUnits() }) // краткие наименования ОКЕИ: 796 → ШТ

const goods = (o: Partial<Import40GoodsItemInput>): Import40GoodsItemInput =>
  ({ description: null, tnvedCode: null, countryOfOrigin: null, quantity: null, unitCode: null, netWeightKg: null, customsValue: null, characteristics: [], ...o }) as Import40GoodsItemInput

describe('pickRows', () => {
  it('№ по позиции, код, страна буквами, описание гр. 31 без «1.» и упаковки, количество гр. 41 с единицей', () => {
    const rows = pickRows([
      goods({ description: 'Кушетка', tnvedCode: '9402900000', countryOfOrigin: '156', quantity: 45, unitCode: '796', netWeightKg: 120.5, customsValue: 2270.25, packageKindCode: 'BX', packagesCount: 3 }),
      goods({ description: 'Стол' }),
    ], (c) => (c === '156' ? 'CN' : null))
    expect(rows[0]).toMatchObject({ index: 0, tnvedCode: '9402900000', country: 'CN', quantity: '45 ШТ', quantityValue: 45, netWeightKg: 120.5, invoiceValue: 2270.25 })
    expect(rows[0].description.startsWith('КУШЕТКА')).toBe(true)
    expect(rows[0].description).not.toContain('BX')
    expect(rows[1]).toMatchObject({ index: 1, tnvedCode: null, country: null, description: 'СТОЛ', quantity: null })
  })
})

describe('notice130Forms', () => {
  it('одна форма на подпункт, по алфавиту, без буквы — последней; номер с «-1», «-2», если форм больше одной', () => {
    const forms = notice130Forms([0, 1, 2, 3], { 0: 'к', 1: 'а', 3: 'к' }, ' У-7 ')
    expect(forms).toEqual([
      { subitem: 'а', number: 'У-7-1', indexes: [1] },
      { subitem: 'к', number: 'У-7-2', indexes: [0, 3] },
      { subitem: null, number: 'У-7-3', indexes: [2] },
    ])
    expect(notice130Forms([0, 1], { 0: 'л', 1: 'л' }, 'У-7')).toEqual([{ subitem: 'л', number: 'У-7', indexes: [0, 1] }])
    expect(notice130Forms([0, 1], { 0: 'а', 1: 'б' }, '').map((f) => f.number)).toEqual([null, null])
  })

  it('незаполненное: должность, Ф.И.О., подпункт у отмеченного', () => {
    expect(notice130Missing(' ', '', [0], {})).toEqual(['position', 'name', 'subitem'])
    expect(notice130Missing('Директор', 'ИВАНОВ И.И.', [0], { 0: 'а', 1: null })).toEqual([])
  })

  it('«л» и количество больше 1 — номера товаров с 1 (только отмеченные)', () => {
    const rows = pickRows([goods({ quantity: 2 }), goods({ quantity: 1 }), goods({ quantity: 5 })])
    expect(singleItemOverOne(rows, [0, 1], { 0: 'л', 1: 'л', 2: 'л' })).toEqual([1])
  })
})

describe('upsertNotice130Doc44', () => {
  const doc = (o: Partial<Import40Doc44ItemInput>): Import40Doc44ItemInput => ({ docTypeCode: '04021', docTypeName: 'ИНВОЙС', docNumber: 'INV-1', docDate: '2026-10-01', ...o })

  it('новая строка 01416: номер и дата уведомления, товары — отмеченные (все — «на все товары»), признак «0»', () => {
    const items = [doc({})]
    const res = upsertNotice130Doc44(items, [{ number: 'У-1', date: '2026-10-23', indexes: [2, 0] }], 'УВЕДОМЛЕНИЕ', 3)
    expect(res).toEqual({ added: 1, updated: 0 })
    expect(items[1]).toMatchObject({
      docTypeCode: '01416', docTypeName: 'УВЕДОМЛЕНИЕ', docNumber: 'У-1', docDate: '2026-10-23',
      appliesToAll: false, goodsItemIndexes: '0,2', presentKindCode: '0',
    })
    upsertNotice130Doc44(items, [{ number: null, date: '2026-10-23', indexes: [0, 1, 2] }], 'УВЕДОМЛЕНИЕ', 3)
    expect(items[2]).toMatchObject({ docNumber: null, appliesToAll: true, goodsItemIndexes: null })
  })

  it('строка 01416 с тем же номером (без учёта регистра) — обновляется, не дублируется; по строке на каждую форму', () => {
    const items = [doc({ docTypeCode: '01416', docTypeName: 'СВОЁ', docNumber: 'у-1-1', docDate: '2026-10-01', goodsItemIndexes: '0', presentKindCode: '1' })]
    const res = upsertNotice130Doc44(items, [
      { number: 'У-1-1', date: '2026-10-23', indexes: [1] },
      { number: 'У-1-2', date: '2026-10-23', indexes: [0] },
    ], 'УВЕДОМЛЕНИЕ', 3)
    expect(res).toEqual({ added: 1, updated: 1 })
    expect(items).toHaveLength(2)
    // Своё название и признак представления не перетираются.
    expect(items[0]).toMatchObject({ docTypeName: 'СВОЁ', docNumber: 'у-1-1', docDate: '2026-10-23', goodsItemIndexes: '1', presentKindCode: '1' })
    expect(items[1]).toMatchObject({ docNumber: 'У-1-2', goodsItemIndexes: '0' })
  })

  it('повторно с другим числом форм или с номером вместо пустого — строки той же серии / без номера, без дублей', () => {
    const n = (o: Partial<Import40Doc44ItemInput>) => doc({ docTypeCode: '01416', docTypeName: 'УВЕДОМЛЕНИЕ', presentKindCode: '0', ...o })
    // Была одна форма «5» — стало две «5-1», «5-2»: «5» становится «5-1», «5-2» добавляется.
    const items = [n({ docNumber: '5', goodsItemIndexes: '0,1' }), n({ docNumber: '7', goodsItemIndexes: '2' })]
    expect(upsertNotice130Doc44(items, [
      { number: '5-1', date: '2026-10-23', indexes: [0] },
      { number: '5-2', date: '2026-10-23', indexes: [1] },
    ], 'УВЕДОМЛЕНИЕ', 3)).toEqual({ added: 1, updated: 1 })
    expect(items.map((d) => [d.docNumber, d.goodsItemIndexes])).toEqual([['5-1', '0'], ['7', '2'], ['5-2', '1']])
    // Было без номера — стало «15»: та же строка получает номер.
    const draft = [n({ docNumber: null, goodsItemIndexes: '0' })]
    expect(upsertNotice130Doc44(draft, [{ number: '15', date: '2026-10-23', indexes: [0, 1] }], 'УВЕДОМЛЕНИЕ', 3)).toEqual({ added: 0, updated: 1 })
    expect(draft).toHaveLength(1)
    expect(draft[0]).toMatchObject({ docNumber: '15', goodsItemIndexes: '0,1' })
    // Номер другой серии («51» — не «5» и не «5-k») не берётся.
    const other = [n({ docNumber: '51' })]
    expect(upsertNotice130Doc44(other, [{ number: '5', date: '2026-10-23', indexes: [0] }], 'УВЕДОМЛЕНИЕ', 3)).toEqual({ added: 1, updated: 0 })
    expect(other[0].docNumber).toBe('51')
  })
})

describe('выбор в окне уведомления (localStorage)', () => {
  const keysOf = (...g: [string, string][]) => notice130GoodsKeys(g.map(([tnvedCode, description]) => ({ tnvedCode, description })))
  const was = keysOf(['9402900000', 'Кушетка'], ['9403200000', 'Стол'], ['9405110000', 'Лампа'])

  it('тот же состав — выбор и буквы восстанавливаются', () => {
    localStorage.clear()
    saveNotice130Choice('d1', was, [0, 2], { 0: 'а', 2: 'л' })
    expect(loadNotice130Choice('d1', was)).toEqual({ selected: [0, 2], letters: { 0: 'а', 2: 'л' } })
    expect(loadNotice130Choice('d2', was)).toBeNull()
  })

  it('товары переставили или заменили — на чужой товар выбор и буква не переезжают', () => {
    localStorage.clear()
    saveNotice130Choice('d1', was, [0, 2], { 0: 'а', 2: 'л' })
    // Лампа и стол поменялись местами: кушетка на месте, на позиции 2 теперь стол.
    expect(loadNotice130Choice('d1', keysOf(['9402900000', 'Кушетка'], ['9405110000', 'Лампа'], ['9403200000', 'Стол'])))
      .toEqual({ selected: [0], letters: { 0: 'а' } })
    // Ни один товар не на своём месте — как без сохранённого выбора.
    expect(loadNotice130Choice('d1', keysOf(['9403200000', 'Стол'], ['9402900000', 'Кушетка']))).toBeNull()
    // Старый формат (только число товаров) — не используется.
    localStorage.setItem('zircon.dt.notice130.d3', JSON.stringify({ count: 3, selected: [0], letters: { 0: 'а' } }))
    expect(loadNotice130Choice('d3', was)).toBeNull()
  })
})

describe('dtFormFileName', () => {
  it('без запрещённых знаков и кавычек, пробелы — «_», дата ДД.ММ.ГГГГ', () => {
    expect(dtFormFileName('Уведомление_130', 'ТОО «ТЕСТ» / "Филиал"', '2026-10-23')).toBe('Уведомление_130_ТОО_ТЕСТ_Филиал_23.10.2026.docx')
    expect(dtFormFileName('Обязательство', null, '2026-10-23')).toBe('Обязательство_23.10.2026.docx')
  })
})
