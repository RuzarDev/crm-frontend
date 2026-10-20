import { describe, expect, it } from 'vitest'
import type { Import40CopySource } from '@/api/import40'
import { defaultCopySource, filterCopySources } from '../steps/copyDt'

const src = (o: Partial<Import40CopySource> & { id: string; caseId: string }): Import40CopySource => ({
  caseNumber: 'ИМ-2026-0001', caseCreatedAtUtc: '2026-10-01T00:00:00Z', declarationNumber: '', rateType: 'ETT', splitRole: null,
  senderName: null, goodsCount: 0, firstGoodsDescription: null, totalInvoiceValue: null, currency: null, updatedAtUtc: '2026-10-01T00:00:00Z', ...o,
})

describe('copyDt', () => {
  const rows = [
    src({ id: 'a', caseId: 'c1', caseNumber: 'ИМ-2026-0010' }),
    src({ id: 'b', caseId: 'c0', caseNumber: 'ИМ-2026-0005', declarationNumber: '55301/011026/0000007', senderName: 'Yiwu Longju', firstGoodsDescription: 'Сушилка для белья' }),
  ]

  it('поиск — по заявке, номеру ДТ, отправителю и товару без учёта регистра', () => {
    expect(filterCopySources(rows, '').map((r) => r.id)).toEqual(['a', 'b'])
    expect(filterCopySources(rows, '0005').map((r) => r.id)).toEqual(['b'])
    expect(filterCopySources(rows, '0000007').map((r) => r.id)).toEqual(['b'])
    expect(filterCopySources(rows, 'yiwu').map((r) => r.id)).toEqual(['b'])
    expect(filterCopySources(rows, 'СУШИЛКА').map((r) => r.id)).toEqual(['b'])
  })

  it('выбор по умолчанию: единственная ДТ этой заявки, иначе свежая из прошлой', () => {
    expect(defaultCopySource(rows, 'c1')).toBe('a')
    expect(defaultCopySource(rows, 'c9')).toBe('a')
    expect(defaultCopySource([rows[0], { ...rows[0], id: 'a2' }, rows[1]], 'c1')).toBe('b')
    expect(defaultCopySource([], 'c1')).toBeNull()
  })
})
