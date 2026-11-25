import { describe, expect, it } from 'vitest'
import type { AutoVehicle } from '@/api/autoTransit'
import {
  autoToData, dataExtras, dataToAuto, dataToDraft, draftToData, missingLabel, missingSection, missingTarget, newVehicle,
  removeVehicle, totalsMismatch, vehiclesState,
} from '../tdModel'
import { fullData, manyGoods } from './tdFixture'

// ПИ под авто (очередь 3, этап 1): машины и водитель в data, сравнение итогов. Данные водителя — выдуманные.
const tractor = (o: Partial<AutoVehicle> = {}): AutoVehicle => ({ role: 'tractor', typeCode: '303', regNumber: '123ASD12', countryCode: 'KZ', vin: '-', headIndex: null, ...o })
const trailer = (o: Partial<AutoVehicle> = {}): AutoVehicle => ({ role: 'trailer', typeCode: '312', regNumber: '12DS12', countryCode: 'KZ', vin: '-', headIndex: 0, ...o })
const driver = { fullName: 'ТЕСТОВ ТЕСТ', countryCode: 'KZ', docKindCode: '10022', docNumber: 'N0000001', personalNumber: '900101300000' }

describe('tdModel: машины и водитель', () => {
  it('старая ТД без vehicles/driver — пустой список и пустой водитель', () => {
    const auto = dataToAuto(fullData())
    expect(auto.vehicles).toEqual([])
    expect(auto.driver).toEqual({ fullName: null, countryCode: null, docKindCode: null, docNumber: null, personalNumber: null })
    expect(dataToAuto(null).vehicles).toEqual([])
  })

  it('круговой проход: vehicles и driver уходят в PUT как были, в «лишние» поля не попадают', () => {
    const data = { ...fullData(), vehicles: [tractor(), trailer()], driver }
    expect(Object.keys(dataExtras(data))).not.toContain('vehicles')
    expect(Object.keys(dataExtras(data))).not.toContain('driver')
    const back = draftToData(dataToDraft(data), dataExtras(data), dataToAuto(data))
    expect(back.vehicles).toEqual([tractor(), trailer()])
    expect(back.driver).toEqual(driver)
  })

  it('незаполненный водитель уходит как null; данные модели не связаны с ответом', () => {
    const data = { ...fullData(), vehicles: [tractor()] }
    const auto = dataToAuto(data)
    auto.vehicles[0]!.regNumber = 'другой'
    expect(data.vehicles[0]!.regNumber).toBe('123ASD12')
    expect(autoToData(auto).driver).toBeNull()
  })

  it('неполная строка машины из старого JSON добивается null, неизвестная роль — грузовик', () => {
    const auto = dataToAuto({ vehicles: [{ role: 'x', regNumber: 'A1' }] } as never)
    expect(auto.vehicles[0]).toEqual({ role: 'truck', typeCode: null, regNumber: 'A1', countryCode: null, vin: null, headIndex: null })
  })

  it('новые строки: тягач 303, прицеп 312 со ссылкой на тягач, грузовик без типа; VIN «-»', () => {
    expect(newVehicle('tractor', [])).toEqual({ role: 'tractor', typeCode: '303', regNumber: null, countryCode: null, vin: '-', headIndex: null })
    expect(newVehicle('trailer', [tractor()])).toEqual({ role: 'trailer', typeCode: '312', regNumber: null, countryCode: null, vin: '-', headIndex: 0 })
    expect(newVehicle('trailer', [])).toMatchObject({ headIndex: null })
    expect(newVehicle('truck', [])).toEqual({ role: 'truck', typeCode: null, regNumber: null, countryCode: null, vin: '-', headIndex: null })
  })

  it('удаление тягача снимает ссылку прицепа, ссылки на следующие сдвигаются', () => {
    const list = [tractor(), tractor({ regNumber: 'B' }), trailer({ headIndex: 0 }), trailer({ headIndex: 1 })]
    const out = removeVehicle(list, 0)
    expect(out.map((v) => v.headIndex)).toEqual([null, null, 0])
    expect(list).toHaveLength(4)
  })

  it('состояние раздела: пусто / требует внимания / заполнен', () => {
    expect(vehiclesState(dataToAuto(null))).toBe('empty')
    expect(vehiclesState({ vehicles: [tractor()], driver: { ...driver, docNumber: null } })).toBe('warn')
    expect(vehiclesState({ vehicles: [tractor({ countryCode: null })], driver })).toBe('warn')
    expect(vehiclesState({ vehicles: [tractor(), trailer()], driver })).toBe('done')
  })

  it('«Не заполнено» водителя и машин ведёт в «Машины и водитель» к полю', () => {
    expect(missingSection({ key: 'driver.fullName', section: 'vehicles' })).toBe('vehicles')
    expect(missingSection({ key: 'vehicles[1].countryCode', section: '' })).toBe('vehicles')
    expect(missingTarget({ key: 'driver.docNumber', section: 'vehicles' })).toEqual({ field: 'driver.docNumber', index: 0 })
    expect(missingTarget({ key: 'vehicles[1].regNumber', section: 'vehicles' })).toEqual({ field: 'regNumber', index: 1 })
    expect(missingLabel({ key: 'vehicles[1].regNumber', section: 'vehicles' })).toEqual({ key: 'vehicleItem', params: { n: 2, field: 'regNumber' } })
    expect(missingLabel({ key: 'driver.fullName', section: 'vehicles' })).toEqual({ key: 'driver_fullName', params: {} })
  })
})

describe('tdModel: сравнение итогов с партией', () => {
  const check = (o: Partial<Record<'places' | 'grossKg' | 'value', [number | null, number | null]>> = {}) => {
    const pair = (k: 'places' | 'grossKg' | 'value', d: [number, number]) => ({ goods: (o[k] ?? d)[0], party: (o[k] ?? d)[1] })
    return { places: pair('places', [6, 6]), grossKg: pair('grossKg', [100, 100]), value: pair('value', [10, 10]) }
  }

  it('совпадает — пусто; нет ответа — пусто', () => {
    expect(totalsMismatch(check())).toEqual([])
    expect(totalsMismatch(null)).toEqual([])
  })

  it('0,5 кг на 19 т видно: сравнение точное, разница без округления', () => {
    const rows = totalsMismatch(check({ grossKg: [19000.5, 19000] }))
    expect(rows).toEqual([{ key: 'grossKg', goods: 19000.5, party: 19000, diff: 0.5 }])
  })

  it('товары с правками считаются на месте, без ошибок двоичной дроби', () => {
    // 0,1 + 0,2 в JS — 0.30000000000000004: такая «разница» плашку не показывает.
    const goods = manyGoods(2).map((g, i) => ({ ...g, packagesCount: 3, grossWeightKg: i ? 0.2 : 0.1, customsValue: 5 }))
    expect(totalsMismatch(check({ places: [0, 6], grossKg: [0, 0.3], value: [0, 10] }), goods)).toEqual([])
    const more = [...goods, { ...goods[0]!, grossWeightKg: 0.0001, packagesCount: 0, customsValue: 0 }]
    expect(totalsMismatch(check({ places: [0, 6], grossKg: [0, 0.3], value: [0, 10] }), more)).toEqual([
      { key: 'grossKg', goods: 0.3001, party: 0.3, diff: 0.0001 },
    ])
  })

  it('ревью M8: итог партии не внесён (0 или null) при ненулевых товарах — тоже расхождение', () => {
    expect(totalsMismatch(check({ value: [10, 0], places: [6, null] }))).toEqual([
      { key: 'places', goods: 6, party: 0, diff: 6, partyMissing: true },
      { key: 'value', goods: 10, party: 0, diff: 10, partyMissing: true },
    ])
    // Ни в товарах, ни в партии ничего — сравнивать нечего.
    expect(totalsMismatch(check({ value: [0, 0], places: [null, null] }))).toEqual([])
  })

  it('товаров нет — строку не показываем (о пустых товарах говорит «Не заполнено»)', () => {
    expect(totalsMismatch(check({ grossKg: [100, 90] }), [])).toEqual([])
  })
})
