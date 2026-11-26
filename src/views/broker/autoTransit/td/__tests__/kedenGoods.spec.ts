import { describe, expect, it } from 'vitest'
import { good } from '@/views/broker/transit/record/__tests__/recordFixture'
import { KEDEN_GOODS_COLUMNS, KEDEN_GOODS_HEADER, kedenGoodsCheck, kedenGoodsFileName, kedenGoodsRows, kedenGoodsTsv, kedenGoodsXlsx, type KedenGoodsSource } from '../kedenGoods'

const full = (o: Partial<Parameters<typeof good>[0]> = {}) => good({
  tnvedCode: '0101210000', description: 'Лошади', countryOfOrigin: 'DE', quantity: 2, unitCode: '796', grossWeightKg: 0.125, netWeightKg: 0.1,
  packagesCount: 3, customsValue: 1234.5, currency: 'USD', ...o,
})
const src = (goods = [full()], o: Partial<KedenGoodsSource> = {}): KedenGoodsSource => ({ goods, packages: [], containers: [], ...o })

describe('kedenGoodsRows', () => {
  it('подписи столбцов в заданном порядке (для «Схемы» и окна), нет «Кода доп. ед.»', () => {
    expect(kedenGoodsRows(src()).header).toEqual([
      'Код ТН ВЭД', 'Описание товара', 'Страна происхождения', 'Стоимость', 'Валюта', 'Масса брутто, кг', 'Масса нетто, кг',
      'Количество в доп. ед.', 'Вид информации об упаковке (всегда 0)', 'Количество грузовых мест', 'Наличие упаковки (1/0)', 'Вид упаковки',
      'Количество упаковок', 'Описание грузового места', 'Номер контейнера',
    ])
    expect(KEDEN_GOODS_HEADER).toHaveLength(15)
    expect(KEDEN_GOODS_HEADER.join()).not.toContain('Код доп. ед.')
    expect(KEDEN_GOODS_COLUMNS[1]!.kedenType).toBe('*Коммерческое описание товара')
  })

  it('числа без округления, места → наличие упаковки и количество упаковок', () => {
    const [row] = kedenGoodsRows(src()).rows
    expect(row).toEqual(['0101210000', 'Лошади', 'DE', '1234.5', 'USD', '0.125', '0.1', '2', '0', '3', '1', '', '3', '', ''])
  })

  it('нет мест — упаковки 0, пустые ячейки; код — только цифры', () => {
    const [row] = kedenGoodsRows(src([full({ packagesCount: null, tnvedCode: '0101 21.0000', netWeightKg: null })])).rows
    expect(row![0]).toBe('0101210000')
    expect(row!.slice(6)).toEqual(['', '2', '0', '', '0', '', '', '', ''])
  })

  it('вид упаковки, описание места и контейнер — когда они одни на партию; разные — пусто', () => {
    const one = kedenGoodsRows(src([full()], {
      packages: [{ packagingInfoKindCode: null, packageTypeCode: 'PK', packageCount: 3, description: 'Коробки' }],
      containers: [{ containerNumber: 'DRYU9953726', note: null }],
    })).rows[0]!
    expect(one.slice(11)).toEqual(['PK', '3', 'Коробки', 'DRYU9953726'])
    const many = kedenGoodsRows(src([full()], {
      packages: [
        { packagingInfoKindCode: null, packageTypeCode: 'PK', packageCount: 1, description: null },
        { packagingInfoKindCode: null, packageTypeCode: 'NE', packageCount: 2, description: null },
      ],
      containers: [{ containerNumber: 'A', note: null }, { containerNumber: 'B', note: null }],
    })).rows[0]!
    expect(many.slice(11)).toEqual(['', '3', '', ''])
  })
})

describe('kedenGoodsTsv', () => {
  it('табуляции и переводы строк внутри значений заменяются пробелом', () => {
    const tsv = kedenGoodsTsv(kedenGoodsRows(src([full({ description: 'А\tБ\nВ' })])))
    const lines = tsv.split('\n')
    expect(lines).toHaveLength(1)
    expect(tsv).not.toContain('Код ТН ВЭД')
    const cells = lines[0]!.split('\t')
    expect(cells).toHaveLength(15)
    expect(cells[1]).toBe('А Б В')
  })
})

describe('kedenGoodsXlsx', () => {
  it('все ячейки текстом: код с нулём остаётся строкой, числа без округления', async () => {
    const blob = await kedenGoodsXlsx(kedenGoodsRows(src()))
    const XLSX = await import('xlsx')
    const wb = XLSX.read(new Uint8Array(await new Promise<ArrayBuffer>((res) => { const r = new FileReader(); r.onload = () => res(r.result as ArrayBuffer); r.readAsArrayBuffer(blob) })), { type: 'array' })
    const ws = wb.Sheets[wb.SheetNames[0]!]!
    expect(wb.SheetNames).toEqual(['Товары', 'Схема'])
    expect(ws.A1).toMatchObject({ t: 's', v: '0101210000' })
    expect(ws.D1).toMatchObject({ t: 's', v: '1234.5' })
    expect(ws.F1).toMatchObject({ t: 's', v: '0.125' })
    expect(ws.I1).toMatchObject({ t: 's', v: '0' })
    expect(ws.A2).toBeUndefined()
    const sch = wb.Sheets['Схема']!
    expect(sch.A1).toMatchObject({ v: '№ столбца' })
    expect(sch.C3).toMatchObject({ v: '*Коммерческое описание товара' })
    expect(sch.C16).toMatchObject({ v: 'Контейнеры → Номер' })
  })
})

describe('kedenGoodsCheck', () => {
  it('нет товаров — ошибка', () => {
    expect(kedenGoodsCheck(src([])).errors.map((e) => e.key)).toEqual(['noGoods'])
  })
  it('код 8708 — ошибка, номера товаров в пункте', () => {
    const { errors } = kedenGoodsCheck(src([full(), full({ tnvedCode: '8708' })]))
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatchObject({ key: 'codeShort', numbers: [2] })
  })
  it('1001 товар — ошибка «разделите партию»', () => {
    const { errors } = kedenGoodsCheck(src(Array.from({ length: 1001 }, () => full())))
    expect(errors.find((e) => e.key === 'tooMany')?.text).toContain('разделите партию')
    expect(kedenGoodsCheck(src(Array.from({ length: 1000 }, () => full()))).errors).toEqual([])
  })
  it('без описания, брутто, стоимости, валюты — по ошибке на вид', () => {
    const { errors } = kedenGoodsCheck(src([full({ description: ' ', grossWeightKg: null, customsValue: null, currency: null })]))
    expect(errors.map((e) => e.key).sort()).toEqual(['noCurrency', 'noDescription', 'noGross', 'noValue'])
  })
  it('код 6–9 знаков — предупреждение; итоги не сходятся — предупреждение', () => {
    const totals = { places: { goods: 3, party: 4 }, grossKg: { goods: 0.125, party: 0.125 }, value: { goods: 1234.5, party: 1234.5 } }
    const r = kedenGoodsCheck(src([full({ tnvedCode: '010121' })]), totals)
    expect(r.errors).toEqual([])
    expect(r.warnings.map((w) => w.key)).toEqual(['codeNot10', 'totals'])
    expect(r.warnings[1]).toMatchObject({ totalsKey: 'places' })
  })
  it('нет количества в доп. ед. — ошибка (КЕДЕН не загрузит товары), номера товаров в пункте', () => {
    const r = kedenGoodsCheck(src([full(), full({ quantity: null }), full({ quantity: 0 })]))
    expect(r.warnings).toEqual([])
    expect(r.errors).toHaveLength(1)
    expect(r.errors[0]).toMatchObject({ key: 'noQuantity', numbers: [2, 3] })
    expect(r.errors[0]!.text).toContain('КЕДЕН не загрузит товары без количества')
  })
  it('валюта товара пуста — берётся валюта ТД; ошибка только если нет ни у товара, ни у ТД', () => {
    const noCur = full({ currency: null })
    expect(kedenGoodsRows(src([noCur], { transit: { docCurrencyCode: 'CNY' } })).rows[0]![4]).toBe('CNY')
    expect(kedenGoodsRows(src([full({ currency: 'USD' })], { transit: { docCurrencyCode: 'CNY' } })).rows[0]![4]).toBe('USD')
    expect(kedenGoodsCheck(src([noCur], { transit: { docCurrencyCode: 'CNY' } })).errors).toEqual([])
    expect(kedenGoodsCheck(src([noCur], { transit: { docCurrencyCode: ' ' } })).errors.map((e) => e.key)).toEqual(['noCurrency'])
    expect(kedenGoodsCheck(src([noCur])).errors.map((e) => e.key)).toEqual(['noCurrency'])
  })
  it('чистый набор — без ошибок и предупреждений', () => {
    expect(kedenGoodsCheck(src())).toEqual({ errors: [], warnings: [] })
  })
})

describe('kedenGoodsFileName', () => {
  it('госномер и партия; неудобные символы заменены', () => {
    expect(kedenGoodsFileName('123 ASD/12', 3)).toBe('Товары-КЕДЕН-123_ASD_12-3.xlsx')
    expect(kedenGoodsFileName(null, null)).toBe('Товары-КЕДЕН.xlsx')
  })
})
