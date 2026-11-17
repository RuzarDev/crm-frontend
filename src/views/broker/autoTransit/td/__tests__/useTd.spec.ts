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
    api.saveDeclaration.mockRejectedValueOnce(httpError(400, { errors: { data: ['too big'] } }))
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
