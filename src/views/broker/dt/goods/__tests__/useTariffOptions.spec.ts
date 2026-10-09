import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, reactive } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'

const api = vi.hoisted(() => ({ tariffOptions: vi.fn() }))
vi.mock('@/api/tnved', () => ({ tnvedApi: api }))

import { clearTariffCache, useTariffOptions, type TariffSource } from '../useTariffOptions'

const dto = (rate = '10%') => ({ countryRate: null, excise: [], antiDumping: [], dutyRates: [rate] })

// Хост: несколько «товаров» с подсказкой (как будто открыты по очереди или одновременно).
const host = (sources: TariffSource[]) => {
  const results: ReturnType<typeof useTariffOptions>[] = []
  const w = mount(defineComponent({
    setup() {
      for (const s of sources) results.push(useTariffOptions(() => s, { debounceMs: 300 }))
      return () => h('div')
    },
  }))
  return { w, results }
}

beforeEach(() => {
  vi.useFakeTimers()
  clearTariffCache()
  api.tariffOptions.mockReset()
  api.tariffOptions.mockImplementation(async () => ({ data: dto() }))
})
afterEach(() => {
  vi.useRealTimers()
})

describe('useTariffOptions (T1/T2)', () => {
  it('запрос — на дату гр. А и тихо (без тоста перехватчика)', async () => {
    const { results } = host([{ code: '4202121900', country: '156', onDate: '2026-10-09' }])
    await flushPromises()
    expect(api.tariffOptions).toHaveBeenCalledTimes(1)
    expect(api.tariffOptions).toHaveBeenCalledWith('4202121900', '156', '2026-10-09', { silent: true })
    expect(results[0].data.value).toEqual(dto())
  })

  it('код не из 10 цифр — запроса нет, подсказки нет', async () => {
    const { results } = host([{ code: '420212', country: '156', onDate: '2026-10-09' }, { code: null, country: null, onDate: null }])
    await flushPromises()
    expect(api.tariffOptions).not.toHaveBeenCalled()
    expect(results[0].data.value).toBeNull()
  })

  it('кэш по (код, страна, дата): одинаковые товары — один запрос; другая дата или страна — новый', async () => {
    host([
      { code: '4202121900', country: '156', onDate: '2026-10-09' },
      { code: '4202121900', country: '156', onDate: '2026-10-09' },
    ])
    await flushPromises()
    expect(api.tariffOptions).toHaveBeenCalledTimes(1)
    // Повторное открытие того же товара — из кэша, без запроса.
    const again = host([{ code: '4202121900', country: '156', onDate: '2026-10-09' }])
    expect(again.results[0].data.value).toEqual(dto())
    await flushPromises()
    expect(api.tariffOptions).toHaveBeenCalledTimes(1)
    host([{ code: '4202121900', country: '156', onDate: '2026-10-10' }, { code: '4202121900', country: '458', onDate: '2026-10-09' }])
    await flushPromises()
    expect(api.tariffOptions).toHaveBeenCalledTimes(3)
  })

  it('правка кода — с задержкой, лишние промежуточные коды не запрашиваются', async () => {
    const src = reactive<TariffSource>({ code: '4202121900', country: '156', onDate: '2026-10-09' })
    host([src])
    await flushPromises()
    expect(api.tariffOptions).toHaveBeenCalledTimes(1)
    src.code = '4202121901'
    await nextTick()
    src.code = '4202121902'
    await nextTick()
    expect(api.tariffOptions).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(300)
    await flushPromises()
    expect(api.tariffOptions).toHaveBeenCalledTimes(2)
    expect(api.tariffOptions).toHaveBeenLastCalledWith('4202121902', '156', '2026-10-09', { silent: true })
  })

  it('сбой — failed без исключения, повтор делает новый запрос', async () => {
    api.tariffOptions.mockRejectedValueOnce(new Error('500'))
    const { results } = host([{ code: '4202121900', country: '156', onDate: '2026-10-09' }])
    await flushPromises()
    expect(results[0].failed.value).toBe(true)
    expect(results[0].data.value).toBeNull()
    results[0].retry()
    await flushPromises()
    expect(api.tariffOptions).toHaveBeenCalledTimes(2)
    expect(results[0].failed.value).toBe(false)
    expect(results[0].data.value).toEqual(dto())
  })

  it('ответ устаревшего запроса не перетирает новый', async () => {
    let resolveFirst!: (v: unknown) => void
    api.tariffOptions.mockImplementationOnce(() => new Promise((r) => { resolveFirst = r }))
    const src = reactive<TariffSource>({ code: '4202121900', country: '156', onDate: '2026-10-09' })
    const { results } = host([src])
    src.code = '8471300000'
    await vi.advanceTimersByTimeAsync(300)
    await flushPromises()
    resolveFirst({ data: dto('99%') })
    await flushPromises()
    expect(results[0].data.value).toEqual(dto())
  })
})
