import { describe, expect, it } from 'vitest'
import { reactive } from 'vue'
import type { Import40GoodsItemInput } from '@/types/api'
import { emptyDtForm, type DtFormState } from '../../dtPayload'
import { blankCharacteristic } from '../editor/characteristics'
import { applyMerge, matchExisting, mergeImportDocs, planMerge } from '../importMerge'
import { emptyImportRow, type ImportDoc, type ImportRow } from '../importRows'
import { keyOf, newDtGoodsItem, useDtGoods } from '../useDtGoods'

// №15 / №10б (пакет импорта 21.10.2026): несколько файлов одной поставки и повторный импорт в ДТ с товарами.
const r = (o: Partial<ImportRow>): ImportRow => ({ ...emptyImportRow(o.source ?? 'x'), ...o })
const inv = (rows: Partial<ImportRow>[]): ImportDoc => ({ source: 'invoice.xlsx', kind: 'invoice', rows: rows.map((x) => r({ source: 'invoice.xlsx', ...x })) })
const pl = (rows: Partial<ImportRow>[]): ImportDoc => ({ source: 'packing.xlsx', kind: 'packing', rows: rows.map((x) => r({ source: 'packing.xlsx', ...x })) })

describe('mergeImportDocs: инвойс + упаковочный лист (UR0910, обезличено)', () => {
  it('стоимость из инвойса, нетто из упаковочного; две «КОРЗИНА» с одним кодом различаются артикулом; конфликт брутто', () => {
    const m = mergeImportDocs([
      pl([
        { tnvedCode: '3924900009', productArticle: '24001', description: 'КОРЗИНА', grossWeightKg: 719.1, netWeightKg: 667.4, places: 47 },
        { tnvedCode: '3924900009', productArticle: '24001-1', description: 'КОРЗИНА', grossWeightKg: 580, netWeightKg: 526.4, places: 47 },
      ]),
      inv([
        { tnvedCode: '3924900009', productArticle: '24001-1', description: 'КОРЗИНА', value: 1499.3, grossWeightKg: 578.1, places: 47 },
        { tnvedCode: '3924900009', productArticle: '24001', description: 'КОРЗИНА', value: 1499.3, grossWeightKg: 719.1, places: 47 },
      ]),
    ])
    // база — инвойс (порядок — как в нём)
    expect(m.rows.map((x) => [x.productArticle, x.value, x.netWeightKg, x.grossWeightKg])).toEqual([
      ['24001-1', 1499.3, 526.4, 578.1], ['24001', 1499.3, 667.4, 719.1],
    ])
    expect(m.conflicts).toEqual([{
      rowIndex: 0, field: 'grossWeightKg', chosen: 578.1,
      values: [{ value: 578.1, source: 'invoice.xlsx' }, { value: 580, source: 'packing.xlsx' }],
    }])
    expect(m.matchedBy.codeArticle).toBe(2)
    expect(m.onlyIn).toEqual([])
  })

  it('артикулы повторяются с разным наименованием («506», «JJ-17»): № строки первым ключом, без № — артикул + описание', () => {
    const invRows = [
      { lineNo: 1, tnvedCode: '3924900009', productArticle: 'JJ-17', description: 'Шторы для ванной 180*180', value: 100 },
      { lineNo: 2, tnvedCode: '3924900009', productArticle: 'JJ-17', description: 'Шторы для ванной 180*240', value: 200 },
      { lineNo: 3, tnvedCode: '7323990000', productArticle: '506', description: 'Ведро 10L', value: 300 },
      { lineNo: 4, tnvedCode: '7323990000', productArticle: '506', description: 'Ведро 14L', value: 400 },
    ]
    // PL в другом порядке — № строки сопоставляет как надо
    const plRows = [
      { lineNo: 2, tnvedCode: '3924900009', productArticle: 'JJ-17', description: 'Шторы для ванной 180*240', netWeightKg: 2 },
      { lineNo: 1, tnvedCode: '3924900009', productArticle: 'JJ-17', description: 'Шторы для ванной 180*180', netWeightKg: 1 },
      { lineNo: 4, tnvedCode: '7323990000', productArticle: '506', description: 'Ведро 14L', netWeightKg: 4 },
      { lineNo: 3, tnvedCode: '7323990000', productArticle: '506', description: 'Ведро 10L', netWeightKg: 3 },
    ]
    const byLine = mergeImportDocs([inv(invRows), pl(plRows)])
    expect(byLine.rows.map((x) => [x.value, x.netWeightKg])).toEqual([[100, 1], [200, 2], [300, 3], [400, 4]])
    expect(byLine.matchedBy.lineNo).toBe(4)

    // без № — код + артикул неоднозначен, артикул + описание однозначен
    const noLine = mergeImportDocs([inv(invRows.map((x) => ({ ...x, lineNo: null }))), pl(plRows.map((x) => ({ ...x, lineNo: null })))])
    expect(noLine.rows.map((x) => [x.value, x.netWeightKg])).toEqual([[100, 1], [200, 2], [300, 3], [400, 4]])
    expect(noLine.matchedBy.articleDescription).toBe(4)
  })

  it('№ строки не принимается, если противоречит коду/артикулу (нумерация разная) — дальше по ключам', () => {
    const m = mergeImportDocs([
      inv([{ lineNo: 1, tnvedCode: '1111111111', productArticle: 'A', value: 1 }, { lineNo: 2, tnvedCode: '2222222222', productArticle: 'B', value: 2 }]),
      pl([{ lineNo: 1, tnvedCode: '2222222222', productArticle: 'B', netWeightKg: 20 }, { lineNo: 2, tnvedCode: '1111111111', productArticle: 'A', netWeightKg: 10 }]),
    ])
    expect(m.rows.map((x) => [x.productArticle, x.netWeightKg])).toEqual([['A', 10], ['B', 20]])
  })

  it('упаковочный без кодов и артикулов — по описанию, затем по порядку; лишние строки — отдельными товарами', () => {
    const m = mergeImportDocs([
      inv([{ tnvedCode: '1', description: 'Болты', value: 1 }, { tnvedCode: '2', description: 'Гайки', value: 2 }]),
      pl([{ description: 'Гайки', netWeightKg: 20 }, { description: 'Болты', netWeightKg: 10 }, { description: 'Шайбы', netWeightKg: 5 }]),
    ])
    expect(m.rows.map((x) => [x.description, x.netWeightKg])).toEqual([['Болты', 10], ['Гайки', 20], ['Шайбы', 5]])
    expect(m.onlyIn).toEqual([{ source: 'packing.xlsx', n: 1 }])
    const byPos = mergeImportDocs([inv([{ tnvedCode: '1', value: 1 }, { tnvedCode: '2', value: 2 }]), pl([{ netWeightKg: 10 }, { netWeightKg: 20 }])])
    expect(byPos.rows.map((x) => x.netWeightKg)).toEqual([10, 20])
    expect(byPos.matchedBy.position).toBe(2)
  })
})

describe('mergeImportDocs: марка, знак, модель, ГОСТ, сорт, серийный — расхождение показывается (ревью 21.10)', () => {
  it('«ОТСУТСТВУЕТ» базы против «LONGJU» упаковочного — конфликт, взято значение базы; одинаковые — без конфликта', () => {
    const m = mergeImportDocs([
      inv([{ lineNo: 1, tnvedCode: '7323990000', productArticle: 'URS07', value: 1602.7, tradeMarkName: 'ОТСУТСТВУЕТ', productModelName: 'X-1', standardName: 'ГОСТ 1' }]),
      pl([{ lineNo: 1, tnvedCode: '7323990000', productArticle: 'URS07', netWeightKg: 1128, tradeMarkName: 'LONGJU', productModelName: 'x-1', serialNumbers: 'SN1' }]),
    ])
    expect(m.rows[0]).toMatchObject({ tradeMarkName: 'ОТСУТСТВУЕТ', productModelName: 'X-1', standardName: 'ГОСТ 1', serialNumbers: 'SN1', netWeightKg: 1128 })
    expect(m.conflicts).toEqual([{
      rowIndex: 0, field: 'tradeMarkName', chosen: 'ОТСУТСТВУЕТ',
      values: [{ value: 'ОТСУТСТВУЕТ', source: 'invoice.xlsx' }, { value: 'LONGJU', source: 'packing.xlsx' }],
    }])
  })
})

// Ревью 22.10: «Марка ↵ Brand» фронт читал маркой, Zircon AI — товарным знаком; «Из документов» сливает строки Zircon AI и
// Excel того же файла и писало LONGJU в обе графы (гр. 31 и XML КЕДЕН). Предохранитель — одно значение в одну графу, но
// только при слиянии разных разборов (markTwinGuard): документы одного разбора Excel читают столбцы одним правилом, и
// «Товарный знак» одного файла с «Маркой» другого — два столбца, переносятся оба (решение владельца 21.10, ревью 22.10).
describe('mergeImportDocs: одно значение — не в обе графы «марка» и «товарный знак» (ревью 22.10)', () => {
  const zircon = (rows: Partial<ImportRow>[]): ImportDoc => ({ source: 'Zircon AI', kind: 'invoice', rows: rows.map((x) => r({ source: 'Zircon AI', ...x })) })
  const base = { tnvedCode: '7323990000', productArticle: 'URS07', description: 'СУШИЛКА' }
  const guard = { markTwinGuard: true }

  it('Zircon AI — товарный знак, Excel того же файла — марка: остаётся графа базы, конфликт «кто как прочитал»', () => {
    const m = mergeImportDocs([zircon([{ ...base, value: 1602.7, tradeMarkName: 'LONGJU' }]), inv([{ ...base, netWeightKg: 1128, productMarkName: 'longju' }])], guard)
    expect(m.rows[0]).toMatchObject({ tradeMarkName: 'LONGJU', productMarkName: null, netWeightKg: 1128 })
    expect(m.conflicts).toEqual([{
      rowIndex: 0, field: 'tradeMarkName', crossField: 'productMarkName', chosen: 'LONGJU',
      values: [
        { value: 'LONGJU', source: 'Zircon AI', field: 'tradeMarkName' },
        { value: 'longju', source: 'invoice.xlsx', field: 'productMarkName' },
      ],
    }])
  })

  it('и наоборот: Zircon AI — марка, файлы Excel — товарный знак: один конфликт; одни файлы Excel — обе графы', () => {
    const excel = [
      pl([{ ...base, netWeightKg: 2, tradeMarkName: 'ОТСУТСТВУЕТ' }]),
      { source: 'other.xlsx', kind: null, rows: [r({ ...base, source: 'other.xlsx', grossWeightKg: 3, tradeMarkName: 'ОТСУТСТВУЕТ' })] },
    ]
    const m = mergeImportDocs([zircon([{ ...base, value: 1, productMarkName: 'ОТСУТСТВУЕТ' }]), ...excel], guard)
    expect(m.rows[0]).toMatchObject({ productMarkName: 'ОТСУТСТВУЕТ', tradeMarkName: null, netWeightKg: 2, grossWeightKg: 3 })
    expect(m.conflicts).toEqual([{
      rowIndex: 0, field: 'productMarkName', crossField: 'tradeMarkName', chosen: 'ОТСУТСТВУЕТ',
      values: [
        { value: 'ОТСУТСТВУЕТ', source: 'Zircon AI', field: 'productMarkName' },
        { value: 'ОТСУТСТВУЕТ', source: 'packing.xlsx', field: 'tradeMarkName' },
        { value: 'ОТСУТСТВУЕТ', source: 'other.xlsx', field: 'tradeMarkName' },
      ],
    }])

    // «Из Excel»: «Марка» инвойса и «Товарный знак» упаковочного — два столбца одного правила, «ОТСУТСТВУЕТ» в обе графы
    const onlyExcel = mergeImportDocs([inv([{ ...base, value: 1, productMarkName: 'ОТСУТСТВУЕТ' }]), ...excel])
    expect(onlyExcel.rows[0]).toMatchObject({ productMarkName: 'ОТСУТСТВУЕТ', tradeMarkName: 'ОТСУТСТВУЕТ', netWeightKg: 2, grossWeightKg: 3 })
    expect(onlyExcel.conflicts).toEqual([])
  })

  it('одни файлы Excel: «Товарный знак» инвойса и «Марка» упаковочного с одним значением — обе графы, без расхождений', () => {
    const m = mergeImportDocs([inv([{ ...base, value: 1602.7, tradeMarkName: 'LONGJU' }]), pl([{ ...base, netWeightKg: 1128, productMarkName: 'LONGJU' }])])
    expect(m.rows[0]).toMatchObject({ tradeMarkName: 'LONGJU', productMarkName: 'LONGJU', value: 1602.7, netWeightKg: 1128 })
    expect(m.conflicts).toEqual([])
  })

  it('форма шаблона декларанта (МАРКА и ТОВАРНЫЙ ЗНАК — «ОТСУТСТВУЕТ») + инвойс + упаковочный — «ОТСУТСТВУЕТ» в обеих графах', () => {
    const template: ImportDoc = {
      source: 'hozka-template.xlsx', kind: null,
      rows: [r({ ...base, source: 'hozka-template.xlsx', value: 1602.7, productMarkName: 'ОТСУТСТВУЕТ', tradeMarkName: 'ОТСУТСТВУЕТ', productModelName: 'ОТСУТСТВУЕТ' })],
    }
    const m = mergeImportDocs([template, inv([{ ...base, value: 1602.7, tradeMarkName: 'ОТСУТСТВУЕТ' }]), pl([{ ...base, netWeightKg: 1128, productMarkName: 'ОТСУТСТВУЕТ' }])])
    expect(m.rows).toHaveLength(1)
    expect(m.rows[0]).toMatchObject({ productMarkName: 'ОТСУТСТВУЕТ', tradeMarkName: 'ОТСУТСТВУЕТ', productModelName: 'ОТСУТСТВУЕТ', netWeightKg: 1128 })
    expect(m.conflicts).toEqual([])
  })

  it('документ с обеими графами (два столбца) — его данные; разные значения в графах — дозаполняются как раньше', () => {
    const both = mergeImportDocs([zircon([{ ...base, value: 1, tradeMarkName: 'LONGJU' }]), pl([{ ...base, productMarkName: 'LONGJU', tradeMarkName: 'LONGJU' }])], guard)
    expect(both.rows[0]).toMatchObject({ tradeMarkName: 'LONGJU', productMarkName: 'LONGJU' })
    expect(both.conflicts).toEqual([])
    const one = mergeImportDocs([zircon([{ ...base, value: 1, productMarkName: 'LONGJU', tradeMarkName: 'LONGJU' }])], guard)
    expect(one.rows[0]).toMatchObject({ tradeMarkName: 'LONGJU', productMarkName: 'LONGJU' })
    expect(one.conflicts).toEqual([])
    const other = mergeImportDocs([zircon([{ ...base, value: 1, tradeMarkName: 'LONGJU' }]), pl([{ ...base, productMarkName: 'ОТСУТСТВУЕТ' }])], guard)
    expect(other.rows[0]).toMatchObject({ tradeMarkName: 'LONGJU', productMarkName: 'ОТСУТСТВУЕТ' })
    expect(other.conflicts).toEqual([])
  })
})

const goods = (o: Partial<Import40GoodsItemInput>): Import40GoodsItemInput => ({ ...newDtGoodsItem('USD'), ...o })
const withArticle = (article: string, o: Partial<Import40GoodsItemInput> = {}) =>
  goods({ ...o, characteristics: [{ ...blankCharacteristic(), productArticle: article }] })

describe('matchExisting / planMerge / applyMerge: повторный импорт в ДТ с товарами', () => {
  it('порядок ключей; неоднозначное совпадение — новый товар', () => {
    const existing = [withArticle('A', { tnvedCode: '1' }), goods({ tnvedCode: '2', description: 'ГАЙКИ' }), goods({ description: 'X' }), goods({ description: 'X' })]
    const incoming = [withArticle('A', { tnvedCode: '1' }), goods({ tnvedCode: '2', description: 'гайки' }), goods({ description: 'X' })]
    expect(matchExisting(existing, incoming).map((m) => [m.existing, m.by])).toEqual([[0, 'codeArticle'], [1, 'codeDescription'], [null, null]])
  })

  const setup = (items: Import40GoodsItemInput[]) => {
    const form = reactive({ ...emptyDtForm(), goodsItems: items, doc44Items: [] }) as DtFormState
    return { form, model: useDtGoods(form, { readiness: () => null, canEdit: () => true }) }
  }

  it('«Дополнить»: только пустые поля, «Пересчитать» у полей платежей; строка гр. 31 — дозаполняется; несопоставленные — новыми', () => {
    const { form, model } = setup([withArticle('URS07', { tnvedCode: '7323990000', grossWeightKg: 1000, needsTpinRecalc: false })])
    const incoming = [
      withArticle('URS07', { tnvedCode: '7323990000', grossWeightKg: 1198.5, netWeightKg: 1128, customsValue: 1602.7 }),
      goods({ tnvedCode: '9403208009', description: 'ПОЛКА' }),
    ]
    incoming[0].characteristics![0].manufacturerName = 'YIWU'
    const plan = planMerge(form.goodsItems, incoming, 'fill')
    expect(plan).toMatchObject({ updated: 1, added: 1 })
    expect(plan.conflicts).toEqual([{ incoming: 0, existing: 0, field: 'grossWeightKg', dtValue: 1000, fileValue: 1198.5 }])
    const res = applyMerge(model, incoming, plan, 'fill')
    expect(res).toMatchObject({ updated: 1, added: 1, targetIndex: [0, 1] })
    expect(form.goodsItems[0]).toMatchObject({ grossWeightKg: 1000, netWeightKg: 1128, customsValue: 1602.7, needsTpinRecalc: true })
    expect(form.goodsItems[0].characteristics![0]).toMatchObject({ productArticle: 'URS07', manufacturerName: 'YIWU' })
    expect(form.goodsItems[1].description).toBe('ПОЛКА')
  })

  it('«Дополнить» при другом коде в ДТ: описание ТН ВЭД и гр. 41 кода файла не переносятся, количество — в строку гр. 31', () => {
    // ДТ: 7323990000 без ДЕИ; файл (тот же артикул): 8516797000 с ДЕИ 796, 470 ШТ в гр. 41
    const { form, model } = setup([withArticle('URS07', { tnvedCode: '7323990000', tnvedDescription: null })])
    const incoming = [withArticle('URS07', {
      tnvedCode: '8516797000', tnvedDescription: 'ПРОЧИЕ ЭЛЕКТРОНАГРЕВАТЕЛЬНЫЕ ПРИБОРЫ', quantity: 470, unitCode: '796', unit: 'ШТ', netWeightKg: 1128,
    })]
    const plan = planMerge(form.goodsItems, incoming, 'fill')
    expect(plan.matches[0]).toMatchObject({ existing: 0, by: 'article' })
    expect(plan.conflicts.map((c) => c.field)).toEqual(['tnvedCode'])
    applyMerge(model, incoming, plan, 'fill')
    const g = form.goodsItems[0]
    expect(g).toMatchObject({ tnvedCode: '7323990000', tnvedDescription: null, quantity: null, unitCode: null, netWeightKg: 1128 })
    expect(g.characteristics![0]).toMatchObject({ productArticle: 'URS07', quantity: 470, unitCode: '796' })

    // тот же код — гр. 41 и описание ТН ВЭД переносятся, как раньше
    const same = setup([withArticle('URS07', { tnvedCode: '8516797000' })])
    applyMerge(same.model, incoming, planMerge(same.form.goodsItems, incoming, 'fill'), 'fill')
    expect(same.form.goodsItems[0]).toMatchObject({ tnvedDescription: 'ПРОЧИЕ ЭЛЕКТРОНАГРЕВАТЕЛЬНЫЕ ПРИБОРЫ', quantity: 470, unitCode: '796', unit: 'ШТ' })
    expect(same.form.goodsItems[0].characteristics![0].quantity ?? null).toBeNull()
  })

  it('«Заменить»: значения файла поверх, пустое в файле не стирает; «Добавить» — все новыми', () => {
    const { form, model } = setup([withArticle('A', { tnvedCode: '1', grossWeightKg: 1, netWeightKg: 0.5 })])
    const incoming = [withArticle('A', { tnvedCode: '1', grossWeightKg: 2, netWeightKg: null })]
    applyMerge(model, incoming, planMerge(form.goodsItems, incoming, 'replace'), 'replace')
    expect(form.goodsItems[0]).toMatchObject({ grossWeightKg: 2, netWeightKg: 0.5 })
    applyMerge(model, incoming, planMerge(form.goodsItems, incoming, 'append'), 'append')
    expect(form.goodsItems).toHaveLength(2)
  })

  it('товар с 2+ строками гр. 31: пишется строка с тем же артикулом; нет такой — строки не трогаются', () => {
    const two = goods({ tnvedCode: '1', description: 'D', characteristics: [
      { ...blankCharacteristic(), productArticle: 'A1' }, { ...blankCharacteristic(), productArticle: 'A2' },
    ] })
    const { form, model } = setup([two])
    const inc = [goods({ tnvedCode: '1', description: 'D', characteristics: [{ ...blankCharacteristic(), productArticle: 'A2', manufacturerName: 'M' }] })]
    applyMerge(model, inc, planMerge(form.goodsItems, inc, 'fill'), 'fill')
    expect(form.goodsItems[0].characteristics!.map((x) => x.manufacturerName)).toEqual([null, 'M'])
    const other = [goods({ tnvedCode: '1', description: 'D', characteristics: [{ ...blankCharacteristic(), productArticle: 'Z', manufacturerName: 'Q' }] })]
    expect(applyMerge(model, other, planMerge(form.goodsItems, other, 'fill'), 'fill').rowsSkipped).toBe(1)
  })

  it('«Отменить» (снимок): поля возвращаются в ТЕХ ЖЕ объектах (ключи, КИЗ по toRaw), новые товары и гр. 44 — как были', () => {
    const { form, model } = setup([withArticle('A', { tnvedCode: '1', grossWeightKg: null })])
    form.doc44Items.push({ docTypeCode: '04021', docNumber: 'UR1', appliesToAll: false, goodsItemIndexes: '0' } as never)
    const obj = form.goodsItems[0]
    const row = obj.characteristics![0]
    const key = keyOf(obj)
    const snap = model.snapshot()
    const inc = [withArticle('A', { tnvedCode: '1', grossWeightKg: 5, extras: { traceable: false, exciseStamps: [], vehicles: [], cargoPartQuantity: 1 } }), goods({ description: 'NEW' })]
    inc[0].characteristics![0].manufacturerName = 'M'
    applyMerge(model, inc, planMerge(form.goodsItems, inc, 'fill'), 'fill')
    model.appendDocs([{ docTypeCode: '04021', docNumber: 'UR1', appliesToAll: false, goodsItemIndexes: '1' } as never])
    expect(form.goodsItems).toHaveLength(2)
    expect(form.doc44Items[0].goodsItemIndexes).toBe('0,1')

    model.restore(snap)
    expect(form.goodsItems).toHaveLength(1)
    expect(form.goodsItems[0]).toBe(obj)
    expect(keyOf(form.goodsItems[0])).toBe(key)
    expect(form.goodsItems[0].grossWeightKg).toBeNull()
    expect(form.goodsItems[0].extras).toBeNull()
    expect(form.goodsItems[0].characteristics![0]).toBe(row)
    expect(row.manufacturerName).toBeNull()
    expect(form.doc44Items.map((d) => d.goodsItemIndexes)).toEqual(['0'])
  })
})

describe('matchExisting: «по порядку» (ревью 29.10, M9)', () => {
  const g = (o: Partial<Import40GoodsItemInput>): Import40GoodsItemInput => ({ ...newDtGoodsItem('USD'), ...o })
  it('«Из Excel» — по порядку при равном числе и непротиворечивых кодах, даже с другим артикулом; «Из документов» — без него', () => {
    const existing = [g({ description: 'СТУЛ', characteristics: [{ ...blankCharacteristic(), productArticle: 'A-1' }] })]
    const incoming = [g({ description: 'CHAIR', characteristics: [{ ...blankCharacteristic(), productArticle: 'A-01' }] })]
    expect(matchExisting(existing, incoming)).toEqual([{ incoming: 0, existing: 0, by: 'position' }])
    expect(matchExisting(existing, incoming, { positional: false })).toEqual([{ incoming: 0, existing: null, by: null }])
  })
})
