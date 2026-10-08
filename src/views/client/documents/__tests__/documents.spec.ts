import { describe, expect, it } from 'vitest'
import type { Import40DocumentDto } from '@/api/import40Contract'
import type { ClientCaseFile } from '@/api/clientDocuments'
import { companyCard, normSearch, sortFiles } from '@/views/client/documents/documents'

const NOW = Date.parse('2026-10-08T12:00:00Z')
const doc = (o: Partial<Import40DocumentDto>): Import40DocumentDto => ({
  id: 'd', clientId: 'cl', kind: 'poa', number: '1', year: 2026, generatedAtUtc: '2026-09-01T12:00:00Z',
  status: 2, clientSigned: true, clientSignedAtUtc: null, providerSigned: true, providerSignedAtUtc: null,
  clientSignMethod: null, providerSignMethod: null, isSingleUse: false, validUntilUtc: '2099-12-31T23:59:59Z',
  consumedByCaseId: null, files: [],
  ...o,
})
const EFFECTIVE = doc({ id: 'eff', number: '4' })
const NEWER_OPEN = doc({ id: 'new', number: '9', status: 1, clientSigned: false, providerSigned: false, generatedAtUtc: '2026-10-05T12:00:00Z' })
const OLDER_OPEN = doc({ id: 'old-open', number: '2', status: 1, clientSigned: false, providerSigned: false, generatedAtUtc: '2026-08-01T12:00:00Z' })

describe('companyCard', () => {
  it('нет документов — «Нет»', () => {
    expect(companyCard([], null, NOW)).toEqual({ doc: null, status: 'none', newAwaiting: false })
    expect(companyCard([], { done: false }, NOW)).toEqual({ doc: null, status: 'none', newAwaiting: false })
  })

  it('сервер: готово — действующий документ; более новый на подписи — подсказка', () => {
    const c = companyCard([NEWER_OPEN, EFFECTIVE], { done: true }, NOW)
    expect(c.doc?.id).toBe('eff')
    expect(c.status).toBe('effective')
    expect(c.newAwaiting).toBe(true)
  })

  it('сервер: готово, ждущий подписи старше действующего — без подсказки', () => {
    const c = companyCard([OLDER_OPEN, EFFECTIVE], { done: true }, NOW)
    expect(c.doc?.id).toBe('eff')
    expect(c.newAwaiting).toBe(false)
  })

  it('сервер: не готово, есть ждущий подписи — «На подписи»', () => {
    const c = companyCard([NEWER_OPEN, EFFECTIVE], { done: false }, NOW)
    expect(c.doc?.id).toBe('new')
    expect(c.status).toBe('awaiting')
    expect(c.newAwaiting).toBe(false)
  })

  it('сервер: не готово, действующий по датам документ не «Действует» — разовый израсходован, многоразовый истёк', () => {
    expect(companyCard([doc({ isSingleUse: true })], { done: false }, NOW).status).toBe('consumed')
    expect(companyCard([doc({})], { done: false }, NOW).status).toBe('expired')
  })

  it('сервер: договор ждёт подписи AQNIET — «На подписи»', () => {
    const signedByClient = doc({ kind: 'contract', status: 1, clientSigned: true, providerSigned: false })
    expect(companyCard([signedByClient], { done: false, awaitingUs: true }, NOW).status).toBe('awaiting')
  })

  it('без сервера: действующий предпочтительнее нового на подписи (с подсказкой); только ждущий — «На подписи»', () => {
    const both = companyCard([NEWER_OPEN, EFFECTIVE], null, NOW)
    expect(both.doc?.id).toBe('eff')
    expect(both.status).toBe('effective')
    expect(both.newAwaiting).toBe(true)
    const onlyOpen = companyCard([NEWER_OPEN], null, NOW)
    expect(onlyOpen.status).toBe('awaiting')
  })

  it('отозванный уступает свежему неотозванному; только отозванный — «Отозван»', () => {
    const expired = doc({ id: 'exp', validUntilUtc: '2026-01-01T23:59:59Z', generatedAtUtc: '2025-06-01T12:00:00Z' })
    const revoked = doc({ id: 'rev', status: 4, generatedAtUtc: '2026-09-20T12:00:00Z' })
    expect(companyCard([revoked, expired], null, NOW)).toMatchObject({ doc: { id: 'exp' }, status: 'expired' })
    expect(companyCard([revoked], null, NOW)).toMatchObject({ doc: { id: 'rev' }, status: 'revoked' })
  })
})

const file = (id: string, createdAtUtc: string): ClientCaseFile => ({
  id, caseId: 'c', caseNumber: 'ИМ-1', cargo: '', section: 'documents', docKind: null,
  fileName: `${id}.pdf`, sizeBytes: 1, createdAtUtc, fromClient: true,
})

describe('sortFiles', () => {
  it('сравнивает моменты, а не строки: смещение пояса и доли секунды', () => {
    const files = [
      file('plus5', '2026-10-01T15:00:00+05:00'), // 10:00Z
      file('utc', '2026-10-01T12:00:00Z'),
      file('ms', '2026-10-01T11:00:00.5Z'),
    ]
    expect(sortFiles(files).map((f) => f.id)).toEqual(['utc', 'ms', 'plus5'])
  })
})

describe('normSearch', () => {
  it('регистр, пробелы и ё/е не различаются', () => {
    expect(normSearch('  Счёт   СВХ ')).toBe('счет свх')
    expect(normSearch(null)).toBe('')
  })
})
