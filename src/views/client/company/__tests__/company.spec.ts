import { describe, expect, it } from 'vitest'
import type { Import40DocumentDto } from '@/api/import40Contract'
import { companySteps, currentDoc, defaultStep, historyDocs, historyStatus, joinList } from '../company'

const doc = (o: Partial<Import40DocumentDto>): Import40DocumentDto => ({
  id: 'd', clientId: 'cl', kind: 'contract', number: '1', year: 2026, generatedAtUtc: '2026-10-01T06:00:00Z',
  status: 1, clientSigned: false, clientSignedAtUtc: null, providerSigned: false, providerSignedAtUtc: null,
  clientSignMethod: null, providerSignMethod: null, isSingleUse: false, validUntilUtc: null, consumedByCaseId: null, files: [],
  ...o,
})

describe('company helpers', () => {
  it('актуальный документ: ждущий подписи важнее действующего; остальные — в истории, свежие сверху', () => {
    const eff = doc({ id: 'eff', status: 2, generatedAtUtc: '2026-09-01T06:00:00Z' })
    const open = doc({ id: 'open', isSingleUse: true, generatedAtUtc: '2026-10-05T06:00:00Z' })
    const old = doc({ id: 'old', status: 4, generatedAtUtc: '2026-01-01T06:00:00Z' })
    expect(currentDoc([eff, old, open])?.id).toBe('open')
    expect(historyDocs([eff, old, open]).map((d) => d.id)).toEqual(['eff', 'old'])
    expect(currentDoc([old])).toBeNull()
  })

  it('статусы истории', () => {
    const now = Date.parse('2026-10-08T00:00:00Z')
    expect(historyStatus(doc({ status: 4 }), now)).toBe('revoked')
    expect(historyStatus(doc({ status: 0 }), now)).toBe('awaiting')
    expect(historyStatus(doc({ status: 3 }), now)).toBe('expired')
    expect(historyStatus(doc({ status: 2, validUntilUtc: '2026-01-01T00:00:00Z' }), now)).toBe('expired')
    expect(historyStatus(doc({ status: 2, isSingleUse: true, consumedByCaseId: 'c', validUntilUtc: '2099-01-01T00:00:00Z' }), now)).toBe('consumed')
    expect(historyStatus(doc({ status: 2, validUntilUtc: '2099-01-01T00:00:00Z' }), now)).toBe('effective')
  })

  it('шаги и шаг по умолчанию', () => {
    const none = companySteps({ profileComplete: false, contracts: [], poas: [] })
    expect([none.profile.key, none.contract.key, none.poa.key]).toEqual(['fill', 'afterProfile', 'afterContract'])
    expect(defaultStep(none)).toBe('profile')

    const awaitingUs = companySteps({ profileComplete: true, contracts: [doc({ clientSigned: true })], poas: [] })
    expect(awaitingUs.contract).toMatchObject({ done: false, tone: 'waiting', key: 'awaitingUs' })
    expect(awaitingUs.poa.key).toBe('afterContract')
    // От клиента по договору ничего не нужно — открываем доверенность.
    expect(defaultStep(awaitingUs)).toBe('poa')

    const done = companySteps({
      profileComplete: true,
      contracts: [doc({ status: 2, validUntilUtc: '2099-06-15T06:00:00Z' })],
      poas: [doc({ kind: 'poa', status: 2 })],
    })
    expect(done.contract).toMatchObject({ done: true, key: 'effectiveUntil', date: '15.06.2099' })
    expect(done.poa).toMatchObject({ done: true, key: 'effective' })
    expect(defaultStep(done)).toBe('contract')

    // Израсходованная разовая доверенность — шаг снова требует действия (как can-create на сервере).
    const consumed = companySteps({
      profileComplete: true,
      contracts: [doc({ status: 2 })],
      poas: [doc({ kind: 'poa', status: 2, isSingleUse: true, consumedByCaseId: 'c' })],
    })
    expect(consumed.poa).toMatchObject({ done: false, key: 'needGenerate' })
  })

  it('перечисление на языке интерфейса', () => {
    expect(joinList(['a', 'b', 'c'], 'ru')).toBe('a, b и c')
    expect(joinList(['a'], 'en')).toBe('a')
  })
})
