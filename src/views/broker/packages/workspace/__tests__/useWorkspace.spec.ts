import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, type EffectScope } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { container, pkg } from '../../partia/__tests__/packageFixture'
import { httpError } from './harness'

const api = vi.hoisted(() => ({ getById: vi.fn(), deleteContainer: vi.fn(), uploadFile: vi.fn() }))
vi.mock('@/api/documentPackages', () => ({ documentPackagesApi: api }))

import { useWorkspace } from '../useWorkspace'

// Мутации «Разбора поезда»: ошибку HTTP показал перехватчик — она гасится (false); любая другая (ошибка кода)
// не прячется, а уходит наверх. Занятость при этом снимается.
let scope: EffectScope | null = null
const start = async () => {
  api.getById.mockResolvedValue(pkg())
  scope = effectScope()
  const ws = scope.run(() => useWorkspace(() => 'pkg1'))!
  await flushPromises()
  return ws
}
afterEach(() => {
  scope?.stop()
  scope = null
  vi.clearAllMocks()
})

describe('useWorkspace: run()', () => {
  it('ошибка HTTP (ответ сервера или нет связи) — false, без исключения', async () => {
    const ws = await start()
    api.deleteContainer.mockRejectedValueOnce(httpError(409))
    expect(await ws.deleteContainer('c1')).toBe(false)
    api.deleteContainer.mockRejectedValueOnce(Object.assign(new Error('Network Error'), { isAxiosError: true }))
    expect(await ws.deleteContainer('c1')).toBe(false)
    expect(ws.isPending('container-delete:c1')).toBe(false)
  })

  it('не HTTP (ошибка кода) — не глотается; занятость снимается', async () => {
    const ws = await start()
    api.deleteContainer.mockRejectedValueOnce(new TypeError('boom'))
    await expect(ws.deleteContainer('c1')).rejects.toThrow('boom')
    expect(ws.isPending('container-delete:c1')).toBe(false)
    api.deleteContainer.mockResolvedValueOnce(pkg({ containers: [container({ id: 'c2' })] }))
    expect(await ws.deleteContainer('c1')).toBe(true)
  })

  it('загрузка: файл, не принятый сервером, пропускается; ошибка кода — наверх', async () => {
    const ws = await start()
    const f = (n: string) => new File(['x'], n)
    api.uploadFile.mockRejectedValueOnce(httpError(415)).mockResolvedValueOnce({})
    expect(await ws.uploadFiles([f('a.exe'), f('b.pdf')])).toEqual({ done: 1, total: 2 })
    api.uploadFile.mockRejectedValueOnce(new TypeError('boom'))
    await expect(ws.uploadFiles([f('c.pdf')])).rejects.toThrow('boom')
    expect(ws.isPending('upload')).toBe(false)
  })
})

describe('useWorkspace: refresh()', () => {
  it('тихо перечитывает пакет: без скелетона, состояние — из ответа; ошибка — false, на экране прежнее', async () => {
    const ws = await start()
    api.getById.mockResolvedValueOnce(pkg({ status: 'accepted' }))
    const p = ws.refresh()
    expect(ws.loading.value).toBe(false)
    expect(ws.refreshing.value).toBe(true)
    expect(await p).toBe(true)
    expect(ws.refreshing.value).toBe(false)
    expect(api.getById).toHaveBeenLastCalledWith('pkg1', { silent: true })
    expect(ws.pkg.value?.status).toBe('accepted')

    api.getById.mockRejectedValueOnce(httpError(500))
    expect(await ws.refresh()).toBe(false)
    expect(ws.pkg.value?.status).toBe('accepted')
    expect(ws.loadError.value).toBe(false)
  })
})
