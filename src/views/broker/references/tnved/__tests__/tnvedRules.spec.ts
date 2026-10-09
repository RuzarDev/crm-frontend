import { describe, expect, it, vi } from 'vitest'

vi.mock('@/api/tnved', () => ({ tnvedApi: {} }))

// Правила экрана «ТН ВЭД» (tnvedRules.ts): вкладки, кэш данных кодов, форматы.
import { createCodeCache, failStatus, formatUpdated, nextTab, percent, tabEnabled, type CodeData } from '../tnvedRules'

const httpError = (status: number) => Object.assign(new Error(`HTTP ${status}`), { response: { status } })
const node10 = { code: '8471300000', is10: true }
const group = { code: '8471', is10: false }

const fetchers = () => ({
  rates: vi.fn(async (c: string) => ({ code: c }) as unknown as CodeData['rates']),
  notes: vi.fn(async (c: string) => ({ code: c }) as unknown as CodeData['notes']),
  measures: vi.fn(async (c: string) => ({ code: c }) as unknown as CodeData['measures']),
  export: vi.fn(async (c: string) => ({ code: c }) as unknown as CodeData['export']),
  transition: vi.fn(async (c: string) => ({ oldCode: c }) as unknown as CodeData['transition']),
})

describe('вкладки', () => {
  it('калькулятор, нетарифка и экспорт — только у 10-значного; пояснения — у любого кода', () => {
    expect(tabEnabled('calc', node10)).toBe(true)
    expect(tabEnabled('calc', group)).toBe(false)
    expect(tabEnabled('measures', group)).toBe(false)
    expect(tabEnabled('export', group)).toBe(false)
    expect(tabEnabled('notes', group)).toBe(true)
    expect(tabEnabled('notes', { code: '', is10: false })).toBe(false)
    expect(tabEnabled('rates', group)).toBe(true)
  })

  it('другой код: вкладка остаётся, если она у него есть, иначе — «Ставки»', () => {
    expect(nextTab('notes', group)).toBe('notes')
    expect(nextTab('calc', group)).toBe('rates')
    expect(nextTab('measures', node10)).toBe('measures')
  })
})

describe('кэш данных кодов', () => {
  it('ответ и «нет данных» (404) — из кэша; одновременные запросы склеиваются', async () => {
    const f = fetchers()
    f.notes.mockRejectedValueOnce(httpError(404))
    const cache = createCodeCache(f)
    const [a, b] = await Promise.all([cache.load('rates', '1'), cache.load('rates', '1')])
    expect(a).toEqual({ status: 'done', data: { code: '1' } })
    expect(b).toBe(a)
    await cache.load('rates', '1')
    expect(f.rates).toHaveBeenCalledTimes(1)
    expect(cache.peek('rates', '1')).toEqual(a)
    expect(cache.peek('rates', '2')).toBeUndefined()

    expect(await cache.load('notes', '1')).toEqual({ status: 'missing', data: null })
    await cache.load('notes', '1')
    expect(f.notes).toHaveBeenCalledTimes(1)
  })

  it('ошибка и 429 не кэшируются — следующий запрос идёт снова', async () => {
    const f = fetchers()
    f.measures.mockRejectedValueOnce(httpError(429)).mockRejectedValueOnce(httpError(500))
    const cache = createCodeCache(f)
    expect((await cache.load('measures', '1')).status).toBe('limit')
    expect(cache.peek('measures', '1')).toBeUndefined()
    expect((await cache.load('measures', '1')).status).toBe('error')
    expect((await cache.load('measures', '1')).status).toBe('done')
    expect(f.measures).toHaveBeenCalledTimes(3)
  })

  it('статус ошибки: 404 — нет данных, 429 — лимит, прочее — ошибка', () => {
    expect(failStatus(httpError(404))).toBe('missing')
    expect(failStatus(httpError(429))).toBe('limit')
    expect(failStatus(new Error('network'))).toBe('error')
  })
})

describe('форматы', () => {
  it('вероятность — проценты, дата — по языку интерфейса', () => {
    expect(percent(0.874)).toBe('87%')
    expect(percent(1.4)).toBe('100%')
    expect(formatUpdated('2026-10-09T03:00:00Z', 'ru')).toBe('09.10.2026')
    expect(formatUpdated('2026-10-09T03:00:00Z', 'en')).toBe('09/10/2026')
    expect(formatUpdated(null, 'ru')).toBe('')
    expect(formatUpdated('мусор', 'ru')).toBe('')
  })
})
