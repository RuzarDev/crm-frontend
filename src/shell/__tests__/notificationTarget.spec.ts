import { describe, expect, it } from 'vitest'
import { notificationTarget } from '@/shell/notificationTarget'

describe('notificationTarget', () => {
  it('срок контракта: карточка контракта клиента', () => {
    expect(notificationTarget({ caseId: null, reestrEntryId: null, type: 'ForeignContractDeadline', foreignContractId: 'k 1' }, false))
      .toBe('/contracts/k%201')
  })
  it('договор/доверенность клиента: клиенту — «Моя компания», сотруднику с clients.read — «Документы клиентов»', () => {
    const n = { caseId: null, reestrEntryId: null, type: 'ClientDocument' }
    expect(notificationTarget(n, false, () => false, true)).toBe('/import-40/company')
    expect(notificationTarget(n, false, (p) => p === 'clients.read', false)).toBe('/client-documents')
    expect(notificationTarget(n, false, () => false, false)).toBeNull()
    expect(notificationTarget(n, true, () => true, false)).toBeNull()
  })
  it('заявка: сотруднику — карточка заявки', () => {
    expect(notificationTarget({ caseId: 'c1', reestrEntryId: null }, false)).toBe('/import-40/c1')
  })
  it('заявка: финансисту — «Счета и акты» с фильтром по заявке', () => {
    expect(notificationTarget({ caseId: 'c1', reestrEntryId: null }, true)).toBe('/billing?case=c1')
  })
  it('id кодируется в обеих ветках', () => {
    expect(notificationTarget({ caseId: 'a b/c', reestrEntryId: null }, false)).toBe('/import-40/a%20b%2Fc')
    expect(notificationTarget({ caseId: 'a b', reestrEntryId: null }, true)).toBe('/billing?case=a%20b')
  })
  it('запись реестра — /reestr, без привязки — null', () => {
    expect(notificationTarget({ caseId: null, reestrEntryId: 'r1' }, false)).toBe('/reestr')
    expect(notificationTarget({ caseId: null, reestrEntryId: null }, true)).toBeNull()
  })
  it('чек по счёту — «Счета и акты» для любого сотрудника, с фильтром по заявке', () => {
    const n = { type: 'InvoiceCheckUploaded', caseId: 'c1', reestrEntryId: null }
    expect(notificationTarget(n, false)).toBe('/billing?case=c1')
    expect(notificationTarget(n, true)).toBe('/billing?case=c1')
  })
  it('чек по счёту без заявки — просто «Счета и акты»', () => {
    const n = { type: 'InvoiceCheckUploaded', caseId: null, reestrEntryId: null }
    expect(notificationTarget(n, false)).toBe('/billing')
    expect(notificationTarget(n, true)).toBe('/billing')
  })
  it('новая редакция ЕЭК (без заявки и реестра) — «Обновления ЕЭК»; тип без учёта регистра', () => {
    const n = { type: 'EecTariffUpdate', caseId: null, reestrEntryId: null }
    expect(notificationTarget(n, false)).toBe('/tnved/eec')
    expect(notificationTarget({ ...n, type: 'eecTariffUpdate' }, false)).toBe('/tnved/eec')
    expect(notificationTarget(n, false, (p) => p === 'tnved.manage')).toBe('/tnved/eec')
  })
  it('редакция ЕЭК без права tnved.manage или у финансиста — никуда не ведёт (экран закрыт)', () => {
    const n = { type: 'EecTariffUpdate', caseId: null, reestrEntryId: null }
    expect(notificationTarget(n, false, () => false)).toBeNull()
    expect(notificationTarget(n, true)).toBeNull()
  })
  it('счёт AQNIET (C-22): клиенту — сам счёт, даже без поставки; сотруднику — как раньше', () => {
    const withCase = { caseId: 'c1', reestrEntryId: null, type: 'Import40Transition', brokerInvoiceId: 'i 1' }
    expect(notificationTarget(withCase, false, () => false, true)).toBe('/billing?id=i%201')
    expect(notificationTarget({ ...withCase, caseId: null }, false, () => false, true)).toBe('/billing?id=i%201')
    expect(notificationTarget(withCase, false, () => true, false)).toBe('/import-40/c1')
  })
})
