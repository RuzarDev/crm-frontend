import { describe, expect, it } from 'vitest'
import { REESTR_TRANSIT_DEFAULTS } from '@/utils/reestrDtoMap'
import {
  PARTIA_TRANSIT_SECTIONS,
  assignPartia,
  draftFromPartia,
  mergePartia,
  partiaToBody,
  transitJsonBroken,
  transitFilled,
  validatePartia,
} from '../partiaModel'
import { fullPartia, fullTransit } from './packageFixture'

const stripIds = <T extends { id: string; sortOrder: number }>(rows: T[]) => rows.map(({ id: _id, sortOrder: _s, ...rest }) => rest)

describe('draftFromPartia', () => {
  it('новая партия — пустые поля, стороны с пятью пустыми полями, транзит по умолчанию', () => {
    const d = draftFromPartia(null)
    expect(d.clientName).toBe('')
    expect(d.destinationStation).toBeNull()
    expect(d.destinationCustomsAuthority).toBeNull()
    expect(d.sealNumber).toBeNull()
    expect(d.shipper).toEqual({ name: null, countryCode: null, region: null, city: null, street: null })
    expect(d.consignee).toEqual({ name: null, countryCode: null, region: null, city: null, street: null })
    expect(d.record.transit).toEqual(REESTR_TRANSIT_DEFAULTS)
    expect(d.record.transit).not.toBe(REESTR_TRANSIT_DEFAULTS)
    expect(d.record.goods).toEqual([])
    expect(d.record.organizations).toEqual([])
    expect(d.record.fields).toEqual({})
  })

  it('товары и гр.44 — без id и sortOrder; дата гр.44 — строка как есть', () => {
    const d = draftFromPartia(fullPartia({ doc44Items: [{ id: 'd1', sortOrder: 0, docTypeCode: '04021', docTypeName: 'Инвойс', docNumber: '1', docDate: '2026-01-01' }] }))
    expect(d.record.goods[0]).not.toHaveProperty('id')
    expect(d.record.goods[0]).not.toHaveProperty('sortOrder')
    expect(d.record.doc44).toEqual([{ docTypeCode: '04021', docTypeName: 'Инвойс', docNumber: '1', docDate: '2026-01-01' }])
  })

  it('transitDataJson раскладывается в transit и 9 коллекций', () => {
    const d = draftFromPartia(fullPartia())
    expect(d.record.transit.departureCustomsOffice).toBe('57507')
    expect(d.record.transit.isMultimodal).toBe(true)
    expect(d.record.transit).not.toHaveProperty('organizations')
    expect(d.record.organizations).toEqual(fullTransit.organizations)
    expect(d.record.guarantees).toEqual(fullTransit.guarantees)
    expect(d.record.cargoOperations).toEqual(fullTransit.cargoOperations)
  })

  it('пропущенные в JSON скаляры — по умолчанию; явный null — null', () => {
    const d = draftFromPartia(fullPartia({ transitDataJson: JSON.stringify({ purposeCode: null, loadingRailStation: 'Хоргос' }) }))
    expect(d.record.transit.purposeCode).toBeNull()
    expect(d.record.transit.entryMethodCode).toBe('RW')
    expect(d.record.transit.loadingRailStation).toBe('Хоргос')
    expect(d.record.carriers).toEqual([])
  })

  it('null transitDataJson — значения по умолчанию, не поломка', () => {
    const c = fullPartia({ transitDataJson: null })
    expect(draftFromPartia(c).record.transit).toEqual(REESTR_TRANSIT_DEFAULTS)
    expect(transitJsonBroken(c.transitDataJson)).toBe(false)
  })

  it('битый transitDataJson — значения по умолчанию и признак поломки', () => {
    for (const bad of ['{oops', '[]', '"строка"', '42', 'null']) {
      const d = draftFromPartia(fullPartia({ transitDataJson: bad }))
      expect(d.record.transit).toEqual(REESTR_TRANSIT_DEFAULTS)
      expect(d.record.organizations).toEqual([])
      expect(transitJsonBroken(bad)).toBe(true)
    }
    expect(transitJsonBroken(fullPartia().transitDataJson)).toBe(false)
  })

  it('черновик не делит объекты с DTO', () => {
    const c = fullPartia()
    const d = draftFromPartia(c)
    d.shipper.name = 'другой'
    d.record.goods[0].description = 'другой'
    expect(c.shipper?.name).toBe('Lenovo Ltd')
    expect(c.goodsItems[0].description).toBe('Ноутбуки')
  })
})

describe('partiaToBody', () => {
  it('круговой путь DTO → черновик → тело без потерь', () => {
    const c = fullPartia()
    const body = partiaToBody(draftFromPartia(c))
    expect(body).toEqual({
      clientName: 'kazakhmys',
      destinationStation: 'Сарыагаш',
      destinationCustomsAuthority: 'ТП «Сарыагаш»',
      sealNumber: 'SL-123',
      shipper: c.shipper,
      consignee: c.consignee,
      goodsItems: stripIds(c.goodsItems),
      doc44Items: stripIds(c.doc44Items),
      transitDataJson: expect.any(String),
    })
    expect(JSON.parse(body.transitDataJson!)).toEqual(fullTransit)
  })

  it('стороны null в DTO — объекты с пустыми полями (как раньше)', () => {
    const body = partiaToBody(draftFromPartia(fullPartia({ shipper: null, consignee: null })))
    expect(body.shipper).toEqual({ name: null, countryCode: null, region: null, city: null, street: null })
    expect(body.consignee).toEqual({ name: null, countryCode: null, region: null, city: null, street: null })
  })

  it('строки обрезаются, пустые → null; пустые списки → null; transitDataJson всегда', () => {
    const d = draftFromPartia(null)
    d.clientName = '  kazakhmys '
    d.destinationStation = '   '
    d.destinationCustomsAuthority = ' ТП '
    d.sealNumber = ''
    const body = partiaToBody(d)
    expect(body.clientName).toBe('kazakhmys')
    expect(body.destinationStation).toBeNull()
    expect(body.destinationCustomsAuthority).toBe('ТП')
    expect(body.sealNumber).toBeNull()
    expect(body.goodsItems).toBeNull()
    expect(body.doc44Items).toBeNull()
    expect(JSON.parse(body.transitDataJson!)).toEqual({
      ...REESTR_TRANSIT_DEFAULTS,
      organizations: [], carriers: [], transportMeans: [], identificationMeans: [], packages: [],
      containers: [], precedingDocs: [], cargoOperations: [], guarantees: [],
    })
  })

  it('итоги количества и мест — целые: дробное округляется, пустое — null (B9)', () => {
    const d = draftFromPartia(fullPartia())
    d.record.transit.goodsQuantity = 2.4
    d.record.transit.cargoPlacesCount = 36.5
    let t = JSON.parse(partiaToBody(d).transitDataJson!)
    expect(t.goodsQuantity).toBe(2)
    expect(t.cargoPlacesCount).toBe(37)
    expect(t.grossWeightKg).toBe(570.5)

    ;(d.record.transit as unknown as Record<string, unknown>).cargoPlacesCount = '12'
    ;(d.record.transit as unknown as Record<string, unknown>).goodsQuantity = ''
    t = JSON.parse(partiaToBody(d).transitDataJson!)
    expect(t.cargoPlacesCount).toBe(12)
    expect(t.goodsQuantity).toBeNull()
  })

  it('черновик не меняется', () => {
    const d = draftFromPartia(fullPartia())
    d.record.transit.cargoPlacesCount = 36.5
    partiaToBody(d)
    expect(d.record.transit.cargoPlacesCount).toBe(36.5)
  })
})

describe('validatePartia', () => {
  const ok = () => draftFromPartia(fullPartia())

  it('полная партия — без ошибок', () => {
    expect(validatePartia(ok())).toEqual([])
  })

  it('клиент обязателен', () => {
    const d = ok()
    d.clientName = '   '
    expect(validatePartia(d)).toEqual(['broker.partia.errors.needClient'])
  })

  it('лимиты сервера: клиент и станция и таможня ≤ 200, пломба ≤ 100 (после обрезки)', () => {
    const d = ok()
    d.clientName = 'к'.repeat(200)
    d.destinationStation = 'с'.repeat(200)
    d.destinationCustomsAuthority = ` ${'т'.repeat(200)} `
    d.sealNumber = 'п'.repeat(100)
    expect(validatePartia(d)).toEqual([])
    d.clientName = 'к'.repeat(201)
    d.destinationStation = 'с'.repeat(201)
    d.destinationCustomsAuthority = 'т'.repeat(201)
    d.sealNumber = 'п'.repeat(101)
    expect(validatePartia(d)).toEqual([
      'broker.partia.errors.clientTooLong',
      'broker.partia.errors.stationTooLong',
      'broker.partia.errors.customsTooLong',
      'broker.partia.errors.sealTooLong',
    ])
  })

  it('таможня отправления длиннее 32 знаков — как в записи транзита', () => {
    const d = ok()
    d.record.transit.departureCustomsOffice = 'ТАМОЖЕННЫЙ ПОСТ БЕЗ КОДА С ДЛИННЫМ НАЗВАНИЕМ'
    expect(validatePartia(d)).toEqual(['broker.partia.errors.departureOfficeTooLong'])
  })
})

describe('transitFilled', () => {
  it('10 разделов транзитной декларации', () => {
    expect(PARTIA_TRANSIT_SECTIONS).toHaveLength(10)
    expect(PARTIA_TRANSIT_SECTIONS).not.toContain('goods')
    expect(PARTIA_TRANSIT_SECTIONS).not.toContain('doc44')
    expect(PARTIA_TRANSIT_SECTIONS).not.toContain('row')
  })

  it('полная партия — все 10', () => {
    expect(transitFilled(draftFromPartia(fullPartia()))).toEqual({ filled: PARTIA_TRANSIT_SECTIONS, total: 10 })
  })

  it('новая — только «Основное» (значения по умолчанию)', () => {
    expect(transitFilled(draftFromPartia(null))).toEqual({ filled: ['main'], total: 10 })
  })

  it('заполненный раздел добавляется в порядке меню', () => {
    const d = draftFromPartia(null)
    d.record.guarantees.push({ guaranteeTypeCode: '01', amount: null, currencyCode: null, number: null })
    d.record.carriers.push({ role: 'Перевозчик', subjectType: null, bin: null, name: 'КТЖ', countryCode: null, phone: null, email: null })
    expect(transitFilled(d).filled).toEqual(['main', 'carriers', 'guarantees'])
  })
})

describe('слияние и применение на месте', () => {
  it('mergePartia: правки пользователя остаются, остальное — с сервера', () => {
    const base = draftFromPartia(fullPartia())
    const mine = draftFromPartia(fullPartia())
    mine.sealNumber = 'моя'
    mine.consignee.name = 'мой получатель'
    mine.record.goods[0].description = 'моё'
    const theirs = draftFromPartia(fullPartia({ destinationStation: 'Алматы-1', shipper: { name: 'Новый' } }))
    const out = mergePartia(base, mine, theirs)
    expect(out.sealNumber).toBe('моя')
    expect(out.consignee.name).toBe('мой получатель')
    expect(out.record.goods[0].description).toBe('моё')
    expect(out.destinationStation).toBe('Алматы-1')
    expect(out.shipper.name).toBe('Новый')
  })

  it('assignPartia: те же объекты сторон, строк и transit', () => {
    const target = draftFromPartia(fullPartia())
    const shipper = target.shipper
    const row = target.record.goods[0]
    const transit = target.record.transit
    assignPartia(target, draftFromPartia(fullPartia({ sealNumber: 'X', shipper: { name: 'Новый' } })))
    expect(target.sealNumber).toBe('X')
    expect(target.shipper).toBe(shipper)
    expect(target.shipper.name).toBe('Новый')
    expect(target.record.goods[0]).toBe(row)
    expect(target.record.transit).toBe(transit)
    expect(JSON.stringify(target)).toBe(JSON.stringify(draftFromPartia(fullPartia({ sealNumber: 'X', shipper: { name: 'Новый' } }))))
  })
})
