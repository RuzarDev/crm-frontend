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
