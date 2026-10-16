import { describe, expect, it, vi } from 'vitest'

const client = vi.hoisted(() => ({ get: vi.fn().mockResolvedValue({ data: [] }), post: vi.fn().mockResolvedValue({ data: {} }), put: vi.fn().mockResolvedValue({ data: {} }) }))
vi.mock('@/api/client', () => ({ default: client }))

import { referencesApi } from '@/api/references'
import { prohibitionCodesApi } from '@/api/prohibitionCodes'

// Экраны со своей ошибкой на странице или в окне просят запрос без общего тоста (silent); без opts вызов прежний.
describe('referencesApi / prohibitionCodesApi: silent', () => {
  it('getDtGuide — silent по запросу, без opts прежний вызов', async () => {
    await referencesApi.getDtGuide({ silent: true })
    expect(client.get).toHaveBeenLastCalledWith('/ref/dt-guide', { silent: true })
    await referencesApi.getDtGuide()
    expect(client.get.mock.lastCall).toEqual(['/ref/dt-guide', undefined])
  })

  it('createClassifier / updateClassifier — silent по запросу (409 показывает окно)', async () => {
    await referencesApi.createClassifier('2009', 'A1', 'Имя', 0, { silent: true })
    expect(client.post).toHaveBeenLastCalledWith('/ref/classifiers', { classifierCode: '2009', code: 'A1', nameRu: 'Имя', sortOrder: 0 }, { silent: true })
    await referencesApi.updateClassifier('7', 'A1', 'Имя', 3, true, { silent: true })
    expect(client.put).toHaveBeenLastCalledWith('/ref/classifiers/7', { code: 'A1', nameRu: 'Имя', sortOrder: 3, isActive: true }, { silent: true })
    await referencesApi.createClassifier('2009', 'A1', 'Имя')
    expect(client.post.mock.lastCall![2]).toBeUndefined()
    await referencesApi.updateClassifier('7', 'A1', 'Имя', 3, true)
    expect(client.put.mock.lastCall![2]).toBeUndefined()
  })

  it('подсказки гр. 33: ответ кэшируется на сессию, старый кэш сервера (КЕДЕН не ответил) — нет', async () => {
    const answer = (stale: boolean) => ({ data: { tnved: '1111111111', codes: [], fetchedAtUtc: null, stale, warning: null } })
    client.get.mockClear()
    client.get.mockResolvedValueOnce(answer(true)).mockResolvedValueOnce(answer(false))
    expect((await prohibitionCodesApi.suggest('1111111111')).stale).toBe(true)
    expect((await prohibitionCodesApi.suggest('1111111111')).stale).toBe(false)
    await prohibitionCodesApi.suggest('1111111111')
    expect(client.get).toHaveBeenCalledTimes(2)
  })

  it('listClassifiersBatch — один GET с кодами через запятую, без тоста (стор сам догрузит по одному)', async () => {
    await referencesApi.listClassifiersBatch(['2004', 'pref-fee'])
    expect(client.get).toHaveBeenLastCalledWith('/ref/classifiers/batch', { params: { codes: '2004,pref-fee' }, silent: true })
  })

  it('kedenUsage — тихий: сбой подписи использования не даёт тоста', async () => {
    await prohibitionCodesApi.kedenUsage()
    expect(client.get).toHaveBeenLastCalledWith('/ref/prohibition-codes/keden-usage', { silent: true })
  })

  it('гр. 33 по редакции Приказа № 259: дата уходит в запрос и в ключ кэша; без даты — прежний вызов', async () => {
    client.get.mockClear()
    client.get.mockResolvedValue({ data: { tnved: '2222222222', codes: [], fetchedAtUtc: null, stale: false, warning: null } })
    await prohibitionCodesApi.suggest('2222222222')
    expect(client.get).toHaveBeenLastCalledWith('/ref/prohibition-codes/suggest', { params: { tnved: '2222222222' }, timeout: 30000, silent: true })
    await prohibitionCodesApi.suggest('2222222222', '2026-11-02')
    expect(client.get).toHaveBeenLastCalledWith('/ref/prohibition-codes/suggest', { params: { tnved: '2222222222', date: '2026-11-02' }, timeout: 30000, silent: true })
    await prohibitionCodesApi.suggest('2222222222', '2026-11-02')
    expect(client.get).toHaveBeenCalledTimes(2)

    client.get.mockResolvedValue({ data: [] })
    await prohibitionCodesApi.list()
    expect(client.get).toHaveBeenLastCalledWith('/ref/prohibition-codes', { silent: true })
    await prohibitionCodesApi.list('2026-11-02')
    expect(client.get).toHaveBeenLastCalledWith('/ref/prohibition-codes', { params: { date: '2026-11-02' }, silent: true })

    client.get.mockResolvedValue({ data: '' }) // 204 — редакции нет
    expect(await prohibitionCodesApi.editionStatus()).toBeNull()
    expect(client.get).toHaveBeenLastCalledWith('/ref/prohibition-codes/edition-status', { silent: true })
    client.get.mockResolvedValue({ data: [] })
    await prohibitionCodesApi.editionDiff()
    expect(client.get).toHaveBeenLastCalledWith('/ref/prohibition-codes/edition-diff', { silent: true })
  })
})
