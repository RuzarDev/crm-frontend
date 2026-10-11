import { describe, expect, it, vi } from 'vitest'

const client = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/api/client', () => ({ default: client }))

import { dtsApi } from '@/api/dts'

// В jsdom у Blob нет text() — тело подменяем объектом с тем же методом, что у Blob в браузере.
const res = (status: number, body: string) => ({ status, data: { text: async () => body }, headers: {} })
const thrown = async (p: Promise<unknown>) => p.then(() => null, (e: Error) => e)

describe('dtsApi.xml: ошибки', () => {
  it('400 с перечнем — перечень как есть', async () => {
    client.get.mockResolvedValueOnce(res(400, JSON.stringify({ errors: ['гр. 8', 'ДТС: нет места'] })))
    await expect(dtsApi.xml('c1', 'd1')).resolves.toEqual({ errors: ['гр. 8', 'ДТС: нет места'] })
  })

  it.each([
    ['не JSON (страница прокси)', '<html>Bad Request</html>'],
    ['JSON без перечня', '{"title":"Bad Request"}'],
    ['пустой перечень', '{"errors":[]}'],
    ['пустое тело', ''],
  ])('400: %s — не падает разбором, ошибка без текста (вызывающий подставит свой)', async (_n, body) => {
    client.get.mockResolvedValueOnce(res(400, body))
    const e = await thrown(dtsApi.xml('c1', 'd1'))
    expect(e).toBeInstanceOf(Error)
    expect(e!.message).toBe('')
    expect(e).not.toBeInstanceOf(SyntaxError)
  })

  it('400/500 с текстом сервера — этот текст', async () => {
    client.get.mockResolvedValueOnce(res(400, '{"message":"ДТ не найдена"}'))
    expect((await thrown(dtsApi.xml('c1', 'd1')))!.message).toBe('ДТ не найдена')
    client.get.mockResolvedValueOnce(res(500, '{"error":"Сбой"}'))
    expect((await thrown(dtsApi.xml('c1', 'd1')))!.message).toBe('Сбой')
  })

  it('PDF: ошибка с текстом сервера; без текста — пустая', async () => {
    client.get.mockResolvedValueOnce(res(400, '{"message":"Печать ДТС-2 пока не поддерживается"}'))
    expect((await thrown(dtsApi.pdf('c1', 'd1', 'pdf')))!.message).toBe('Печать ДТС-2 пока не поддерживается')
    client.get.mockResolvedValueOnce(res(502, '<html/>'))
    expect((await thrown(dtsApi.pdf('c1', 'd1', 'pdf')))!.message).toBe('')
  })
})
