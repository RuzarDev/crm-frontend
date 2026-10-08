import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref, type EffectScope } from 'vue'
import { flushPromises } from '@vue/test-utils'
import type { ReestrEntry } from '@/types/api'
import { reestrEntryToUpsertBody } from '@/utils/reestrDtoMap'
import { fullEntry, good } from './recordFixture'

const api = vi.hoisted(() => ({ getById: vi.fn(), create: vi.fn(), update: vi.fn() }))
vi.mock('@/api/reestr', () => ({ reestrApi: api }))
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
vi.mock('@/ui/message', () => ({ message: toast }))

import { useTransitRecord } from '../useTransitRecord'

let scope: EffectScope
const start = (id = 'r1') => {
  scope = effectScope()
  const idRef = ref(id)
  const r = scope.run(() => useTransitRecord(() => idRef.value))!
  return { r, idRef }
}
/** Загрузка + снимок (он делается после nextTick). */
const settle = async () => {
  await flushPromises()
  await nextTick()
}
const httpError = (status: number, data?: unknown) => Object.assign(new Error(`HTTP ${status}`), { response: { status, data } })
const deferred = <T>() => {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

let stored: Record<string, ReestrEntry>
beforeEach(() => {
  stored = { r1: fullEntry(), r2: fullEntry({ id: 'r2', clientId: 'c2', data: { ...fullEntry().data, '№': 'R2' } }) }
  api.getById.mockImplementation(async (id: string) => {
    if (!stored[id]) throw httpError(404)
    return structuredClone(stored[id])
  })
  api.update.mockResolvedValue(undefined)
  api.create.mockResolvedValue({ id: 'new-id' })
})
afterEach(() => {
  scope?.stop()
  vi.clearAllMocks()
})

describe('useTransitRecord — загрузка', () => {
  it('грузит полную запись без тоста; черновик и клиент — из неё; правок нет', async () => {
    const { r } = start()
    expect(r.loading.value).toBe(true)
    await settle()
    expect(api.getById).toHaveBeenCalledWith('r1', { silent: true })
    expect(r.loading.value).toBe(false)
    expect(r.entry.value?.id).toBe('r1')
    expect(r.clientId.value).toBe('c1')
    expect(r.draft.fields['Пост']).toBe('57507 — ТП «Сарыагаш»')
    expect(r.draft.goods).toHaveLength(2)
    expect(r.dirty.value).toBe(false)
    expect(r.changed.value).toEqual([])
  })

  it('404 → «не найдена»', async () => {
    const { r } = start('missing')
    await settle()
    expect(r.notFound.value).toBe(true)
    expect(r.loadError.value).toBe(false)
    expect(r.loading.value).toBe(false)
  })

  it('прочая ошибка → loadError; load() повторяет', async () => {
    api.getById.mockRejectedValueOnce(httpError(500))
    const { r } = start()
    await settle()
    expect(r.loadError.value).toBe(true)
    expect(r.notFound.value).toBe(false)
    await r.load()
    await nextTick()
    expect(r.loadError.value).toBe(false)
    expect(r.entry.value?.id).toBe('r1')
    expect(api.getById).toHaveBeenCalledTimes(2)
  })

  it("'new' — без запроса: запись null, черновик по умолчанию, клиента нет", async () => {
    const { r } = start('new')
    await settle()
    expect(api.getById).not.toHaveBeenCalled()
    expect(r.loading.value).toBe(false)
    expect(r.entry.value).toBeNull()
    expect(r.clientId.value).toBeNull()
    expect(r.draft.transit.purposeCode).toBe('06')
    expect(r.draft.goods).toEqual([])
    expect(r.dirty.value).toBe(false)
  })

  it('смена id — полная перезагрузка, ошибки сбрасываются; пустой id — без запроса', async () => {
    const { r, idRef } = start()
    await settle()
    r.draft.fields['Груз'] = 'правка'
    r.saveError.value = 'старая ошибка'
    idRef.value = 'r2'
    await settle()
    expect(api.getById).toHaveBeenLastCalledWith('r2', { silent: true })
    expect(r.entry.value?.id).toBe('r2')
    expect(r.draft.fields['№']).toBe('R2')
    expect(r.draft.fields['Груз']).toBe('Ноутбуки')
    expect(r.clientId.value).toBe('c2')
    expect(r.saveError.value).toBeNull()
    expect(r.dirty.value).toBe(false)

    idRef.value = ''
    await settle()
    expect(api.getById).toHaveBeenCalledTimes(2)
  })

  it('ответ устаревшего запроса отбрасывается', async () => {
    const slow = deferred<ReestrEntry>()
    api.getById.mockImplementationOnce(() => slow.promise)
    const { r, idRef } = start()
    idRef.value = 'r2'
    await settle()
    slow.resolve(fullEntry({ id: 'r1' }))
    await settle()
    expect(r.entry.value?.id).toBe('r2')
  })
})

describe('useTransitRecord — правки', () => {
  it('dirty и разделы после правки; revert возвращает черновик', async () => {
    const { r } = start()
    await settle()
    r.draft.organizations[0].name = 'Другое'
    r.draft.fields['Пост'] = '57508'
    expect(r.dirty.value).toBe(true)
    expect(r.changed.value).toEqual(['main', 'organizations'])
    r.revert()
    await nextTick()
    expect(r.dirty.value).toBe(false)
    expect(r.draft.organizations[0].name).toBe('ТОО Брокер')
    expect(r.draft.fields['Пост']).toBe('57507 — ТП «Сарыагаш»')
    // revert не делает черновик общим со снимком: следующая правка снова видна
    r.draft.organizations[0].name = 'Ещё'
    expect(r.dirty.value).toBe(true)
  })

  it('итоги не пересчитываются при загрузке (сохранённые значения остаются), а при правке товаров — да', async () => {
    stored.r1 = fullEntry({ transit: { ...fullEntry().transit, goodsQuantity: 7, cargoPlacesCount: 11, grossWeightKg: 9000, totalValue: 1 } })
    const { r } = start()
    await settle()
    expect(r.draft.transit.grossWeightKg).toBe(9000)
    expect(r.dirty.value).toBe(false)

    r.draft.goods[0].grossWeightKg = 400.5 // 400,5 + 150
    await nextTick()
    expect(r.draft.transit.grossWeightKg).toBe(550.5)
    // изменился только вес — ручные значения остальных итогов остаются
    expect(r.draft.transit.cargoPlacesCount).toBe(11)
    expect(r.draft.transit.goodsQuantity).toBe(7)
    expect(r.draft.transit.totalValue).toBe(1)

    r.draft.goods.push(good({ packagesCount: 4 }))
    await nextTick()
    expect(r.draft.transit.goodsQuantity).toBe(3)
    expect(r.draft.transit.cargoPlacesCount).toBe(40)
  })

  it('пустой список товаров итоги не трогает; revert и reload — не правка товаров', async () => {
    const { r } = start()
    await settle()
    r.draft.goods.splice(0)
    await nextTick()
    expect(r.draft.transit).toMatchObject({ goodsQuantity: 2, cargoPlacesCount: 36, grossWeightKg: 570.5, totalValue: 27700 })

    r.revert()
    await nextTick()
    expect(r.draft.goods).toHaveLength(2)
    expect(r.draft.transit.grossWeightKg).toBe(570.5)
    stored.r1 = fullEntry({ goods: [good({ grossWeightKg: 1 })] })
    await r.reload()
    await nextTick()
    expect(r.draft.goods).toHaveLength(1)
    expect(r.draft.transit.grossWeightKg).toBe(570.5)
    expect(r.dirty.value).toBe(false)
  })

  it('reload — новая точка отсчёта; несохранённые правки остаются, остальное — с сервера (смена статуса)', async () => {
    const { r } = start()
    await settle()
    r.draft.fields['Груз'] = 'моя правка'
    stored.r1 = fullEntry({ status: 2, data: { ...fullEntry().data, 'Подкод': '99' } })
    await r.reload()
    await nextTick()
    expect(r.entry.value?.status).toBe(2)
    expect(r.draft.fields['Подкод']).toBe('99')
    expect(r.draft.fields['Груз']).toBe('моя правка')
    expect(r.changed.value).toEqual(['row'])
    r.revert()
    expect(r.draft.fields['Груз']).toBe('Ноутбуки')
    expect(r.draft.fields['Подкод']).toBe('99')
    expect(r.dirty.value).toBe(false)
    // PUT уходит с новым статусом записи, а не с тем, что был при открытии
    r.draft.fields['Груз'] = 'x'
    await r.save()
    expect(api.update.mock.calls[0][1].status).toBe(2)
  })

  it('reload не удался — запись и правки на месте, сохранять нельзя; повтор reload() сливает и снимает запрет', async () => {
    const { r } = start()
    await settle()
    r.draft.fields['Груз'] = 'моя правка'
    api.getById.mockRejectedValueOnce(httpError(500))
    await r.reload()
    expect(r.reloadError.value).toBe(true)
    expect(r.loadError.value).toBe(false)
    expect(r.entry.value?.id).toBe('r1')
    expect(r.draft.fields['Груз']).toBe('моя правка')
    expect(r.dirty.value).toBe(true)

    expect(await r.save()).toBeNull()
    expect(api.update).not.toHaveBeenCalled()
    expect(r.saveError.value).toContain('Не удалось обновить запись')

    stored.r1 = fullEntry({ status: 2 })
    await r.reload()
    await nextTick()
    expect(r.reloadError.value).toBe(false)
    expect(r.entry.value?.status).toBe(2)
    expect(r.draft.fields['Груз']).toBe('моя правка')
    expect(await r.save()).toBe('r1')
    expect(api.update.mock.calls[0][1]).toMatchObject({ status: 2, cargoDescription: 'моя правка' })
  })

  it('успешный reload снимает устаревшую ошибку сохранения (плашка «не удалось обновить» не висит после повтора)', async () => {
    const { r } = start()
    await settle()
    r.draft.fields['Груз'] = 'моя правка'
    api.getById.mockRejectedValueOnce(httpError(500))
    await r.reload()
    await r.save()
    expect(r.saveError.value).toContain('Не удалось обновить запись')
    await r.reload()
    expect(r.reloadError.value).toBe(false)
    expect(r.saveError.value).toBeNull()
    expect(r.draft.fields['Груз']).toBe('моя правка')
  })

  it('«Повторить» через load() на той же записи с правками — тоже без потери правок', async () => {
    const { r } = start()
    await settle()
    r.draft.fields['Груз'] = 'моя правка'
    api.getById.mockRejectedValueOnce(httpError(502))
    await r.reload()
    expect(r.reloadError.value).toBe(true)
    await r.load()
    await nextTick()
    expect(r.reloadError.value).toBe(false)
    expect(r.loading.value).toBe(false)
    expect(r.draft.fields['Груз']).toBe('моя правка')
    expect(r.dirty.value).toBe(true)
  })

  it.each([404, 403])('reload: %i → «не найдена», как при загрузке; сохранять нельзя', async (code) => {
    const { r } = start()
    await settle()
    r.draft.fields['Груз'] = 'x'
    api.getById.mockRejectedValueOnce(httpError(code))
    await r.reload()
    expect(r.notFound.value).toBe(true)
    expect(await r.save()).toBeNull()
    expect(api.update).not.toHaveBeenCalled()
    expect(r.saveError.value).toContain('Запись не загружена')
  })

  it('reload новой несохранённой записи — без запроса', async () => {
    const { r } = start('new')
    await settle()
    await r.reload()
    expect(api.getById).not.toHaveBeenCalled()
  })
})

describe('useTransitRecord — сохранение', () => {
  it('шлёт полное тело (исходная запись + правки), затем перечитывает; правок больше нет', async () => {
    const { r } = start()
    await settle()
    r.draft.goods[1].description = 'Блоки питания 65 Вт'
    const expected = reestrEntryToUpsertBody({ ...fullEntry(), goods: [fullEntry().goods[0], { ...fullEntry().goods[1], description: 'Блоки питания 65 Вт' }] })
    api.update.mockImplementationOnce(async (_id: string, body) => {
      stored.r1 = fullEntry({ goods: body.goodsItems })
    })
    const id = await r.save()
    expect(id).toBe('r1')
    expect(api.update).toHaveBeenCalledTimes(1)
    expect(api.update.mock.calls[0][0]).toBe('r1')
    expect(api.update.mock.calls[0][1]).toEqual(expected)
    expect(toast.success).toHaveBeenCalledWith('Запись успешно обновлена')
    expect(api.getById).toHaveBeenCalledTimes(2)
    await nextTick()
    expect(r.dirty.value).toBe(false)
    expect(r.saving.value).toBe(false)
    expect(r.saveError.value).toBeNull()
    expect(r.draft.goods[1].description).toBe('Блоки питания 65 Вт')
  })

  it('ошибка сервера → saveError с текстом сервера, черновик цел, null', async () => {
    const { r } = start()
    await settle()
    r.draft.fields['Груз'] = 'новый груз'
    api.update.mockRejectedValueOnce(httpError(400, { error: 'Код ТН ВЭД не найден' }))
    const id = await r.save()
    expect(id).toBeNull()
    expect(r.saveError.value).toBe('Код ТН ВЭД не найден')
    expect(r.saveErrorLocal.value).toBe(false)
    expect(r.draft.fields['Груз']).toBe('новый груз')
    expect(r.dirty.value).toBe(true)
    expect(r.saving.value).toBe(false)
    expect(api.getById).toHaveBeenCalledTimes(1)
  })

  it('нет связи → «нет связи с сервером»; следующий успешный save снимает ошибку', async () => {
    const { r } = start()
    await settle()
    r.draft.fields['Груз'] = 'x'
    api.update.mockRejectedValueOnce(new Error('Network Error'))
    await r.save()
    expect(r.saveError.value).toBe('нет связи с сервером')
    await r.save()
    expect(r.saveError.value).toBeNull()
  })

  it('ошибки проверки → saveError текстом, без запроса', async () => {
    const { r } = start('new')
    await settle()
    const id = await r.save()
    expect(id).toBeNull()
    expect(api.create).not.toHaveBeenCalled()
    expect(r.saveError.value).toContain('Заполните хотя бы одно из полей')
    expect(r.saveError.value).toContain('Выберите клиента')
    // Проверка на месте, не ответ сервера: страница показывает текст как есть.
    expect(r.saveErrorLocal.value).toBe(true)
  })

  it('повторное нажатие во время сохранения — один запрос', async () => {
    const { r } = start()
    await settle()
    r.draft.fields['Груз'] = 'x'
    const d = deferred<void>()
    api.update.mockImplementationOnce(() => d.promise)
    const first = r.save()
    expect(r.saving.value).toBe(true)
    const second = await r.save()
    expect(second).toBeNull()
    d.resolve()
    expect(await first).toBe('r1')
    expect(api.update).toHaveBeenCalledTimes(1)
  })

  it("'new' → create с клиентом; возвращает новый id и перечитывает его; переход на этот id не грузит повторно", async () => {
    const { r, idRef } = start('new')
    await settle()
    r.clientId.value = 'c7'
    r.draft.fields['Контейнер'] = 'MSKU1234567'
    api.create.mockImplementationOnce(async (body) => {
      stored['new-id'] = fullEntry({ id: 'new-id', clientId: body.clientId, status: 0, data: { 'Контейнер': body.container } })
      return { id: 'new-id' }
    })
    const id = await r.save()
    expect(id).toBe('new-id')
    expect(api.create).toHaveBeenCalledTimes(1)
    const body = api.create.mock.calls[0][0]
    expect(body).toMatchObject({ clientId: 'c7', container: 'MSKU1234567', status: 0, purposeCode: '06', grandTotalWithVat: null })
    expect(toast.success).toHaveBeenCalledWith('Запись успешно создана')
    expect(api.getById).toHaveBeenCalledWith('new-id', { silent: true })
    expect(r.entry.value?.id).toBe('new-id')
    await nextTick()
    expect(r.dirty.value).toBe(false)

    idRef.value = 'new-id' // страница меняет адрес на /reestr/new-id
    await settle()
    expect(api.getById).toHaveBeenCalledTimes(1)

    r.draft.fields['Груз'] = 'x'
    await r.save()
    expect(api.update).toHaveBeenCalledWith('new-id', expect.objectContaining({ cargoDescription: 'x' }))
    expect(api.create).toHaveBeenCalledTimes(1)
  })

  it('правки, сделанные пока шёл запрос, остаются несохранёнными; остальное — с сервера', async () => {
    const { r } = start()
    await settle()
    r.draft.fields['Груз'] = '  с пробелами  '
    const d = deferred<void>()
    api.update.mockImplementationOnce(async (_id: string, body) => {
      await d.promise
      stored.r1 = fullEntry({ data: { ...fullEntry().data, 'Груз': body.cargoDescription } })
    })
    const saving = r.save()
    r.draft.fields['Подкод'] = 'введено во время сохранения'
    d.resolve()
    await saving
    await nextTick()
    expect(r.draft.fields['Груз']).toBe('с пробелами') // нормализовано сервером, не «грязное»
    expect(r.draft.fields['Подкод']).toBe('введено во время сохранения')
    expect(r.changed.value).toEqual(['row'])
  })

  it('без загруженной записи (ошибка загрузки) save ничего не создаёт и объясняет почему', async () => {
    api.getById.mockRejectedValueOnce(httpError(500))
    const { r } = start()
    await settle()
    r.draft.fields['№'] = '1'
    expect(await r.save()).toBeNull()
    expect(api.create).not.toHaveBeenCalled()
    expect(api.update).not.toHaveBeenCalled()
    expect(r.saveError.value).toBe('Запись не загружена — сохранить нельзя. Обновите страницу.')
  })

  it('переход на другую запись во время сохранения: новая загружается как обычно, старая её не трогает', async () => {
    const { r, idRef } = start()
    await settle()
    r.draft.fields['Груз'] = 'правка A'
    const put = deferred<void>()
    api.update.mockImplementationOnce(() => put.promise)
    const getB = deferred<ReestrEntry>()
    api.getById.mockImplementationOnce(() => getB.promise)
    const saving = r.save()
    idRef.value = 'r2'
    await nextTick()
    put.resolve()
    expect(await saving).toBe('r1')
    getB.resolve(structuredClone(stored.r2))
    await settle()
    expect(r.entry.value?.id).toBe('r2')
    expect(r.loading.value).toBe(false)
    expect(r.saving.value).toBe(false)
    expect(r.draft.fields['№']).toBe('R2')
    expect(r.draft.fields['Груз']).toBe('Ноутбуки')
    expect(r.dirty.value).toBe(false)
    expect(api.getById).not.toHaveBeenCalledWith('r1', expect.anything(), expect.anything())
    expect(api.getById).toHaveBeenCalledTimes(2) // r1 при открытии, r2 — без перечитывания r1
  })

  it('сохранение старой записи упало после перехода — ошибка не показывается на новой', async () => {
    const { r, idRef } = start()
    await settle()
    r.draft.fields['Груз'] = 'x'
    const put = deferred<void>()
    api.update.mockImplementationOnce(() => put.promise)
    const saving = r.save()
    idRef.value = 'r2'
    await settle()
    put.reject(httpError(500, { error: 'boom' }))
    expect(await saving).toBeNull()
    expect(r.saveError.value).toBeNull()
    expect(r.saving.value).toBe(false)
    expect(r.entry.value?.id).toBe('r2')
  })

  it('сохранено, но перечитать не удалось — правок нет, следующий save обновляет ту же запись', async () => {
    const { r } = start('new')
    await settle()
    r.clientId.value = 'c7'
    r.draft.fields['№'] = '5'
    api.getById.mockRejectedValueOnce(httpError(500))
    expect(await r.save()).toBe('new-id')
    await nextTick()
    expect(r.dirty.value).toBe(false)
    expect(r.loadError.value).toBe(false)
    expect(r.entry.value?.id).toBe('new-id')

    r.draft.fields['Груз'] = 'x'
    await r.save()
    expect(api.create).toHaveBeenCalledTimes(1)
    expect(api.update).toHaveBeenCalledWith('new-id', expect.objectContaining({ rowNumber: '5', cargoDescription: 'x', clientId: 'c7' }))
  })
})

describe('useTransitRecord — смена статуса и сохранение (итоговое ревью I1)', () => {
  it('сохранение во время перечитывания ждёт его: PUT уходит со свежим статусом, правки на месте', async () => {
    const { r } = start()
    await settle()
    r.draft.fields['Груз'] = 'моя правка'
    const get = deferred<ReestrEntry>()
    api.getById.mockImplementationOnce(() => get.promise)
    const reloading = r.reload()
    expect(r.reloading.value).toBe(true)
    const saving = r.save()
    await flushPromises()
    expect(api.update).not.toHaveBeenCalled()
    expect(r.saving.value).toBe(true)
    stored.r1 = fullEntry({ status: 2 })
    get.resolve(structuredClone(stored.r1))
    await reloading
    expect(await saving).toBe('r1')
    expect(api.update).toHaveBeenCalledTimes(1)
    expect(api.update.mock.calls[0][1]).toMatchObject({ status: 2, cargoDescription: 'моя правка' })
    expect(r.reloading.value).toBe(false)
    expect(r.saving.value).toBe(false)
  })

  it('перечитывание во время ожидания не удалось — сохранение отказывает (основа устарела), PUT не уходит', async () => {
    const { r } = start()
    await settle()
    r.draft.fields['Груз'] = 'моя правка'
    const get = deferred<ReestrEntry>()
    api.getById.mockImplementationOnce(() => get.promise)
    void r.reload()
    const saving = r.save()
    get.reject(httpError(500))
    expect(await saving).toBeNull()
    expect(api.update).not.toHaveBeenCalled()
    expect(r.reloadError.value).toBe(true)
    expect(r.saveError.value).toContain('Не удалось обновить запись')
    expect(r.reloading.value).toBe(false)
  })

  it('перечитывание, начатое во время сохранения: флаг снимается, итог — с сервера после PUT', async () => {
    const { r } = start()
    await settle()
    r.draft.fields['Груз'] = 'моя правка'
    const put = deferred<void>()
    api.update.mockImplementationOnce(async (_id: string, body) => {
      await put.promise
      stored.r1 = fullEntry({ status: 2, data: { ...fullEntry().data, 'Груз': body.cargoDescription } })
    })
    const saving = r.save()
    const reloading = r.reload()
    expect(r.reloading.value).toBe(true)
    await reloading
    expect(r.reloading.value).toBe(false)
    put.resolve()
    expect(await saving).toBe('r1')
    await nextTick()
    expect(r.entry.value?.status).toBe(2)
    expect(r.draft.fields['Груз']).toBe('моя правка')
    expect(r.dirty.value).toBe(false)
  })

  it('перечитывание после смены id не держит сохранение: оно ничего не шлёт для новой записи', async () => {
    const { r, idRef } = start()
    await settle()
    r.draft.fields['Груз'] = 'моя правка'
    const get = deferred<ReestrEntry>()
    api.getById.mockImplementationOnce(() => get.promise)
    void r.reload()
    const saving = r.save()
    idRef.value = 'r2'
    await settle()
    get.resolve(structuredClone(stored.r1))
    expect(await saving).toBeNull()
    expect(api.update).not.toHaveBeenCalled()
    expect(r.entry.value?.id).toBe('r2')
    expect(r.saving.value).toBe(false)
  })
})

describe('useTransitRecord — строки остаются теми же объектами (итоговое ревью T4)', () => {
  it('после сохранения: те же массивы и объекты строк; значения — с сервера; правок нет', async () => {
    const { r } = start()
    await settle()
    const goods = r.draft.goods
    const [g0, g1] = r.draft.goods
    const org0 = r.draft.organizations[0]
    const doc0 = r.draft.doc44[0]
    const fields = r.draft.fields
    r.draft.goods[1].description = 'Блоки питания 65 Вт'
    api.update.mockImplementationOnce(async (_id: string, body) => {
      stored.r1 = fullEntry({ goods: body.goodsItems, organizations: [{ ...fullEntry().organizations[0], name: 'ТОО БРОКЕР' }] })
    })
    expect(await r.save()).toBe('r1')
    await nextTick()
    expect(r.draft.goods).toBe(goods)
    expect(r.draft.goods[0]).toBe(g0)
    expect(r.draft.goods[1]).toBe(g1)
    expect(r.draft.organizations[0]).toBe(org0)
    expect(r.draft.organizations[0].name).toBe('ТОО БРОКЕР')
    expect(r.draft.doc44[0]).toBe(doc0)
    expect(r.draft.fields).toBe(fields)
    expect(r.draft.goods[1].description).toBe('Блоки питания 65 Вт')
    expect(r.dirty.value).toBe(false)
  })

  it('reload: длина списков меняется push/splice, старые поля с переиспользованных строк удаляются', async () => {
    // У строки с сервера было поле, которого в свежем ответе нет (например, старое tnvedInvalid).
    stored.r1 = fullEntry({ goods: [{ ...fullEntry().goods[0], tnvedInvalid: true } as never, fullEntry().goods[1]] })
    const { r } = start()
    await settle()
    const g0 = r.draft.goods[0]
    expect('tnvedInvalid' in g0).toBe(true)
    const containers = r.draft.containers
    stored.r1 = fullEntry({
      goods: [fullEntry().goods[1]],
      containers: [...fullEntry().containers, { containerNumber: 'MSKU1234567', note: null }],
    })
    await r.reload()
    await nextTick()
    expect(r.draft.goods).toHaveLength(1)
    expect(r.draft.goods[0]).toBe(g0)
    expect(r.draft.goods[0]).toEqual(fullEntry().goods[1])
    expect('tnvedInvalid' in r.draft.goods[0]).toBe(false)
    expect(r.draft.containers).toBe(containers)
    expect(r.draft.containers).toHaveLength(2)
    expect(r.draft.containers[1]).toEqual({ containerNumber: 'MSKU1234567', note: null })
    expect(r.dirty.value).toBe(false)
  })

  it('порядок полей строки — как у сервера: правка в другом разделе не помечает этот раздел изменённым', async () => {
    const { r } = start()
    await settle()
    // Строка, добавленная на странице, с другим порядком ключей, чем отдаёт сервер.
    r.draft.containers.push({ note: null, containerNumber: 'MSKU1234567' } as never)
    const added = r.draft.containers[1]
    api.update.mockImplementationOnce(async (_id: string, body) => {
      await Promise.resolve()
      stored.r1 = fullEntry({ containers: body.containers })
    })
    const saving = r.save()
    r.draft.fields['Подкод'] = 'введено во время сохранения'
    await saving
    await nextTick()
    expect(r.draft.containers[1]).toBe(added)
    expect(Object.keys(r.draft.containers[1])).toEqual(Object.keys(stored.r1.containers[1]))
    expect(r.changed.value).toEqual(['row'])
  })

  it('«Отменить» тоже сохраняет объекты строк и возвращает значения и состав', async () => {
    const { r } = start()
    await settle()
    const g0 = r.draft.goods[0]
    r.draft.goods[0].description = 'правка'
    r.draft.goods.splice(1, 1)
    r.revert()
    await nextTick()
    expect(r.draft.goods[0]).toBe(g0)
    expect(r.draft.goods[0].description).toBe('Ноутбуки')
    expect(r.draft.goods).toHaveLength(2)
    expect(r.dirty.value).toBe(false)
  })

  it('открытие другой записи — новые объекты (раздел товаров разворачивает первую карточку заново)', async () => {
    const { r, idRef } = start()
    await settle()
    const goods = r.draft.goods
    idRef.value = 'r2'
    await settle()
    expect(r.draft.goods).not.toBe(goods)
  })
})
