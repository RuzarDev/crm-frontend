import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAuthStore } from '@/stores/auth'
import { ReestrEntryStatus as S } from '@/types/api'
import {
  canAutofill, canDeleteComment, canDeleteDoc, canEditData, canPostComment, canSeeAutofill, canSeeHistory, canUploadBrokerDoc,
  canUploadClientDoc, isBrokerSectionClosed, useRecordPermissions, type RecordAuth,
} from '../recordPermissions'

const u = (role: string, permissions: string[], userId = 'me'): RecordAuth => ({ role, permissions, userId })
// Роли из разбора §4 и §9.
const USERS = {
  client: u('client', ['reestr.read']),
  expeditor: u('expeditor', ['reestr.read']),
  expeditorWriter: u('Expeditor', ['reestr.read', 'reestr.write']),
  readOnlyStaff: u('importer', ['reestr.read']),
  writer: u('importer', ['reestr.read', 'reestr.write']),
  admin: u('administrator', []),
}
const bdoc = (uploadedByUserId: string) => ({ section: 'broker' as const, uploadedByUserId })
const cdoc = (uploadedByUserId: string) => ({ section: 'client' as const, uploadedByUserId })

describe('recordPermissions: данные и автозаполнение', () => {
  it('править «Данные» — reestr.write и роль не client; администратор — всегда', () => {
    expect(canEditData(USERS.writer)).toBe(true)
    expect(canEditData(USERS.admin)).toBe(true)
    expect(canEditData(USERS.readOnlyStaff)).toBe(false)
    expect(canEditData(USERS.client)).toBe(false)
    expect(canEditData(u('client', ['reestr.read', 'reestr.write']))).toBe(false)
  })

  it('автозаполнение: видна только с reestr.write (сервер требует), активна без несохранённых правок', () => {
    // Без reestr.write — нет; с ним, но без права грузить в клиентскую секцию (сотрудник) — тоже нет: сервер ответит 403.
    for (const a of [USERS.client, USERS.expeditor, USERS.readOnlyStaff, USERS.writer, u('broker', ['reestr.read', 'reestr.write'])]) {
      expect(canSeeAutofill(a)).toBe(false)
      expect(canAutofill(a, false)).toBe(false)
    }
    for (const a of [USERS.expeditorWriter, USERS.admin, u('client', ['reestr.read', 'reestr.write'])]) {
      expect(canSeeAutofill(a)).toBe(true)
      expect(canAutofill(a, false)).toBe(true)
      expect(canAutofill(a, true)).toBe(false)
    }
  })
})

describe('recordPermissions: загрузка документов', () => {
  it('клиентская секция: клиент, экспедитор, администратор', () => {
    expect(canUploadClientDoc(USERS.client)).toBe(true)
    expect(canUploadClientDoc(USERS.expeditor)).toBe(true)
    expect(canUploadClientDoc(USERS.admin)).toBe(true)
    expect(canUploadClientDoc(USERS.readOnlyStaff)).toBe(false)
    expect(canUploadClientDoc(USERS.writer)).toBe(false)
  })

  it('брокерская секция: reestr.write и не клиент/экспедитор; в «Выпущен» и «Архив» закрыта для всех', () => {
    expect(canUploadBrokerDoc(USERS.writer, S.InProgress)).toBe(true)
    expect(canUploadBrokerDoc(USERS.admin, S.Submitted)).toBe(true)
    expect(canUploadBrokerDoc(USERS.writer, S.ConditionallyReleased)).toBe(true)
    expect(canUploadBrokerDoc(USERS.readOnlyStaff, S.InProgress)).toBe(false)
    expect(canUploadBrokerDoc(USERS.client, S.InProgress)).toBe(false)
    expect(canUploadBrokerDoc(USERS.expeditorWriter, S.InProgress)).toBe(false)
    for (const closed of [S.Released, S.Archived]) {
      expect(isBrokerSectionClosed(closed)).toBe(true)
      expect(canUploadBrokerDoc(USERS.writer, closed)).toBe(false)
      expect(canUploadBrokerDoc(USERS.admin, closed)).toBe(false)
    }
    expect(isBrokerSectionClosed(S.Rejected)).toBe(false)
  })
})

describe('recordPermissions: удаление документов', () => {
  it('нужно reestr.write; клиент и экспедитор не удаляют никогда', () => {
    expect(canDeleteDoc(USERS.readOnlyStaff, bdoc('me'), S.InProgress)).toBe(false)
    expect(canDeleteDoc(USERS.client, cdoc('me'), S.InProgress)).toBe(false)
    expect(canDeleteDoc(u('client', ['reestr.write']), cdoc('me'), S.InProgress)).toBe(false)
    expect(canDeleteDoc(USERS.expeditorWriter, cdoc('me'), S.InProgress)).toBe(false)
    expect(canDeleteDoc(USERS.expeditor, cdoc('me'), S.InProgress)).toBe(false)
  })

  it('сотрудник с reestr.write — только свои брокерские документы', () => {
    expect(canDeleteDoc(USERS.writer, bdoc('me'), S.InProgress)).toBe(true)
    expect(canDeleteDoc(USERS.writer, bdoc('other'), S.InProgress)).toBe(false)
    expect(canDeleteDoc(USERS.writer, cdoc('me'), S.InProgress)).toBe(false)
    expect(canDeleteDoc(u('importer', ['reestr.write'], null), bdoc(''), S.InProgress)).toBe(false)
  })

  it('администратор — любой документ, кроме брокерских закрытой секции', () => {
    expect(canDeleteDoc(USERS.admin, bdoc('other'), S.InProgress)).toBe(true)
    expect(canDeleteDoc(USERS.admin, cdoc('other'), S.InProgress)).toBe(true)
    expect(canDeleteDoc(USERS.admin, cdoc('other'), S.Released)).toBe(true)
    expect(canDeleteDoc(USERS.admin, bdoc('other'), S.Released)).toBe(false)
    expect(canDeleteDoc(USERS.admin, bdoc('other'), S.Archived)).toBe(false)
  })

  it('автор своего брокерского документа при «Выпущен» удалить не может', () => {
    expect(canDeleteDoc(USERS.writer, bdoc('me'), S.Released)).toBe(false)
  })
})

describe('recordPermissions: история и комментарии', () => {
  it('история скрыта клиенту, остальным видна', () => {
    expect(canSeeHistory(USERS.client)).toBe(false)
    expect(canSeeHistory(u('Client', []))).toBe(false)
    for (const a of [USERS.expeditor, USERS.readOnlyStaff, USERS.writer, USERS.admin]) expect(canSeeHistory(a)).toBe(true)
  })

  it('писать комментарии может не клиент; удалить — администратор или автор', () => {
    expect(canPostComment(USERS.client)).toBe(false)
    for (const a of [USERS.expeditor, USERS.readOnlyStaff, USERS.writer, USERS.admin]) expect(canPostComment(a)).toBe(true)
    expect(canDeleteComment(USERS.writer, { authorId: 'me' })).toBe(true)
    expect(canDeleteComment(USERS.writer, { authorId: 'other' })).toBe(false)
    expect(canDeleteComment(USERS.admin, { authorId: 'other' })).toBe(true)
    expect(canDeleteComment(USERS.readOnlyStaff, { authorId: 'me' })).toBe(true)
  })

  it('клиенту удалять нечего: чтение; без userId автора не угадать', () => {
    expect(canDeleteComment(USERS.client, { authorId: 'me' })).toBe(false)
    expect(canDeleteComment(u('importer', [], null), { authorId: '' })).toBe(false)
  })
})

describe('useRecordPermissions: привязка к стору auth', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('читает роль, права и userId стора в момент вызова (смена прав в сессии подхватывается)', () => {
    const auth = useAuthStore()
    const p = useRecordPermissions()
    auth.role = 'importer'
    auth.permissions = ['reestr.read']
    auth.userId = 'me'
    expect(p.canEditData()).toBe(false)
    expect(p.canUploadBrokerDoc(S.InProgress)).toBe(false)
    expect(p.canSeeAutofill()).toBe(false)
    auth.permissions = ['reestr.read', 'reestr.write']
    expect(p.canSeeAutofill()).toBe(false) // importer: в клиентскую секцию не грузит
    expect(p.canEditData()).toBe(true)
    expect(p.canUploadBrokerDoc(S.InProgress)).toBe(true)
    expect(p.canUploadBrokerDoc(S.Released)).toBe(false)
    expect(p.canDeleteDoc(bdoc('me'), S.InProgress)).toBe(true)
    expect(p.canDeleteDoc(bdoc('x'), S.InProgress)).toBe(false)
    expect(p.canDeleteComment({ authorId: 'me' })).toBe(true)
    auth.role = 'expeditor'
    expect(p.canAutofill(false)).toBe(true)
    expect(p.canAutofill(true)).toBe(false)
    auth.role = 'client'
    expect(p.canSeeHistory()).toBe(false)
    expect(p.canPostComment()).toBe(false)
    expect(p.canUploadClientDoc()).toBe(true)
  })
})
