import { describe, expect, it } from 'vitest'
import type { ClassifierItem } from '@/types/api'
import { buildGoods, noteCount, noteDetails, packageKindByWord, type BuildCtx } from '../importBuild'
import type { ResolveResult } from '../importResolve'
import { emptyImportRow, type ImportRow } from '../importRows'

// Пакет импорта 21.10.2026: товар ДТ из строки импорта — одни правила для «Из Excel» и «Из документов».
const kind = (code: string, nameRu: string): ClassifierItem => ({ id: code, classifierCode: '2013', code, nameRu, sortOrder: 0, isActive: true })
const KINDS = [kind('CT', 'Коробка картонная'), kind('PK', 'Упаковка (package)'), kind('PL', 'Паллета'), kind('BG', 'Мешок')]

const row = (o: Partial<ImportRow> = {}): ImportRow => ({
  ...emptyImportRow('file.xlsx'), description: 'Сушилка для белья 18 м', tnvedCode: '7323990000', quantity: 470,
  grossWeightKg: 1198.5, netWeightKg: 1128, value: 1602.7, places: 47, ...o,
})
const resolved = (o: Record<string, { valid?: boolean; dei?: string | null; name?: string }> = {}, failed = false): ResolveResult => ({
  byCode: new Map(Object.entries(o).map(([code, v]) => [code, {
    code, valid: v.valid ?? true, name: v.name ?? 'НАЗВАНИЕ КОДА', dei: v.dei ? { code: v.dei, name: null, shortName: v.dei === '715' ? 'ПАР' : 'ШТ' } : null,
  }])),
  rejected: Object.entries(o).filter(([, v]) => v.valid === false).map(([code]) => ({ code, reason: 'notInDirectory' as const })),
  failed,
})
const ctx = (r: ResolveResult | null, options: BuildCtx['options'] = {}): BuildCtx => ({ currency: 'USD', packageKinds: KINDS, resolved: r, options })

describe('importBuild №1: количество — гр. 41 только при ДЕИ', () => {
  it('ДЕИ нет: гр. 41 пусто, количество и единица ОКЕИ файла — в строку гр. 31', () => {
    const { goods, quantityTo, notes } = buildGoods([row({ unitText: 'шт' })], ctx(resolved({ '7323990000': { dei: null } })))
    expect(goods[0]).toMatchObject({ quantity: null, unitCode: null, unit: null, tnvedDescription: 'НАЗВАНИЕ КОДА' })
    expect(goods[0].characteristics![0]).toMatchObject({ quantity: 470, unitCode: '796' })
    expect(quantityTo).toEqual([31])
    expect(noteCount(notes, 'toRow')).toBe(1)
    expect(noteCount(notes, 'noUnit')).toBe(0)
  })

  it('ДЕИ нет и единицы нет — количество в строку без единицы, заметка', () => {
    const { goods, notes } = buildGoods([row()], ctx(resolved({ '7323990000': { dei: null } })))
    expect(goods[0].characteristics![0]).toMatchObject({ quantity: 470, unitCode: null })
    expect(noteCount(notes, 'noUnit')).toBe(1)
  })

  it('ДЕИ есть и равна единице файла (или единицы нет) — гр. 41, строка следует за ней', () => {
    for (const unitText of ['шт', null]) {
      const { goods, quantityTo } = buildGoods([row({ unitText })], ctx(resolved({ '7323990000': { dei: '796' } })))
      expect(goods[0]).toMatchObject({ quantity: 470, unitCode: '796', unit: 'ШТ' })
      expect(goods[0].characteristics![0].quantity).toBeNull()
      expect(quantityTo).toEqual([41])
    }
  })

  it('ДЕИ ≠ единице файла (пара / шт) — гр. 41 пусто, количество в строку, заметка (В6)', () => {
    const { goods, notes } = buildGoods([row({ unitText: 'шт' })], ctx(resolved({ '7323990000': { dei: '715' } })))
    expect(goods[0].quantity).toBeNull()
    expect(goods[0].characteristics![0]).toMatchObject({ quantity: 470, unitCode: '796' })
    expect(noteDetails(notes, 'deiMismatch')).toEqual(['шт ≠ ПАР'])
  })

  it('проверка не удалась — код как есть, ДЕИ неизвестна → количество в строку; заметка «не проверены»', () => {
    const { goods, notes } = buildGoods([row({ unitText: 'pcs' })], ctx(resolved({}, true)))
    expect(goods[0]).toMatchObject({ tnvedCode: '7323990000', quantity: null, tnvedDescription: null })
    expect(goods[0].characteristics![0]).toMatchObject({ quantity: 470, unitCode: '796' })
    expect(notes.some((n) => n.kind === 'codesNotChecked')).toBe(true)
  })

  it('количество 0 / пусто — ничего не пишется', () => {
    const { goods, quantityTo } = buildGoods([row({ quantity: 0 })], ctx(resolved({ '7323990000': { dei: null } })))
    expect(goods[0].quantity).toBeNull()
    expect(goods[0].characteristics![0].quantity).toBeNull()
    expect(quantityTo).toEqual([null])
  })
})

describe('importBuild №9: код только действующий, не номер документа', () => {
  it('код не из справочника и номер документа — поле пустое, заметки; «перенести как есть» — опцией', () => {
    const r: ResolveResult = { ...resolved({ '7304399209': { valid: false } }), rejected: [
      { code: '7304399209', reason: 'notInDirectory' }, { code: '2026020201', reason: 'docNumber' },
    ] }
    const rows = [row({ tnvedCode: '7304399209' }), row({ tnvedCode: '2026020201' })]
    const { goods, notes } = buildGoods(rows, ctx(r))
    expect(goods.map((g) => g.tnvedCode)).toEqual([null, null])
    expect(noteDetails(notes, 'invalidCode')).toEqual(['7304399209:notInDirectory', '2026020201:docNumber'])
    expect(buildGoods(rows, ctx(r, { keepInvalidCodes: true })).goods.map((g) => g.tnvedCode)).toEqual(['7304399209', '2026020201'])
  })
})

describe('importBuild №2/5/16: строка гр. 31 всегда и со значениями', () => {
  it('поля строки заглавными, стоимость строки значением (В3), наименование — из «ХАРАКТЕРИСТИКА»', () => {
    const { goods } = buildGoods([row({
      rowName: 'для белья', manufacturerName: 'Yiwu Longju', tradeMarkName: 'urker', productMarkName: 'm', productModelName: 'x-1',
      productArticle: 'urs07', standardName: 'гост 1', productSortName: '1', serialNumbers: 's1',
    })], ctx(resolved({ '7323990000': { dei: null } })))
    expect(goods[0].characteristics).toEqual([{
      name: 'ДЛЯ БЕЛЬЯ', quantity: 470, unitCode: null, invoiceValue: 1602.7, manufacturerName: 'YIWU LONGJU', tradeMarkName: 'URKER',
      productMarkName: 'M', productModelName: 'X-1', productArticle: 'URS07', standardName: 'ГОСТ 1', productSortName: '1', serialNumbers: 'S1',
    }])
    expect(goods[0].description).toBe('СУШИЛКА ДЛЯ БЕЛЬЯ 18 М')
  })

  it('строка есть, даже если в файле ничего для неё нет; производитель = отправитель — только опцией (В9)', () => {
    const plain = buildGoods([row({ quantity: null, value: null })], ctx(resolved({ '7323990000': {} })))
    expect(plain.goods[0].characteristics).toHaveLength(1)
    expect(plain.goods[0].characteristics![0].manufacturerName).toBeNull()
    const withSender = buildGoods([row(), row({ manufacturerName: 'OWN' })], ctx(resolved({ '7323990000': {} }), { senderAsManufacturer: 'Yiwu Trading' }))
    expect(withSender.goods.map((g) => g.characteristics![0].manufacturerName)).toEqual(['YIWU TRADING', 'OWN'])
  })
})

describe('importBuild №3: упаковка', () => {
  it('нет столбца упаковки: «1 — С упаковкой» при местах, вид — по подсказке документа, упаковок = мест (В7)', () => {
    const { goods, notes } = buildGoods([row({ packagingHint: '件数 Cartons' })], ctx(resolved({ '7323990000': {} })))
    expect(goods[0]).toMatchObject({ packageAvailabilityCode: '1', packageKindCode: 'CT', packageQuantity: 47, packagesCount: 47, cargoPlacesQuantity: 47 })
    expect(noteCount(notes, 'packagingDefault')).toBe(1)
  })

  it('без подсказки вида — наличие по местам, вид и число упаковок не ставятся; нет мест — ничего', () => {
    const [g] = buildGoods([row()], ctx(resolved({ '7323990000': {} }))).goods
    expect(g).toMatchObject({ packageAvailabilityCode: '1', packageKindCode: null, packageQuantity: null })
    const [none] = buildGoods([row({ places: null })], ctx(resolved({ '7323990000': {} }))).goods
    expect(none).toMatchObject({ packageAvailabilityCode: null, packageKindCode: null })
  })

  it('столбец «Вид упаковки» — по классификатору; «PC» нет в классификаторе — не переносится, заметка', () => {
    const { goods, notes } = buildGoods([row({ packageKindText: 'PC', packageAvailabilityCode: '1' }), row({ packageKindText: 'картонные коробки' })], ctx(resolved({ '7323990000': {} })))
    expect(goods.map((g) => g.packageKindCode)).toEqual([null, 'CT'])
    expect(noteDetails(notes, 'unknownPackaging')).toEqual(['PC'])
  })

  it('слова → коды классификатора: коробка CT, мешок BG, поддон — по названию (PL «Паллета»)', () => {
    expect(packageKindByWord('ctns', KINDS)).toBe('CT')
    expect(packageKindByWord('Bags', KINDS)).toBe('BG')
    expect(packageKindByWord('Pallets', KINDS)).toBe('PL')
    expect(packageKindByWord('Pallets', [])).toBeNull()
  })

  it('места дробные — округление и заметка', () => {
    const { goods, notes } = buildGoods([row({ places: 46.6 })], ctx(resolved({ '7323990000': {} })))
    expect(goods[0].packagesCount).toBe(47)
    expect(noteDetails(notes, 'placesRounded')).toEqual(['46.6'])
  })
})

describe('importBuild №4: страна, прочее', () => {
  it('страна из строки; нераспознанная — заметкой; по умолчанию — только опцией (В8)', () => {
    const rows = [row({ countryCode: '156' }), row({ originText: 'Narnia' })]
    const { goods, notes } = buildGoods(rows, ctx(resolved({ '7323990000': {} })))
    expect(goods.map((g) => g.countryOfOrigin)).toEqual(['156', null])
    expect(noteDetails(notes, 'unknownCountry')).toEqual(['Narnia'])
    expect(buildGoods(rows, ctx(resolved({ '7323990000': {} }), { defaultOriginCode: '156' })).goods.map((g) => g.countryOfOrigin)).toEqual(['156', '156'])
  })

  it('иероглифы в описании, нетто > брутто — заметки; часть места и индивидуальные упаковки — в доп. сведения', () => {
    const { goods, notes } = buildGoods([row({ description: '黑色金属脚手架钢管', netWeightKg: 2000, cargoPartQuantity: 1, individualPackages: 47 })], ctx(resolved({ '7323990000': {} })))
    expect(noteCount(notes, 'han')).toBe(1)
    expect(noteCount(notes, 'netOverGross')).toBe(1)
    expect(goods[0].extras).toMatchObject({ cargoPartQuantity: 1, packages: [{ kind: '1', packageKindCode: null, quantity: 47 }] })
  })

  it('валюта — гр. 22, иначе строки файла; NTIN/GTIN без повторов', () => {
    const [g] = buildGoods([row({ currency: 'CNY', ntins: ['0200000000001', '0200000000001'], gtin: '4870000000001' })],
      { currency: '', packageKinds: KINDS, resolved: resolved({ '7323990000': {} }) }).goods
    expect(g).toMatchObject({ currency: 'CNY', ntins: ['0200000000001'], gtin: '4870000000001', payments: [] })
  })
})
