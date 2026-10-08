import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref, type EffectScope } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { caseDto, fileDto } from './caseFixture'

const api = vi.hoisted(() => ({ get: vi.fn(), listFiles: vi.fn(), listBrokerInvoices: vi.fn(), kedenReadinessSummary: vi.fn() }))
vi.mock('@/api/import40', () => ({ import40Api: api }))

import { useCase } from '../useCase'

let scope: EffectScope
const start = (id = 'c1', readiness = true) => {
  scope = effectScope()
  const idRef = ref(id)
  const c = scope.run(() => useCase(idRef, { readiness: () => readiness }))!
  return { c, idRef }
}
const httpError = (status: number) => Object.assign(new Error(`HTTP ${status}`), { response: { status } })
const deferred = <T>() => {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}

beforeEach(() => {
  api.get.mockImplementation(async (id: string) => caseDto({ id }))
  api.listFiles.mockResolvedValue([fileDto()])
  api.listBrokerInvoices.mockResolvedValue([])
  api.kedenReadinessSummary.mockResolvedValue([{ declarationId: 'd1', declarationNumber: '', isReady: true, missing: [], filled: 22, total: 22 }])
})
afterEach(() => {
  scope?.stop()
  vi.clearAllMocks()
})

describe('useCase', () => {
  it('грузит заявку, файлы, счета и сводку готовности одним запросом — без тоста при первом показе', async () => {
    const { c } = start()
    expect(c.state.value).toBe('loading')
    await flushPromises()
    expect(c.state.value).toBe('ready')
    expect(c.kase.value?.id).toBe('c1')
    expect(c.files.value).toHaveLength(1)
    expect(c.readiness.value).toHaveLength(1)
    expect(api.get).toHaveBeenCalledWith('c1', { silent: true })
    expect(api.listFiles).toHaveBeenCalledWith('c1', { silent: true })
    expect(api.kedenReadinessSummary).toHaveBeenCalledTimes(1)
    expect(api.kedenReadinessSummary).toHaveBeenCalledWith('c1', { silent: true })
  })

  it('сводка готовности недоступна роли — не запрашивается, null; ошибка счетов → []', async () => {
    api.listBrokerInvoices.mockRejectedValue(httpError(500))
    const { c } = start('c1', false)
    await flushPromises()
    expect(c.state.value).toBe('ready')
    expect(api.kedenReadinessSummary).not.toHaveBeenCalled()
    expect(c.readiness.value).toBeNull()
    expect(c.invoices.value).toEqual([])
  })

  it.each([404, 403, 400])('%i → «Не найдено»', async (code) => {
    api.get.mockRejectedValue(httpError(code))
    const { c } = start()
    await flushPromises()
    expect(c.state.value).toBe('notFound')
  })

  it('прочая ошибка → «Не удалось открыть»; «Повторить» загружает снова', async () => {
    api.get.mockRejectedValueOnce(httpError(500))
    const { c } = start()
    await flushPromises()
    expect(c.state.value).toBe('error')
    await c.retry()
    expect(c.state.value).toBe('ready')
    expect(api.get).toHaveBeenCalledTimes(2)
  })

  it('ошибка файлов при первом показе — тоже «Не удалось открыть» (а не вечная загрузка)', async () => {
    api.listFiles.mockRejectedValueOnce(httpError(502))
    const { c } = start()
    await flushPromises()
    expect(c.state.value).toBe('error')
  })

  it('reload без мерцания: данные остаются, пока идёт запрос; запрос не silent', async () => {
    const { c } = start()
    await flushPromises()
    const d = deferred<ReturnType<typeof caseDto>>()
    api.get.mockImplementationOnce(() => d.promise)
    const p = c.reload()
    await nextTick()
    expect(c.state.value).toBe('ready')
    expect(c.refreshing.value).toBe(true)
    expect(c.kase.value?.cargo).toBe('Ноутбуки и комплектующие')
    expect(api.get).toHaveBeenLastCalledWith('c1', undefined)
    d.resolve(caseDto({ cargo: 'Запчасти' }))
    expect(await p).toBe(true)
    expect(c.kase.value?.cargo).toBe('Запчасти')
    expect(c.refreshing.value).toBe(false)
  })

  it('сбой reload — последнее известное состояние остаётся', async () => {
    const { c } = start()
    await flushPromises()
    api.get.mockRejectedValueOnce(httpError(500))
    expect(await c.reload()).toBe(false)
    expect(c.state.value).toBe('ready')
    expect(c.kase.value?.id).toBe('c1')
  })

  it('смена id перезагружает; поздний ответ прежней заявки отбрасывается', async () => {
    const slow = deferred<ReturnType<typeof caseDto>>()
    api.get.mockImplementationOnce(() => slow.promise)
    const { c, idRef } = start('c1')
    await nextTick()
    idRef.value = 'c2'
    await flushPromises()
    expect(c.kase.value?.id).toBe('c2')
    slow.resolve(caseDto({ id: 'c1' }))
    await flushPromises()
    expect(c.kase.value?.id).toBe('c2')
    expect(c.state.value).toBe('ready')
  })

  it('гонка reload: ответ старого перечитывания не затирает новый', async () => {
    const { c } = start()
    await flushPromises()
    const first = deferred<ReturnType<typeof caseDto>>()
    api.get.mockImplementationOnce(() => first.promise)
    const p1 = c.reload()
    const p2 = c.reload() // второй — сразу, ответ по умолчанию
    expect(await p2).toBe(true)
    first.resolve(caseDto({ cargo: 'устаревшее' }))
    expect(await p1).toBe(false)
    expect(c.kase.value?.cargo).toBe('Ноутбуки и комплектующие')
  })

  it('setCase — ответ PUT по этой заявке заменяет данные, по другой — игнорируется', async () => {
    const { c } = start()
    await flushPromises()
    c.setCase(caseDto({ cargo: 'Новое' }))
    expect(c.kase.value?.cargo).toBe('Новое')
    c.setCase(caseDto({ id: 'zz', cargo: 'Чужое' }))
    expect(c.kase.value?.cargo).toBe('Новое')
  })
  describe('перечитывание при возврате на вкладку', () => {
    const setVisibility = (v: 'visible' | 'hidden') => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v })
      document.dispatchEvent(new Event('visibilitychange'))
    }
    beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-09T10:00:00Z')) })
    afterEach(() => { vi.useRealTimers(); setVisibility('visible') })

    it('вкладка вернулась через 30 с и больше — карточка перечитывается без скелетона; раньше — нет', async () => {
      const { c } = start()
      await flushPromises()
      api.get.mockClear()
      vi.setSystemTime(new Date('2026-10-09T10:00:29Z'))
      setVisibility('visible')
      await flushPromises()
      expect(api.get).not.toHaveBeenCalled()
      vi.setSystemTime(new Date('2026-10-09T10:00:31Z'))
      setVisibility('visible')
      expect(c.state.value).toBe('ready')
      await flushPromises()
      expect(api.get).toHaveBeenCalledTimes(1)
      expect(c.state.value).toBe('ready')
    })

    it('отсчёт 30 с идёт от последней загрузки: после перечитывания сразу второй раз не грузит; скрытие вкладки не грузит', async () => {
      start()
      await flushPromises()
      api.get.mockClear()
      vi.setSystemTime(new Date('2026-10-09T10:01:00Z'))
      setVisibility('hidden')
      await flushPromises()
      expect(api.get).not.toHaveBeenCalled()
      setVisibility('visible')
      await flushPromises()
      expect(api.get).toHaveBeenCalledTimes(1)
      vi.setSystemTime(new Date('2026-10-09T10:01:10Z'))
      setVisibility('visible')
      await flushPromises()
      expect(api.get).toHaveBeenCalledTimes(1)
    })

    it('после остановки области подписка снимается', async () => {
      start()
      await flushPromises()
      scope.stop()
      api.get.mockClear()
      vi.setSystemTime(new Date('2026-10-09T10:05:00Z'))
      setVisibility('visible')
      await flushPromises()
      expect(api.get).not.toHaveBeenCalled()
    })
  })
})
