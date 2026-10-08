import { describe, expect, it, vi } from 'vitest'

const client = vi.hoisted(() => ({ get: vi.fn().mockResolvedValue({ data: {} }), post: vi.fn() }))
vi.mock('@/api/client', () => ({ default: client }))

import { tnvedApi } from '@/api/tnved'

describe('tnvedApi.classify', () => {
  it('вызывает GET /tnved/classify с параметрами description и limit', async () => {
    await tnvedApi.classify('ноутбук')
    expect(client.get).toHaveBeenCalledWith('/tnved/classify', { params: { description: 'ноутбук', limit: 10 } })
    expect(client.post).not.toHaveBeenCalled()
  })
})

describe('tnvedApi: silent для экранов со своей ошибкой', () => {
  it('search / classify / calculate — silent в конфиге; rates / currencies без opts — прежний вызов', async () => {
    client.get.mockClear()
    await tnvedApi.search('8471', true, 20, { silent: true })
    expect(client.get).toHaveBeenLastCalledWith('/tnved/search', { params: { q: '8471', leafOnly: true, limit: 20 }, silent: true })
    await tnvedApi.classify('ноутбук', 10, { silent: true })
    expect(client.get).toHaveBeenLastCalledWith('/tnved/classify', { params: { description: 'ноутбук', limit: 10 }, silent: true })
    await tnvedApi.calculate({ code: '8471300000', customsValue: 1, currencyCode: 'USD' }, { silent: true })
    expect(client.get).toHaveBeenLastCalledWith('/tnved/calculate', { params: { code: '8471300000', customsValue: 1, currencyCode: 'USD' }, silent: true })
    await tnvedApi.rates('8471300000', { silent: true })
    expect(client.get).toHaveBeenLastCalledWith('/tnved/node/8471300000/rates', { silent: true })
    await tnvedApi.currencies({ silent: true })
    expect(client.get).toHaveBeenLastCalledWith('/tnved/currencies', { silent: true })
    await tnvedApi.rates('8471300000')
    expect(client.get.mock.lastCall).toEqual(['/tnved/node/8471300000/rates'])
    await tnvedApi.currencies()
    expect(client.get.mock.lastCall).toEqual(['/tnved/currencies'])
  })
})
