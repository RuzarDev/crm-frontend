import { describe, expect, it } from 'vitest'
import type { DocumentPackageDto } from '@/types/api'
import { canModifyFiles, filterPackages, formatFileSize, formatStamp, parseContainerNumbers, statusCounts, statusTone } from '../packages'

const pkg = (o: Partial<DocumentPackageDto>): DocumentPackageDto => ({
  id: 'p', trainNumber: '2457', comment: null, status: 'uploaded', createdByExpeditorId: 'e1', createdByExpeditorUsername: 'exp',
  createdAtUtc: '2026-10-08T04:14:00Z', updatedAtUtc: '2026-10-08T04:14:00Z', reviewedByUserId: null, reviewedAtUtc: null,
  reviewComment: null, files: [], containers: [],
  ...o,
})
const ROWS = [
  pkg({ id: 'a', trainNumber: '2457 / ATG-12', status: 'needsFix', comment: 'нет веса брутто' }),
  pkg({ id: 'b', trainNumber: '2451', status: 'accepted' }),
  pkg({ id: 'c', trainNumber: 'ATG-12 / авто', status: 'uploaded' }),
  pkg({ id: 'd', trainNumber: '2440', status: 'processed' }),
  pkg({ id: 'e', trainNumber: '2433', status: 'processed' }),
]

describe('canModifyFiles (как CanModifyFiles на сервере)', () => {
  it('администратор — в любом статусе', () => {
    for (const status of ['uploaded', 'accepted', 'needsFix', 'processed'] as const) {
      expect(canModifyFiles({ role: 'administrator', canReview: true, status })).toBe(true)
    }
  })

  it('проверяющий (packages.manage) — и на принятом, и на обработанном пакете', () => {
    expect(canModifyFiles({ role: 'importer', canReview: true, status: 'accepted' })).toBe(true)
    expect(canModifyFiles({ role: 'importer', canReview: true, status: 'processed' })).toBe(true)
  })

  it('экспедитор — только пока пакет «Загружен» или «Нужна правка»', () => {
    expect(canModifyFiles({ role: 'expeditor', canReview: false, status: 'uploaded' })).toBe(true)
    expect(canModifyFiles({ role: 'expeditor', canReview: false, status: 'needsFix' })).toBe(true)
    expect(canModifyFiles({ role: 'expeditor', canReview: false, status: 'accepted' })).toBe(false)
    expect(canModifyFiles({ role: 'expeditor', canReview: false, status: 'processed' })).toBe(false)
  })

  it('роль сравнивается без регистра и пробелов; остальным нельзя', () => {
    expect(canModifyFiles({ role: ' Expeditor ', canReview: false, status: 'uploaded' })).toBe(true)
    expect(canModifyFiles({ role: 'client', canReview: false, status: 'uploaded' })).toBe(false)
    expect(canModifyFiles({ role: null, canReview: false, status: 'needsFix' })).toBe(false)
  })
})

describe('поиск и статус', () => {
  it('ищет по номеру поезда и по комментарию, без регистра и с пробелами внутри', () => {
    expect(filterPackages(ROWS, '2451', 'all').map((p) => p.id)).toEqual(['b'])
    expect(filterPackages(ROWS, 'atg-12', 'all').map((p) => p.id)).toEqual(['a', 'c'])
    expect(filterPackages(ROWS, 'ВЕСА БРУТТО', 'all').map((p) => p.id)).toEqual(['a'])
    expect(filterPackages(ROWS, '2457/atg', 'all').map((p) => p.id)).toEqual(['a'])
    expect(filterPackages(ROWS, '  ', 'all')).toHaveLength(5)
  })

  it('статус сужает выборку вместе с поиском', () => {
    expect(filterPackages(ROWS, '', 'processed').map((p) => p.id)).toEqual(['d', 'e'])
    expect(filterPackages(ROWS, 'atg', 'uploaded').map((p) => p.id)).toEqual(['c'])
    expect(filterPackages(ROWS, '2440', 'uploaded')).toEqual([])
  })

  it('счётчики сегментов считаются по найденному: поиск учтён, выбранный статус — нет', () => {
    expect(statusCounts(ROWS, '')).toEqual({ all: 5, uploaded: 1, needsFix: 1, accepted: 1, processed: 2 })
    expect(statusCounts(ROWS, 'atg')).toEqual({ all: 2, uploaded: 1, needsFix: 1, accepted: 0, processed: 0 })
    expect(statusCounts([], '')).toEqual({ all: 0, uploaded: 0, needsFix: 0, accepted: 0, processed: 0 })
  })
})

describe('формат и разбор', () => {
  it('номера контейнеров — по одному в строке, пустые и пробелы по краям убираются', () => {
    expect(parseContainerNumbers(' MRSU4885849 \n\n  DRYU9953726\n   \n')).toEqual(['MRSU4885849', 'DRYU9953726'])
    expect(parseContainerNumbers('')).toEqual([])
  })

  it('размер файла: байты, килобайты, мегабайты', () => {
    const t = (k: string) => ({ 'transit.b': 'Б', 'transit.kb': 'КБ', 'transit.mb': 'МБ' })[k] ?? k
    expect(formatFileSize(512, t)).toBe('512 Б')
    expect(formatFileSize(412 * 1024, t)).toBe('412 КБ')
    expect(formatFileSize(3.5 * 1024 * 1024, t)).toBe('3.5 МБ')
  })

  it('тон статуса и штамп времени', () => {
    expect(['uploaded', 'accepted', 'needsFix', 'processed'].map((s) => statusTone(s as DocumentPackageDto['status']))).toEqual(['neutral', 'info', 'wait', 'done'])
    expect(formatStamp('2026-10-08T09:14:00')).toBe('08.10.2026 09:14')
    expect(formatStamp('не дата')).toBe('')
  })
})
