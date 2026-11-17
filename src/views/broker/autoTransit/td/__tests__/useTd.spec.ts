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
    const data = { ...fullData({ containers: [] }), driver: { name: 'Ван Лэй' } }
    api.getDeclaration.mockResolvedValue(response({ data: data as never }))
    const td = await start()
    api.saveDeclaration.mockResolvedValue(response())
    await td.save()
    const body = api.saveDeclaration.mock.calls[0][2]
    expect(Object.keys(body.data).sort()).toEqual([
      'cargoOperations', 'carriers', 'containers', 'doc44', 'driver', 'goods', 'guarantees', 'identificationMeans', 'organizations',
      'packages', 'packagingType', 'precedingDocs', 'sealNumber', 'transit', 'transportMeans',
    ])
    expect(body.data.driver).toEqual({ name: 'Ван Лэй' })
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
