import { beforeEach, describe, expect, it, vi } from 'vitest'

const client = vi.hoisted(() => ({ post: vi.fn() }))
vi.mock('@/api/client', () => ({ default: client }))

import { uploadFile } from '@/api/autoTransit'

const sized = (name: string, bytes: number, type = '') => {
  const f = new File(['x'], name, { type })
  Object.defineProperty(f, 'size', { value: bytes })
  return f
}
const timeoutOf = () => (client.post.mock.calls.at(-1)![2] as { timeout?: number }).timeout

beforeEach(() => {
  client.post.mockReset()
  client.post.mockResolvedValue({ data: { id: 't1' } })
})

describe('uploadFile: таймаут по размеру файла (слабая связь на границе)', () => {
  it('JPEG 10 МБ — не общие 30 с, а по размеру', async () => {
    await uploadFile('t1', sized('photo.jpg', 10_000_000, 'image/jpeg'))
    // 60 с + 1 с на каждые 20 КБ → 560 с.
    expect(timeoutOf()).toBe(560_000)
  })
  it('маленький файл — не меньше 2 минут', async () => {
    await uploadFile('t1', sized('a.pdf', 50_000))
    expect(timeoutOf()).toBe(120_000)
  })
  it('большой — не больше 15 минут', async () => {
    await uploadFile('t1', sized('big.pdf', 30 * 1024 * 1024))
    expect(timeoutOf()).toBe(900_000)
  })
  it('HEIC — больший из двух', async () => {
    await uploadFile('t1', sized('IMG_1.heic', 100_000, 'image/heic'))
    expect(timeoutOf()).toBeGreaterThanOrEqual(120_000)
  })
})
