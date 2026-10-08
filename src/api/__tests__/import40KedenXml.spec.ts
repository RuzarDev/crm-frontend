import { describe, expect, it, vi } from 'vitest'

const client = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/api/client', () => ({ default: client }))

import { import40Api } from '@/api/import40'

// В jsdom у Blob нет text() — тело 400 подменяем объектом с тем же методом, что у Blob в браузере.
const bad = (body: string) => ({ status: 400, data: { text: async () => body }, headers: {} })

describe('import40Api.downloadKedenXml: ответ 400', () => {
  it('JSON с перечнем — перечень как есть', async () => {
    client.get.mockResolvedValueOnce(bad(JSON.stringify({ errors: ['гр. 31', 'гр. 33'] })))
    await expect(import40Api.downloadKedenXml('c1', 'd1')).resolves.toEqual({ errors: ['гр. 31', 'гр. 33'] })
  })

  it.each([
    ['не JSON (страница прокси)', '<html>Bad Request</html>'],
    ['JSON без перечня', '{"title":"Bad Request"}'],
    ['пустой перечень', '{"errors":[]}'],
    ['пустое тело', ''],
  ])('%s — не падает, перечень «Не удалось сформировать XML»', async (_n, body) => {
    client.get.mockResolvedValueOnce(bad(body))
    await expect(import40Api.downloadKedenXml('c1', 'd1')).resolves.toEqual({ errors: ['Не удалось сформировать XML'] })
  })

  it('200 — файл с именем из Content-Disposition', async () => {
    const blob = new Blob(['<xml/>'])
    client.get.mockResolvedValueOnce({ status: 200, data: blob, headers: { 'content-disposition': 'attachment; filename="dt-1.xml"' } })
    await expect(import40Api.downloadKedenXml('c1', 'd1')).resolves.toEqual({ blob, fileName: 'dt-1.xml' })
  })
})
