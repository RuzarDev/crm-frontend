import { describe, expect, it } from 'vitest'
import type { DeclarationData } from '@/api/autoTransit'
import { applyCopy, copyWouldReplace, dataExtras, dataToDraft, draftToData } from '../tdModel'
import { fullData, manyGoods } from './tdFixture'

// Текущая ТД — из машины и партии; источник — прошлая ТД того же получателя (план 2а, Task 3).
const current = () => dataToDraft(fullData({
  sealNumber: 'CUR-SEAL',
  packagingType: 'cur-pack-type',
  organizations: [{ role: 'Получатель', subjectType: null, bin: '111', name: 'Текущий', shortName: null, address: null, phone: null, email: null }],
  carriers: [{ role: 'Перевозчик', subjectType: null, bin: null, name: 'Текущий перевозчик', countryCode: 'KZ', phone: null, email: null }],
  transportMeans: [{ transportModeCode: '31', purposeCode: null, vehicleTypeCode: null, wagonOrContainerNumber: '123ASD12', isEmpty: false, isWagonReturn: false, inContainer: false, matchesTransitVehicle: false }],
  identificationMeans: [{ noSeal: false, meansTypeCode: '1', quantity: 1, number: 'CUR-1' }],
  doc44: [{ docTypeCode: '04021', docTypeName: 'Инвойс', docNumber: 'INV-CUR', docDate: '2026-11-17' }],
  goods: manyGoods(1),
  packages: [],
  guarantees: [],
}))
const source = (): DeclarationData => {
  const d = fullData({
    sealNumber: 'SRC-SEAL',
    packagingType: 'src-pack-type',
    organizations: [
      { role: 'Получатель', subjectType: 'ЮЛ', bin: '111', name: 'Из прошлой', shortName: null, address: 'Алматы', phone: null, email: null },
      { role: 'Отправитель', subjectType: null, bin: null, name: 'Khorgos Trade', shortName: null, address: null, phone: null, email: null },
    ],
    carriers: [{ role: 'Перевозчик', subjectType: null, bin: null, name: 'Старый перевозчик', countryCode: 'CN', phone: null, email: null }],
    transportMeans: [{ transportModeCode: '30', purposeCode: null, vehicleTypeCode: null, wagonOrContainerNumber: 'OLD', isEmpty: false, isWagonReturn: false, inContainer: false, matchesTransitVehicle: false }],
    identificationMeans: [{ noSeal: false, meansTypeCode: '1', quantity: 2, number: 'OLD-1' }],
    doc44: [{ docTypeCode: '04021', docTypeName: 'Инвойс', docNumber: 'INV-OLD', docDate: '2026-10-01' }],
    goods: manyGoods(3),
    packages: [{ packagingInfoKindCode: '0', packageTypeCode: 'PK', packageCount: 5, description: null }],
    guarantees: [{ guaranteeTypeCode: '01', amount: 1000, currencyCode: 'KZT', number: 'G-1' }],
  })
  d.transit = {
    ...d.transit,
    departureCountryCode: '156', destinationCountryCode: '398', departureCustomsOffice: '55555', destinationCustomsOffice: '50509',
    packagingInfoCode: '1', cargoPlacesCount: 999, grossWeightKg: 999.5, totalValue: 99999, docCurrencyCode: 'CNY', goodsQuantity: 3,
  }
  return d
}

describe('tdModel.applyCopy', () => {
  it('берёт организации, обеспечение, страны, органы отправления и назначения, упаковку', () => {
    const out = applyCopy(current(), source(), false)
    expect(out.organizations.map((o) => o.name)).toEqual(['Из прошлой', 'Khorgos Trade'])
    expect(out.guarantees).toEqual(source().guarantees)
    expect(out.transit.departureCountryCode).toBe('156')
    expect(out.transit.destinationCountryCode).toBe('398')
    expect(out.transit.departureCustomsOffice).toBe('55555')
    expect(out.transit.destinationCustomsOffice).toBe('50509')
    expect(out.packages).toEqual(source().packages)
    expect(out.packagingType).toBe('src-pack-type')
    expect(out.transit.packagingInfoCode).toBe('1')
  })

  it('не берёт ТС, перевозчиков, пломбы, документы гр. 44 и итоги — они от текущей машины и партии', () => {
    const cur = current()
    const out = applyCopy(cur, source(), false)
    expect(out.transportMeans).toEqual(cur.transportMeans)
    expect(out.carriers).toEqual(cur.carriers)
    expect(out.identificationMeans).toEqual(cur.identificationMeans)
    expect(out.sealNumber).toBe('CUR-SEAL')
    expect(out.doc44).toEqual(cur.doc44)
    for (const k of ['cargoPlacesCount', 'grossWeightKg', 'totalValue', 'docCurrencyCode', 'goodsQuantity'] as const) {
      expect(out.transit[k]).toEqual(cur.transit[k])
    }
  })

  it('товары — только с галочкой', () => {
    const cur = current()
    expect(applyCopy(cur, source(), false).goods).toEqual(cur.goods)
    const withGoods = applyCopy(cur, source(), true)
    expect(withGoods.goods).toHaveLength(3)
    expect(withGoods.goods).toEqual(source().goods)
  })

  it('не меняет ни текущий черновик, ни источник; результат — копия', () => {
    const cur = current()
    const before = JSON.stringify(cur)
    const src = source()
    const out = applyCopy(cur, src, true)
    expect(JSON.stringify(cur)).toBe(before)
    out.organizations[0]!.name = 'изменено'
    out.goods[0]!.description = 'изменено'
    expect(src.organizations[0]!.name).toBe('Из прошлой')
    expect(src.goods[0]!.description).toBe('Товар 1')
  })

  it('старый источник без списков и транзита не роняет копию: пустое не затирает текущее', () => {
    const cur = current()
    const out = applyCopy(cur, { organizations: null } as unknown as DeclarationData, true)
    expect(out.organizations).toEqual([])
    expect(out.goods).toEqual([])
    expect(out.transit.departureCountryCode).toBeNull()
    expect(out.carriers).toEqual(cur.carriers)
  })
})

describe('tdModel.copyWouldReplace — подтверждение перед заменой введённого', () => {
  it('пустые разделы текущей ТД — спрашивать не нужно', () => {
    const empty = dataToDraft({ ...fullData(), organizations: [], guarantees: [], packages: [], packagingType: null, goods: [],
      transit: { ...fullData().transit, departureCountryCode: null, destinationCountryCode: null, departureCustomsOffice: null, destinationCustomsOffice: null, packagingInfoCode: null } })
    expect(copyWouldReplace(empty, false)).toBe(false)
  })
  it('есть организации или страны — спросить; товары считаются только с галочкой', () => {
    const cur = current()
    expect(copyWouldReplace(cur, false)).toBe(true)
    const onlyGoods = dataToDraft({ ...fullData(), organizations: [], guarantees: [], packages: [], packagingType: null, goods: manyGoods(2),
      transit: { ...fullData().transit, departureCountryCode: null, destinationCountryCode: null, departureCustomsOffice: null, destinationCustomsOffice: null, packagingInfoCode: null } })
    expect(copyWouldReplace(onlyGoods, false)).toBe(false)
    expect(copyWouldReplace(onlyGoods, true)).toBe(true)
  })
})

describe('tdModel: незнакомые поля верхнего уровня data не теряются при сохранении', () => {
  it('dataExtras отделяет их, draftToData кладёт обратно', () => {
    const data = { ...fullData(), driver: { name: 'Ван Лэй' }, futureFlag: true } as unknown as DeclarationData
    const extras = dataExtras(data)
    expect(extras).toEqual({ driver: { name: 'Ван Лэй' }, futureFlag: true })
    const back = draftToData(dataToDraft(data), extras) as unknown as Record<string, unknown>
    expect(back.driver).toEqual({ name: 'Ван Лэй' })
    expect(back.futureFlag).toBe(true)
    // Известные поля берутся из черновика, а не из «лишних».
    expect(dataExtras({ ...fullData(), goods: [] })).toEqual({})
  })
})
