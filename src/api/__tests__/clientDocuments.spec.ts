import { describe, expect, it, vi } from 'vitest'

const client = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
vi.mock('@/api/client', () => ({ default: client }))

import { clientDocumentsApi } from '@/api/clientDocuments'
import { billingApi } from '@/api/billing'

describe('clientDocumentsApi', () => {
  it('list: GET /import40/client/documents, возвращает data', async () => {
    const data = { company: [], files: [] }
    client.get.mockResolvedValueOnce({ data })
    await expect(clientDocumentsApi.list()).resolves.toBe(data)
    expect(client.get).toHaveBeenCalledWith('/import40/client/documents')
  })

  it('list({ silent }): без тоста перехватчика', async () => {
    client.get.mockResolvedValueOnce({ data: { company: [], files: [] } })
    await clientDocumentsApi.list({ silent: true })
    expect(client.get).toHaveBeenLastCalledWith('/import40/client/documents', { silent: true })
  })
})

describe('billingApi: чеки и реквизиты', () => {
  it('requisites: GET /billing/requisites', async () => {
    const data = { companyName: 'AQNIET', shortName: 'AQNIET', bin: '1', bank: 'b', iik: 'i', bik: 'k', kbe: '17' }
    client.get.mockResolvedValueOnce({ data })
    await expect(billingApi.requisites()).resolves.toBe(data)
    expect(client.get).toHaveBeenCalledWith('/billing/requisites')
  })

  it('uploadPaymentCheck: multipart, поле file, возвращает счёт', async () => {
    const invoice = { id: 'i1', paymentChecks: [{ id: 'f1', fileName: 'check.pdf', sizeBytes: 3, createdAtUtc: '2026-10-09T00:00:00Z' }] }
    client.post.mockResolvedValueOnce({ data: invoice })
    const file = new File(['abc'], 'check.pdf', { type: 'application/pdf' })
    await expect(billingApi.uploadPaymentCheck('i1', file)).resolves.toBe(invoice)
    const [url, body, cfg] = client.post.mock.calls[0]
    expect(url).toBe('/billing/invoices/i1/payment-check')
    expect(body).toBeInstanceOf(FormData)
    expect((body as FormData).get('file')).toBe(file)
    expect(cfg).toEqual({ headers: { 'Content-Type': 'multipart/form-data' } })
  })

  it('downloadPaymentCheck: GET .../files/{fileId}/download как blob', async () => {
    const blob = new Blob(['x'])
    client.get.mockResolvedValueOnce({ data: blob })
    await expect(billingApi.downloadPaymentCheck('i1', 'f1')).resolves.toBe(blob)
    expect(client.get).toHaveBeenLastCalledWith('/billing/invoices/i1/files/f1/download', { responseType: 'blob' })
  })
})
