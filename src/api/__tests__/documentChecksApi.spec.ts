import { describe, expect, it, vi } from 'vitest'

const client = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), post: vi.fn().mockResolvedValue({ data: { id: 'k1' } }) }))
vi.mock('@/api/client', () => ({ default: client }))

import { documentChecksApi, RECHECK_TIMEOUT_MS } from '@/api/documentChecks'

describe('documentChecksApi.recheck', () => {
  // Ревью №13: те же файлы, что у «Из документов» (extract-batch, 180 с); 30 с по умолчанию обрывали разбор сканов и PDF.
  it('таймаут как у extract-batch — 180 с, ошибку показывает блок (silent)', async () => {
    await documentChecksApi.recheck('c 1', 'k1')
    expect(RECHECK_TIMEOUT_MS).toBe(180000)
    expect(client.post).toHaveBeenCalledWith('/import40/c%201/document-checks/k1/recheck', null, { silent: true, timeout: 180000 })
  })
})
