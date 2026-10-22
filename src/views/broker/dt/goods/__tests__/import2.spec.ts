// Пакет «Импорт 2.0» (волна правок 2, 22.10.2026): двуязычные инвойсы-упаковочные поставщика (образец «39th»), места
// словами, повторный импорт с повторяющимися артикулами (сверка import-2), один документ с разными датами (e2e-5),
// «Вид документа» гр. 44 по коду (e2e-4). Данные обезличены.
import { afterEach, describe, expect, it } from 'vitest'
import type { Import40GoodsItemInput } from '@/types/api'
import { goodsFromSheetRows, goodsSheetTotals } from '@/utils/goodsExcel'
import { fixCyrillicLookalikes, hanPlace, modelFromText, normalizeIncotermsPlace, parseForeignAddress, russianPart } from '@/utils/importText'
import { blankCharacteristic } from '../editor/characteristics'
import { okeiFromText, resetOkeiUnits } from '../editor/okei'
import { docDateConflicts, dtDocsFromRows, extraHeaderDocs } from '../goodsImport'
import { buildGoods, noteCount, noteDetails } from '../importBuild'
import { matchExisting } from '../importMerge'
import { emptyImportRow, type ImportRow } from '../importRows'
import type { ResolveResult } from '../importResolve'
import { newDtGoodsItem } from '../useDtGoods'

afterEach(() => resetOkeiUnits())

const row = (o: Partial<ImportRow>): ImportRow => ({ ...emptyImportRow('f.xlsx'), ...o })
const resolved = (dei: Record<string, string | null>): ResolveResult => ({
  byCode: new Map(Object.entries(dei).map(([code, d]) => [code, { code, valid: true, name: `N ${code}`, dei: d ? { code: d, name: 'ШТУКА', shortName: 'ШТ' } : null }])),
  rejected: [],
  failed: false,
})

const BILINGUAL = '用于标记各类产品的台式激光打标机。主机（外壳/支架）。型号“RC1001”。\n'
  + 'Настольный лазерный маркировочный аппарат.  Основной блок (корпус-стойка).    Model "RC1001"'
const MIXED_LINE = '焊条烘干箱。型号 YJJ-A-200。额定功率：3 kW。       Сушильный шкаф для электродов. "Модель YJJ-A-200".    Мощность:  3 кВт.'

describe('описание и модель (правки 2.3, 2.4)', () => {
  it('двуязычная ячейка — только русская часть; только китайский — как есть', () => {
    expect(russianPart(BILINGUAL)).toBe('Настольный лазерный маркировочный аппарат. Основной блок (корпус-стойка). Model "RC1001"')
    expect(russianPart(MIXED_LINE)).toBe('Сушильный шкаф для электродов. "Модель YJJ-A-200". Мощность: 3 кВт.')
    expect(russianPart('电动葫芦。型号：“CD1”。')).toBe('电动葫芦。型号：“CD1”。')
    expect(russianPart('Сушилка для белья 18 м')).toBe('Сушилка для белья 18 м')
  })

  it('модель из описания: Model "X", Модель: "X", "Модель X", 型号“X”; нет — null', () => {
    expect(modelFromText(BILINGUAL)).toBe('RC1001')
    expect(modelFromText('Таль электрическая. Модель: "CD1". Высота подъёма 35 м')).toBe('CD1')
    expect(modelFromText(MIXED_LINE)).toBe('YJJ-A-200')
    expect(modelFromText('Насосы. Модель "WQN100-80-37 кВт".')).toBe('WQN100-80-37 кВт')
    expect(modelFromText('电动葫芦。型号：“CD1”。')).toBe('CD1')
    expect(modelFromText('Лист из нержавеющей стали, марки 201J2')).toBeNull()
    expect(modelFromText('Модели в ассортименте')).toBeNull()
  })

  it('товар ДТ: описание по-русски с замечанием, модель из описания, своя модель главнее', () => {
    const b = buildGoods([
      row({ description: BILINGUAL, tnvedCode: '8456110000' }),
      row({ description: BILINGUAL, tnvedCode: '8456110000', productModelName: 'ОТСУТСТВУЕТ' }),
      row({ description: '电动葫芦。型号：“CD1”。', tnvedCode: '8425110000' }),
    ], { currency: 'CNY', packageKinds: [], resolved: resolved({ '8456110000': '796', '8425110000': '796' }) })
    expect(b.goods[0].description).toBe('НАСТОЛЬНЫЙ ЛАЗЕРНЫЙ МАРКИРОВОЧНЫЙ АППАРАТ. ОСНОВНОЙ БЛОК (КОРПУС-СТОЙКА). MODEL "RC1001"')
    expect(b.goods.map((g) => g.characteristics?.[0]?.productModelName)).toEqual(['RC1001', 'ОТСУТСТВУЕТ', 'CD1'])
    expect([noteCount(b.notes, 'hanDropped'), noteCount(b.notes, 'han'), noteCount(b.notes, 'modelFromDescription')]).toEqual([2, 1, 2])
  })
})

describe('единицы и места (правки 2.3, 2.5)', () => {
  it('двуязычная единица «台 ⏎ шт» → 796; «m», «kg» и иероглифы; составное название не распадается', () => {
    expect(okeiFromText('台\nшт')).toBe('796')
    expect(okeiFromText('台')).toBe('796')
    expect(okeiFromText('m')).toBe('006')
    expect(okeiFromText('kg')).toBe('166')
    expect(okeiFromText('件/pcs')).toBe('796')
    expect(okeiFromText('коробки')).toBeNull()
  })

  it('места текстом из столбца: «Два деревянных ящика № 3 и № 4» → 2, не 34; неоднозначно — пусто с текстом', () => {
    const rows = [
      ['№', 'Description of Goods', 'Q\'ty', 'Unit', 'Net Weight (Kg)', 'Gross Weight (Kg)', 'number of seats / number of places', 'Manufactured'],
      [1, 'Аппарат', 2, '台\nшт', 57, 85, '两个木箱，编号 3 和 4.   Два деревянных ящика № 3 и № 4', 'Example Laser Co., Ltd.'],
      [2, 'Тележка', 50, '台\nшт', 680, 700, '50箱，1托.   50 коробок, 1 палета', 'Example Hoist Co'],
      [3, 'Стальной канат. 95 метров в рулоне. Всего 6 рулонов.', 1520, 'm', 1258.7, 1300.7, '2托+配件1托.  2 паллеты + 1 паллета', 'Example Hoist Co'],
      ['Total', null, null, null, 1996.1, 2085.7, '共计9件. 9 мест'],
    ]
    const goods = goodsFromSheetRows(rows, { details: true })
    // товар с «Всего 6 рулонов» в описании — не строка итога
    expect(goods.map((g) => g.packagesCount)).toEqual([2, null, 3])
    expect(goods.map((g) => g.details?.placesNote ?? null)).toEqual([null, '50箱，1托. 50 коробок, 1 палета', null])
    expect(goods[0].details?.manufacturerName).toBe('EXAMPLE LASER CO., LTD.')
    expect(goodsSheetTotals(rows, { details: true })).toEqual({ places: 9, grossWeightKg: 2085.7, netWeightKg: 1996.1, value: null })

    const b = buildGoods([row({ places: null, placesNote: '50 коробок, 1 палета' })], { currency: null, packageKinds: [], resolved: null })
    expect(noteDetails(b.notes, 'placesAmbiguous')).toEqual(['50 коробок, 1 палета'])
    expect(b.goods[0].packagesCount).toBeNull()
  })
})

describe('стороны и условия поставки (правка 2.1)', () => {
  it('пункт иероглифами — погранпереход по-русски', () => {
    expect(hanPlace('新疆霍尔果斯，Метод')).toBe('ХОРГОС')
    expect(normalizeIncotermsPlace('⑫Work Term ：  FCA  新疆霍尔果斯，Метод доставки по Инкотермс "Хоргос КНР"')).toBe('ХОРГОС')
    expect(normalizeIncotermsPlace('CIF ALMATY, KAZAKHSTAN')).toBe('АЛМАТЫ')
  })

  it('«P.R. China.» с точкой — страна Китай; латиница-двойник в русских словах исправляется', () => {
    expect(parseForeignAddress('Room 1, No.16 Test Rd, Hangzhou city, Zhejiang Province, P.R. China.')).toMatchObject({
      countryText: 'P.R. China', city: 'HANGZHOU', region: 'ZHEJIANG PROVINCE', apt: 'ROOM 1', house: 'NO.16',
    })
    expect(fixCyrillicLookalikes('Kазаxстан, Aтырауская область, ул.Θтешкали, Room 5')).toBe('Казахстан, Атырауская область, ул.Өтешкали, Room 5')
  })
})

describe('повторный импорт: артикулы повторяются (сверка import-2)', () => {
  const goods = (o: Partial<Import40GoodsItemInput>, article: string): Import40GoodsItemInput =>
    ({ ...newDtGoodsItem('USD'), ...o, characteristics: [{ ...blankCharacteristic(), productArticle: article }] })
  const shelves = () => [
    goods({ tnvedCode: '9403208009', description: 'ПОЛКИ ДЛЯ ОБУВИ 3 ЯРУСА' }, '506'),
    goods({ tnvedCode: '9403208009', description: 'ПОЛКИ ДЛЯ ОБУВИ 4 ЯРУСА' }, '506'),
    goods({ tnvedCode: '9403208009', description: 'ПОЛКИ ДЛЯ ОБУВИ 3 ЯРУСА' }, '905'),
    goods({ tnvedCode: '9403208009', description: 'ПОЛКИ ДЛЯ ОБУВИ 4 ЯРУСА' }, '905'),
  ]

  it('в ДТ на товар больше, чем в файле, — 506/905 сопоставляются по артикулу и описанию, не дублируются', () => {
    const existing = [...shelves(), goods({ tnvedCode: '7323990000', description: 'ДОБАВЛЕН ВРУЧНУЮ' }, 'X-1')]
    const m = matchExisting(existing, shelves())
    expect(m.map((x) => [x.existing, x.by])).toEqual([
      [0, 'articleDescription'], [1, 'articleDescription'], [2, 'articleDescription'], [3, 'articleDescription'],
    ])
  })
})

describe('гр. 44 импорта (e2e-4, e2e-5)', () => {
  const rowsWithDocs = [
    ...Array.from({ length: 3 }, () => row({ docs: [{ typeCode: '04021', number: 'UR0910', date: '2026-09-10' }] })),
    row({ docs: [{ typeCode: '04021', number: 'UR0910', date: '2026-10-10' }] }),
  ]

  it('«Вид документа» — из классификатора 2009', () => {
    const names = new Map([['04021', 'СЧЕТ-ФАКТУРА (ИНВОЙС) К ДОГОВОРУ']])
    expect(dtDocsFromRows(rowsWithDocs, (i) => i, names).map((d) => [d.docTypeName, d.docDate, d.goodsItemIndexes])).toEqual([
      ['СЧЕТ-ФАКТУРА (ИНВОЙС) К ДОГОВОРУ', '2026-09-10', '0,1,2'],
      ['СЧЕТ-ФАКТУРА (ИНВОЙС) К ДОГОВОРУ', '2026-10-10', '3'],
    ])
  })

  it('один инвойс с разными датами в строках и в шапке — расхождение; документы шапки без пары в строках', () => {
    const header = [
      { docTypeCode: '04021', docNumber: 'UR0910', docDate: '2026-09-11' },
      { docTypeCode: '04131', docNumber: 'UR0910', docDate: '2026-09-10' },
    ] as never[]
    expect(docDateConflicts(rowsWithDocs, header)).toEqual([{
      code: '04021', number: 'UR0910',
      dates: [{ date: '2026-09-10', rows: 3 }, { date: '2026-10-10', rows: 1 }, { date: '2026-09-11', rows: 0, header: true }],
    }])
    expect(docDateConflicts([rowsWithDocs[0]], [])).toEqual([])
    expect(extraHeaderDocs(rowsWithDocs, header).map((d) => d.docTypeCode)).toEqual(['04131'])
  })
})
