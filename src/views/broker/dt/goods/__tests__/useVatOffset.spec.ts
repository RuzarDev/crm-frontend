import { afterEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ match: vi.fn() }))
vi.mock('@/api/vatOffset', () => ({ vatOffsetApi: api }))

import { clearVatOffsetCache, loadVatOffset, vatOffsetRows } from '../useVatOffset'

const row = { list: 'pp-1199', actNumber: '1199', hintLabel: 'ПП РК №1199', number: 94, name: 'Весы', partial: true, footnote: null, condition: null, codeText: 'из 8423 89 000 0' }

afterEach(() => {
  clearVatOffsetCache()
  vi.clearAllMocks()
})

describe('useVatOffset: кэш перечней для зачёта НДС по (код, дата)', () => {
  it('недостающие коды — одним запросом; не в перечне — тоже в кэше; повтор — без запроса; неверные коды не спрашиваются', async () => {
    api.match.mockResolvedValue({ items: [{ code: '8423890000', rows: [row] }] })
    await loadVatOffset(['8423890000', '6109100000', '8423890000', '84', null], '2026-10-09')
    expect(api.match).toHaveBeenCalledTimes(1)
    expect(api.match).toHaveBeenCalledWith(['8423890000', '6109100000'], '2026-10-09', { silent: true })
    expect(vatOffsetRows('8423890000', '2026-10-09')).toEqual([row])
    expect(vatOffsetRows('6109100000', '2026-10-09')).toEqual([])

    await loadVatOffset(['8423890000', '6109100000'], '2026-10-09')
    expect(api.match).toHaveBeenCalledTimes(1)
    // другая дата гр. А — свой ключ
    expect(vatOffsetRows('8423890000', '2025-12-01')).toEqual([])
  })

  it('идущий запрос делят; сбой не оставляет кэша — следующий вызов спросит снова', async () => {
    let resolve!: (v: unknown) => void
    api.match.mockReturnValueOnce(new Promise((r) => { resolve = r }))
    const a = loadVatOffset(['8423890000'], null)
    const b = loadVatOffset(['8423890000'], null)
    resolve({ items: [] })
    await Promise.all([a, b])
    expect(api.match).toHaveBeenCalledTimes(1)
    expect(api.match).toHaveBeenCalledWith(['8423890000'], null, { silent: true })

    api.match.mockRejectedValueOnce(new Error('500'))
    await expect(loadVatOffset(['8423829000'], null)).rejects.toThrow('500')
    api.match.mockResolvedValueOnce({ items: [] })
    await loadVatOffset(['8423829000'], null)
    expect(api.match).toHaveBeenCalledTimes(3)
  })
})
