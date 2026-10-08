import { describe, expect, it } from 'vitest'
import type { ClientOnboardingRow } from '@/api/clientsOnboarding'
import {
  CLIENT_SEGMENTS, binDigits, blankFileName, clientExcelRows, clientName, clientStatusTone, docStatusLabelKey, docStatusTone,
  filterClients, inviteUntil, isInviteExpired, isValidEmail, matchesClient, segmentCounts, signMethodLabelKey,
} from '../clients'

const row = (o: Partial<ClientOnboardingRow>): ClientOnboardingRow => ({
  id: 'c', username: 'login', email: null, companyName: null, bin: null, phone: null, status: 'Active', emailConfirmed: true,
  hasContract: true, hasPoa: true, createdAtUtc: '2026-03-12T04:00:00Z', inviteExpiresAtUtc: null,
  ...o,
})
const ROWS = [
  row({ id: 'a', companyName: 'ТОО «Казахмыс Трейд»', email: 'finance@kazakhmys.kz', bin: '160440012345' }),
  row({ id: 'b', companyName: 'ТОО «Altyn Med»', bin: '200540031208', hasPoa: false }),
  row({ id: 'c', username: 'import', email: 'import@nomad.kz', status: 'Invited', hasContract: false, hasPoa: false, inviteExpiresAtUtc: '2026-10-14T04:00:00Z' }),
  row({ id: 'd', companyName: 'ИП «Елубаев»', bin: '880112300456', status: 'Blocked', hasPoa: false }),
]

describe('сегменты и счётчики', () => {
  it('порядок сегментов', () => {
    expect(CLIENT_SEGMENTS).toEqual(['all', 'Active', 'Invited', 'nodocs', 'Blocked'])
  })
  it('счётчики без поиска', () => {
    expect(segmentCounts(ROWS, '')).toEqual({ all: 4, Active: 2, Invited: 1, nodocs: 3, Blocked: 1 })
  })
  it('поиск учитывается в счётчиках', () => {
    expect(segmentCounts(ROWS, 'kz')).toEqual({ all: 2, Active: 1, Invited: 1, nodocs: 1, Blocked: 0 })
  })
  it('«Без документов» — нет договора ИЛИ доверенности, любой статус', () => {
    expect(filterClients(ROWS, '', 'nodocs').map((r) => r.id)).toEqual(['b', 'c', 'd'])
  })
  it('статус отбирает по статусу', () => {
    expect(filterClients(ROWS, '', 'Blocked').map((r) => r.id)).toEqual(['d'])
    expect(filterClients(ROWS, '', 'all')).toHaveLength(4)
  })
})

describe('поиск', () => {
  it('по БИН, компании, email и логину; без учёта регистра и пробелов', () => {
    expect(matchesClient('200540', ROWS[1])).toBe(true)
    expect(matchesClient('казахмыс', ROWS[0])).toBe(true)
    expect(matchesClient('FINANCE@', ROWS[0])).toBe(true)
    expect(matchesClient('imp', ROWS[2])).toBe(true)
    expect(matchesClient('2005 4003', ROWS[1])).toBe(true)
    expect(matchesClient('нет такого', ROWS[0])).toBe(false)
    expect(matchesClient('  ', ROWS[0])).toBe(true)
  })
  it('поиск и сегмент работают вместе', () => {
    expect(filterClients(ROWS, 'altyn', 'nodocs').map((r) => r.id)).toEqual(['b'])
    expect(filterClients(ROWS, 'altyn', 'Blocked')).toEqual([])
  })
})

describe('подписи и тона', () => {
  it('имя клиента: компания, иначе логин', () => {
    expect(clientName(ROWS[0])).toBe('ТОО «Казахмыс Трейд»')
    expect(clientName(ROWS[2])).toBe('import')
  })
  it('тона статуса аккаунта', () => {
    expect(clientStatusTone('Active')).toBe('done')
    expect(clientStatusTone('Invited')).toBe('info')
    expect(clientStatusTone('Blocked')).toBe('danger')
  })
  it('тона и подписи статуса документа', () => {
    expect([2, 1, 3, 4, 0].map(docStatusTone)).toEqual(['done', 'wait', 'danger', 'danger', 'neutral'])
    expect([2, 1, 3, 4, 0].map(docStatusLabelKey)).toEqual(['admin.deystvuet', 'admin.zhdetPodpisi', 'admin.istek', 'admin.otozvan', 'admin.chernovik'])
  })
  it('способ подписи', () => {
    expect(signMethodLabelKey('egov')).toBe('admin.ecpEgov')
    expect(signMethodLabelKey('upload')).toBe('admin.zagruzhenFayl')
    expect(signMethodLabelKey(null)).toBe('admin.otmetkaVSisteme')
  })
  it('имя файла бланка', () => {
    expect(blankFileName('Договор', { number: '12', year: 2026 })).toBe('Договор-12-2026.docx')
  })
})

describe('приглашение', () => {
  it('срок ссылки: истекла или до даты', () => {
    const now = new Date('2026-10-08T00:00:00Z').getTime()
    expect(isInviteExpired('2026-10-07T00:00:00Z', now)).toBe(true)
    expect(isInviteExpired('2026-10-14T00:00:00Z', now)).toBe(false)
    expect(inviteUntil(ROWS[2], now)).toEqual({ expired: false, date: '14.10.2026' })
    expect(inviteUntil(ROWS[2], new Date('2026-10-20T00:00:00Z').getTime())?.expired).toBe(true)
    expect(inviteUntil(ROWS[0], now)).toBeNull()
  })
  it('email и БИН', () => {
    expect(isValidEmail('client@company.kz')).toBe(true)
    expect(isValidEmail(' client@company.kz ')).toBe(true)
    expect(isValidEmail('client@company')).toBe(false)
    expect(isValidEmail('client company.kz')).toBe(false)
    expect(binDigits('1604-4001 2345')).toBe('160440012345')
  })
})

describe('Excel', () => {
  it('заголовки из t, договор и доверенность — да/нет', () => {
    const t = (k: string) => k
    const [first, second] = clientExcelRows(ROWS, t)
    expect(first).toEqual({
      'admin.klient': 'ТОО «Казахмыс Трейд»', 'admin.email': 'finance@kazakhmys.kz', 'admin.bin': '160440012345', 'clientCard.phone': '',
      'admin.status': 'admin.aktiven', 'admin.dogovor': 'clientDocs.yes', 'admin.doverennost': 'clientDocs.yes', 'admin.sozdan': '12.03.2026',
    })
    expect(second['admin.doverennost']).toBe('clientDocs.no')
  })
})
