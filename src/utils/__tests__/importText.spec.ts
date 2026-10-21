import { describe, expect, it } from 'vitest'
import {
  countryFromText, hasHan, normPartyName, normalizeIncotermsPlace, packagingLine, packagingWord, parseForeignAddress, upperRu,
  vehiclePlatesFrom,
} from '../importText'

describe('normalizeIncotermsPlace (№6)', () => {
  it.each([
    ['/ 交货条件: CIF ALMATY, KAZAKHSTAN (Incoterms® 2020)', 'АЛМАТЫ'],
    ['Условия поставки / 交货条件: CIF ALMATY, KAZAKHSTAN (Incoterms® 2020)   Транспорт / 运输方式: CMR', 'АЛМАТЫ'],
    ['DAP НУР ЖОЛЫ', 'НУР ЖОЛЫ'],
    ['ДАР НУР ЖОЛЫ', 'НУР ЖОЛЫ'],
    ['FCA Guangzhou', 'GUANGZHOU'],
    ['Almaty city', 'АЛМАТЫ'],
    ['ALMATY', 'АЛМАТЫ'],
    ['CIF Nur-Sultan', 'АСТАНА'],
    ['DAP Shanghai port', 'SHANGHAI PORT'],
    ['г. Алматы', 'АЛМАТЫ'],
  ])('%s → %s', (raw, expected) => expect(normalizeIncotermsPlace(raw)).toBe(expected))

  it('только страна или пусто — null', () => {
    expect(normalizeIncotermsPlace('KAZAKHSTAN')).toBeNull()
    expect(normalizeIncotermsPlace('CIF, Kazakhstan')).toBeNull()
    expect(normalizeIncotermsPlace('')).toBeNull()
    expect(normalizeIncotermsPlace(null)).toBeNull()
  })
})

describe('parseForeignAddress (№7)', () => {
  it('адрес UR0910: область, город (первый City), улица с остальным, дом, офис', () => {
    expect(parseForeignAddress('Address: Room 722, Block B, Soho Apartment, Wanda Plaza, Jiang Street, Yiwu City, Jinhua City, Zhejiang Province, China'))
      .toEqual({
        countryText: 'China', region: 'ZHEJIANG PROVINCE', district: null, city: 'YIWU',
        street: 'JIANG STREET, SOHO APARTMENT, WANDA PLAZA, JINHUA CITY', house: 'BLOCK B', apt: 'ROOM 722', clipped: false,
      })
  })

  it('«No. 88 Futian Road» — дом и улица; район; страна без области', () => {
    expect(parseForeignAddress('No. 88 Futian Road, Futian District, Shenzhen, Guangdong, China')).toMatchObject({
      countryText: 'China', house: 'NO. 88', street: 'FUTIAN ROAD, SHENZHEN, GUANGDONG', district: 'FUTIAN DISTRICT',
    })
  })

  it('только иероглифы или пусто — null; длинное — обрезка с признаком', () => {
    expect(parseForeignAddress('浙江省义乌市江东街道')).toBeNull()
    expect(parseForeignAddress('')).toBeNull()
    const long = parseForeignAddress(`Room ${'1'.repeat(30)}, ${'A'.repeat(130)} Street, China`)!
    expect(long.clipped).toBe(true)
    expect(long.apt!.length).toBe(20)
    expect(long.street!.length).toBe(120)
  })
})

describe('countryFromText (№4)', () => {
  const countries = [{ value: '156', label: '156 — КИТАЙ', alpha2: 'CN' }, { value: '398', label: '398 — КАЗАХСТАН', alpha2: 'KZ' }]
  it.each([
    ['CN', '156'], ['cn', '156'], ['156', '156'], ['Китай', '156'], ['China', '156'], ['PRC', '156'], ['P.R.China', '156'],
    ['中国', '156'], ['Made in China', '156'], ['Казахстан', '398'],
  ])('%s → %s', (text, code) => expect(countryFromText(text, countries)).toBe(code))
  it('не узнано или нет в справочнике — null', () => {
    expect(countryFromText('xx', countries)).toBeNull()
    expect(countryFromText('Narnia', countries)).toBeNull()
    expect(countryFromText('Turkey', countries)).toBeNull() // 792 нет в справочнике страницы
    expect(countryFromText('Turkey')).toBe('792') // без справочника — по таблице
  })
})

describe('прочее', () => {
  it('hasHan, upperRu, normPartyName', () => {
    expect(hasHan('黑色金属脚手架钢管')).toBe(true)
    expect(hasHan('СУШИЛКА')).toBe(false)
    expect(upperRu('  ёршик  для  ванной ')).toBe('ЁРШИК ДЛЯ ВАННОЙ')
    expect(normPartyName('Yiwu Longju Trading Co., Ltd.')).toBe(normPartyName('YIWU LONGJU TRADING CO LTD'))
    expect(normPartyName('ТОО «Urker Distribution»')).toBe('URKER DISTRIBUTION')
  })

  it('вид упаковки словами и строка «Упаковка / 包装: …» (№3)', () => {
    expect(packagingWord('件数 Кол-во мест (ctn)')).toBe('carton')
    expect(packagingWord('Cartons')).toBe('carton')
    expect(packagingWord('Bags')).toBe('bag')
    expect(packagingWord('Pallets')).toBe('pallet')
    expect(packagingWord('Кол-во мест')).toBeNull()
    expect(packagingLine([['Упаковка / 包装: картонные коробки / 纸箱']])).toBe('картонные коробки / 纸箱')
    expect(packagingLine([['Всего мест: 1 044 CTNS']])).toBeNull()
  })

  it('тягач и прицеп из подписи «АВТО:» (№8 при импорте)', () => {
    expect(vehiclePlatesFrom([[null, 'АВТО:184AFR19/48AEU19']])).toEqual({ tractor: '184AFR19', trailer: '48AEU19' })
    expect(vehiclePlatesFrom([['TRUCK NO: 777ABC02']])).toEqual({ tractor: '777ABC02', trailer: null })
    expect(vehiclePlatesFrom([['Транспорт / 运输方式: Международная автоперевозка (CMR)']])).toBeNull()
  })
})
