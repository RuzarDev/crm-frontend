import { describe, expect, it } from 'vitest'
import type { Import40FileDto } from '@/api/import40'
import { EXTRACT_ACCEPT, extractableCaseFiles, preselectedIds } from '../steps/extractDocs'

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

  it('Excel .xls подходит (пакет импорта 21.10: читается в браузере, в Zircon AI не уходит)', () => {
    expect(EXTRACT_ACCEPT.split(',')).toContain('.xls')
    expect(extractableCaseFiles([f('old', 'extraction-batch', 'PACKING.XLS')]).map((x) => x.id)).toEqual(['old'])
    expect(preselectedIds([f('x', 'documents', 'Инвойс.xls'), f('y', 'documents', 'cmr.pdf')])).toEqual(['x'])
  })
})

describe('extractableCaseFiles: копии неудачных попыток', () => {
  const file = (id: string, name: string, size: number, at: string) =>
    ({ id, section: 'extraction-batch', originalFileName: name, sizeBytes: size, createdAtUtc: at }) as never

  it('одно имя и размер — один документ, остаётся новый; другой размер — отдельный', () => {
    const list = [
      file('old', '1.pdf', 100, '2026-11-04T08:00:29Z'), file('new', '1.pdf', 100, '2026-11-04T08:04:58Z'),
      file('other', '1.pdf', 200, '2026-11-04T08:00:29Z'), file('two', '2.pdf', 100, '2026-11-04T08:00:29Z'),
    ]
    expect(extractableCaseFiles(list).map((f) => f.id).sort()).toEqual(['new', 'other', 'two'])
  })
})
