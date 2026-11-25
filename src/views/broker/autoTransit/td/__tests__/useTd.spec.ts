import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { response, fullData, httpError } from './tdFixture'

const api = vi.hoisted(() => ({ getDeclaration: vi.fn(), saveDeclaration: vi.fn() }))
vi.mock('@/api/autoTransit', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/api/autoTransit')>()), ...api }))
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
vi.mock('@/ui/message', () => ({ message: toast }))

import { useTd } from '../useTd'

let scope: ReturnType<typeof effectScope> | null = null
const start = async (truck = 't1', party = 'p1') => {
  scope = effectScope()
  const td = scope.run(() => useTd(() => truck, () => party))!
  await flushPromises()
  await nextTick()
  return td
}
afterEach(() => { scope?.stop(); scope = null; vi.clearAllMocks() })

describe('useTd', () => {
  it('загрузка: черновик, признаки, незаполненное; dirty — false', async () => {
    api.getDeclaration.mockResolvedValue(response({ isDraft: true, missing: [{ key: 'guarantees', section: 'guarantees' }] }))
    const td = await start()
    expect(api.getDeclaration).toHaveBeenCalledWith('t1', 'p1')
    expect(td.isDraft.value).toBe(true)
    expect(td.readOnly.value).toBe(false)
    expect(td.missing.value).toHaveLength(1)
    expect(td.draft.goods).toHaveLength(2)
    expect(td.dirty.value).toBe(false)
  })

  it('readOnly — из ответа; save() при readOnly не зовёт PUT', async () => {
    api.getDeclaration.mockResolvedValue(response({ readOnly: true }))
    const td = await start()
    expect(td.readOnly.value).toBe(true)
    expect(await td.save()).toBe(false)
    expect(api.saveDeclaration).not.toHaveBeenCalled()
  })

  it('save(): тело { version, data } без fields; после ответа — новая версия и dirty false', async () => {
    api.getDeclaration.mockResolvedValue(response({ isDraft: true }))
    const td = await start()
    td.draft.goods[0].description = 'Ноутбуки игровые'
    await nextTick()
    expect(td.dirty.value).toBe(true)
    const saved = fullData()
    saved.goods[0].description = 'Ноутбуки игровые'
    api.saveDeclaration.mockResolvedValue(response({ version: 8, data: saved }))
    expect(await td.save()).toBe(true)
    const [truckId, partyId, body] = api.saveDeclaration.mock.calls[0]
    expect([truckId, partyId]).toEqual(['t1', 'p1'])
    expect(body.version).toBe(7)
    expect(body.data.goods[0].description).toBe('Ноутбуки игровые')
    expect('fields' in body.data).toBe(false)
    await flushPromises()
    expect(td.isDraft.value).toBe(false)
    expect(td.version.value).toBe(8)
    expect(td.dirty.value).toBe(false)
    expect(toast.success).toHaveBeenCalled()
  })

  it('409 conflict: ошибка conflict, введённое на месте; reload() кладёт мои правки поверх свежей версии', async () => {
    api.getDeclaration.mockResolvedValue(response())
    const td = await start()
    td.draft.transit.destinationPlace = 'Ташкент, склад 2'
    api.saveDeclaration.mockRejectedValue(httpError(409, { code: 'conflict' }))
    expect(await td.save()).toBe(false)
    expect(td.saveError.value).toBe('conflict')
    expect(td.draft.transit.destinationPlace).toBe('Ташкент, склад 2')
    expect(td.dirty.value).toBe(true)

    const theirs = fullData()
    theirs.guarantees = [{ guaranteeTypeCode: '02', amount: 5, currencyCode: 'KZT', number: 'G-2' }]
    api.getDeclaration.mockResolvedValue(response({ version: 9, data: theirs }))
    await td.reload()
    expect(td.version.value).toBe(9)
    expect(td.saveError.value).toBeNull()
    expect(td.draft.transit.destinationPlace).toBe('Ташкент, склад 2')
    expect(td.draft.guarantees[0].number).toBe('G-2')
    expect(td.dirty.value).toBe(true)
  })

  it('409 submitted / archived и 400 — свои коды ошибки', async () => {
    api.getDeclaration.mockResolvedValue(response())
    const td = await start()
    td.draft.transit.destinationPlace = 'x'
    api.saveDeclaration.mockRejectedValueOnce(httpError(409, { code: 'submitted' }))
    await td.save()
    expect(td.saveError.value).toBe('submitted')
    api.saveDeclaration.mockRejectedValueOnce(httpError(409, { code: 'archived' }))
    await td.save()
    expect(td.saveError.value).toBe('archived')
    api.saveDeclaration.mockRejectedValueOnce(httpError(400, { error: 'ТД больше 2 МБ: сократите описания или разделите партию.', errors: { data: ['ТД больше 2 МБ: сократите описания или разделите партию.'] } }))
    await td.save()
    expect(td.saveError.value).toBe('tooLarge')
    api.saveDeclaration.mockRejectedValueOnce(httpError(403))
    await td.save()
    expect(td.saveError.value).toBe('forbidden')
    api.saveDeclaration.mockRejectedValueOnce(new Error('network'))
    await td.save()
    expect(td.saveError.value).toBe('unknown')
  })

  it('правка товаров пересчитывает итоги; загрузка — нет', async () => {
    api.getDeclaration.mockResolvedValue(response())
    const td = await start()
    expect(td.draft.transit.grossWeightKg).toBe(570.5)
    td.draft.goods[0].grossWeightKg = 500
    await nextTick()
    expect(td.draft.transit.grossWeightKg).toBe(650)
  })

  it('404/403 при загрузке — notFound, прочее — loadError', async () => {
    api.getDeclaration.mockRejectedValueOnce(httpError(404))
    const a = await start()
    expect(a.notFound.value).toBe(true)
    scope?.stop()
    api.getDeclaration.mockRejectedValueOnce(httpError(500))
    const b = await start()
    expect(b.loadError.value).toBe(true)
  })

  it('смена партии — перезагрузка', async () => {
    api.getDeclaration.mockResolvedValue(response())
    const party = ref('p1')
    scope = effectScope()
    scope.run(() => useTd(() => 't1', () => party.value))
    await flushPromises()
    party.value = 'p2'
    await flushPromises()
    expect(api.getDeclaration).toHaveBeenLastCalledWith('t1', 'p2')
  })
})

describe('useTd: сверка с сервером 7c905cb', () => {
  it('PUT шлёт всю форму целиком (все разделы, даже пустые) и незнакомые поля data из ответа', async () => {
    const data = { ...fullData({ containers: [] }), futureBlock: { name: 'x' } }
    api.getDeclaration.mockResolvedValue(response({ data: data as never }))
    const td = await start()
    api.saveDeclaration.mockResolvedValue(response())
    await td.save()
    const body = api.saveDeclaration.mock.calls[0][2]
    expect(Object.keys(body.data).sort()).toEqual([
      'cargoOperations', 'carriers', 'containers', 'doc44', 'driver', 'futureBlock', 'goods', 'guarantees', 'identificationMeans', 'organizations',
      'packages', 'packagingType', 'precedingDocs', 'sealNumber', 'transit', 'transportMeans', 'vehicles',
    ])
    expect(body.data.futureBlock).toEqual({ name: 'x' })
    // Старая ТД без машин и водителя: пустой список и null, ЖД-транспорт не тронут.
    expect(body.data.vehicles).toEqual([])
    expect(body.data.driver).toBeNull()
    expect(body.data.transportMeans).toEqual(data.transportMeans)
    expect(body.data.containers).toEqual([])
  })

  it('400 сервера: goods → tooLarge, «больше 2 МБ» → tooLarge, нечитаемые данные → invalid; 403 → forbidden', async () => {
    api.getDeclaration.mockResolvedValue(response())
    const td = await start()
    const bad = (errors: Record<string, string[]>) => httpError(400, { error: Object.values(errors)[0]![0], errors })
    api.saveDeclaration.mockRejectedValueOnce(bad({ goods: ['Не больше 999 товаров в одной ТД.'] }))
    await td.save()
    expect(td.saveError.value).toBe('tooLarge')
    api.saveDeclaration.mockRejectedValueOnce(bad({ data: ['ТД больше 2 МБ: сократите описания или разделите партию.'] }))
    await td.save()
    expect(td.saveError.value).toBe('tooLarge')
    api.saveDeclaration.mockRejectedValueOnce(bad({ data: ['Данные ТД не читаются: проверьте формат полей.'] }))
    await td.save()
    expect(td.saveError.value).toBe('invalid')
    api.saveDeclaration.mockRejectedValueOnce(httpError(403, { error: 'Недостаточно прав для этого действия' }))
    await td.save()
    expect(td.saveError.value).toBe('forbidden')
    api.saveDeclaration.mockRejectedValueOnce(httpError(409, { code: 'submitted', error: '…' }))
    await td.save()
    expect(td.saveError.value).toBe('submitted')
  })

  it('applyCopy: черновик меняется на месте, PUT не зовётся, итоги «Основного» не пересчитываются', async () => {
    api.getDeclaration.mockResolvedValue(response())
    const td = await start()
    const gross = td.draft.transit.grossWeightKg
    const src = fullData({ goods: [{ ...fullData().goods[0]!, grossWeightKg: 1 }] })
    src.organizations = [{ role: 'Получатель', subjectType: null, bin: '1', name: 'Из прошлой', shortName: null, address: null, phone: null, email: null }]
    td.applyCopy(src, true)
    await nextTick()
    await nextTick()
    expect(td.draft.organizations.map((o) => o.name)).toEqual(['Из прошлой'])
    expect(td.draft.goods).toHaveLength(1)
    expect(td.draft.transit.grossWeightKg).toBe(gross)
    expect(td.dirty.value).toBe(true)
    expect(api.saveDeclaration).not.toHaveBeenCalled()
  })

  it('черновик с version 0 (DeclarationRevision) сохраняется с version: 0, а не теряет его', async () => {
    api.getDeclaration.mockResolvedValue(response({ isDraft: true, version: 0 }))
    const td = await start()
    api.saveDeclaration.mockResolvedValue(response({ version: 1 }))
    expect(await td.save()).toBe(true)
    expect(api.saveDeclaration.mock.calls[0][2].version).toBe(0)
    await flushPromises()
    expect(td.version.value).toBe(1)
  })

  it('applyCopy при readOnly ничего не меняет', async () => {
    api.getDeclaration.mockResolvedValue(response({ readOnly: true }))
    const td = await start()
    const before = JSON.stringify(td.draft)
    td.applyCopy(fullData({ organizations: [] }), true)
    expect(JSON.stringify(td.draft)).toBe(before)
  })
})

describe('useTd: машины и водитель (очередь 3)', () => {
  const vehicles = [
    { role: 'tractor', typeCode: '303', regNumber: '123ASD12', countryCode: 'KZ', vin: '-', headIndex: null },
    { role: 'trailer', typeCode: '312', regNumber: '12DS12', countryCode: 'KZ', vin: '-', headIndex: 0 },
  ]
  const driver = { fullName: 'ТЕСТОВ ТЕСТ', countryCode: 'KZ', docKindCode: null, docNumber: 'N0000001', personalNumber: null }
  const withAuto = () => response({ data: { ...fullData(), vehicles, driver } as never })

  it('правка водителя — dirty и «Машины и водитель» в изменённых; PUT несёт vehicles и driver', async () => {
    api.getDeclaration.mockResolvedValue(withAuto())
    const td = await start()
    expect(td.auto.vehicles).toHaveLength(2)
    expect(td.dirty.value).toBe(false)
    td.auto.driver.docNumber = 'N0000002'
    await nextTick()
    expect(td.dirty.value).toBe(true)
    expect(td.changed.value).toEqual(['vehicles'])
    api.saveDeclaration.mockResolvedValue(response({ version: 8, data: { ...fullData(), vehicles, driver: { ...driver, docNumber: 'N0000002' } } as never }))
    await td.save()
    const body = api.saveDeclaration.mock.calls[0][2]
    expect(body.data.vehicles).toEqual(vehicles)
    expect(body.data.driver.docNumber).toBe('N0000002')
    await flushPromises()
    await nextTick()
    expect(td.dirty.value).toBe(false)
  })

  it('«Отменить» возвращает машины и водителя', async () => {
    api.getDeclaration.mockResolvedValue(withAuto())
    const td = await start()
    td.auto.vehicles.splice(1, 1)
    td.auto.driver.fullName = null
    await nextTick()
    td.revert()
    await nextTick()
    expect(td.auto.vehicles).toHaveLength(2)
    expect(td.auto.driver.fullName).toBe('ТЕСТОВ ТЕСТ')
    expect(td.dirty.value).toBe(false)
  })

  it('409 conflict → «Обновить»: свои правки машин остаются поверх свежей версии', async () => {
    api.getDeclaration.mockResolvedValue(withAuto())
    const td = await start()
    td.auto.vehicles[0]!.countryCode = 'CN'
    api.saveDeclaration.mockRejectedValue(httpError(409, { code: 'conflict' }))
    await td.save()
    api.getDeclaration.mockResolvedValue(response({ version: 9, data: { ...fullData(), vehicles, driver: { ...driver, personalNumber: '900101300000' } } as never }))
    await td.reload()
    await flushPromises()
    expect(td.auto.vehicles[0]!.countryCode).toBe('CN')
    // Чужая правка водителя пришла: свои правки водителя не трогали.
    expect(td.auto.driver.personalNumber).toBe('900101300000')
    expect(td.version.value).toBe(9)
    expect(td.dirty.value).toBe(true)
  })

  it('копия с прошлой ТД машины и водителя не трогает', async () => {
    api.getDeclaration.mockResolvedValue(withAuto())
    const td = await start()
    td.applyCopy({ ...fullData(), vehicles: [], driver: null } as never, false)
    expect(td.auto.vehicles).toHaveLength(2)
    expect(td.auto.driver.fullName).toBe('ТЕСТОВ ТЕСТ')
  })

  it('расхождение итогов — по текущим товарам формы', async () => {
    const totalsCheck = { places: { goods: 3, party: 3 }, grossKg: { goods: 15.5, party: 15.5 }, value: { goods: 10, party: 10 } }
    const data = fullData()
    api.getDeclaration.mockResolvedValue(response({ data, totalsCheck }))
    const td = await start()
    td.draft.goods.splice(0, td.draft.goods.length,
      { ...data.goods[0]!, packagesCount: 3, grossWeightKg: 15.5, customsValue: 10 })
    await nextTick()
    expect(td.totals.value).toEqual([])
    td.draft.goods[0]!.grossWeightKg = 16
    await nextTick()
    expect(td.totals.value).toEqual([{ key: 'grossKg', goods: 16, party: 15.5, diff: 0.5 }])
  })
})
