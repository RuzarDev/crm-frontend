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

  it('kedenUsage — тихий: сбой подписи использования не даёт тоста', async () => {
    await prohibitionCodesApi.kedenUsage()
    expect(client.get).toHaveBeenLastCalledWith('/ref/prohibition-codes/keden-usage', { silent: true })
  })
})
