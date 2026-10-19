import { describe, expect, it } from 'vitest'
import type { Import40FileDto } from '@/api/import40'
import { extractableCaseFiles, preselectedIds } from '../steps/extractDocs'

const f = (id: string, section: string, name: string, docKind: string | null = null): Import40FileDto =>
  ({ id, section, originalFileName: name, docKind, contentType: '', sizeBytes: 1, uploadedByBusinessRole: 'client', createdAtUtc: '' }) as Import40FileDto

describe('«Из документов»: документы заявки для распознавания (19.10.2026)', () => {
  const files = [
    f('inv', 'documents', 'Инвойс.xlsx', 'invoice'),
    f('pl', 'documents', 'PL.pdf', 'packing'),
    f('ctr', 'documents', 'Контракт.docx', 'contract'),
    f('scan', 'border-scans', 'cmr.jpg'),
    f('poa', 'power-of-attorney', 'Доверенность.pdf'),
    f('chk', 'payment-check', 'чек.pdf'),
    f('zip', 'documents', 'архив.zip'),
  ]

  it('только документы поставки подходящих форматов (без доверенностей, чеков, архивов)', () => {
    expect(extractableCaseFiles(files).map((x) => x.id)).toEqual(['inv', 'pl', 'ctr', 'scan'])
  })

  it('сразу отмечены инвойс и упаковочный лист; без них — Excel из документов клиента', () => {
    expect(preselectedIds(extractableCaseFiles(files))).toEqual(['inv', 'pl'])
    expect(preselectedIds([f('a', 'documents', 'Заявка.xlsx'), f('b', 'documents', 'cmr.pdf'), f('c', 'border-scans', 'x.xlsx')])).toEqual(['a'])
  })
})
