import { describe, expect, it } from 'vitest'
import type { Import40DocumentDto } from '@/api/import40Contract'
import { companySteps, currentDoc, endOfDayUtc, historyDocs, historyStatus, joinList, validDate, type RegistrationSnapshot } from '../company'

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

  const reg = (o: Partial<RegistrationSnapshot>): RegistrationSnapshot => ({
    profileDone: true, contractDone: false, poaDone: false, contractAwaitingUs: false, ...o,
  })

  it('шаги: «готово» — только по can-create, документы — для показа', () => {
    const none = companySteps({ reg: reg({ profileDone: false }), contracts: [], poas: [] })
    expect([none.profile.key, none.contract.key, none.poa.key]).toEqual(['fill', 'afterProfile', 'afterProfile'])
    expect(none.contract.tone).toBe('later')

    // Договор ждёт только AQNIET; доверенность при заполненных реквизитах — активный шаг.
    const awaitingUs = companySteps({ reg: reg({ contractAwaitingUs: true }), contracts: [doc({ clientSigned: true })], poas: [] })
    expect(awaitingUs.contract).toMatchObject({ done: false, tone: 'waiting', key: 'awaitingUs' })
    expect(awaitingUs.poa).toMatchObject({ done: false, tone: 'action', key: 'needGenerate' })

    const needSign = companySteps({ reg: reg({}), contracts: [doc({})], poas: [doc({ kind: 'poa' })] })
    expect([needSign.contract.key, needSign.poa.key]).toEqual(['needSign', 'needSign'])

    const done = companySteps({
      reg: reg({ contractDone: true, poaDone: true }),
      contracts: [doc({ status: 2, validUntilUtc: '2099-06-15T23:59:59Z' })],
      poas: [doc({ kind: 'poa', status: 2 })],
    })
    expect(done.contract).toMatchObject({ done: true, key: 'effectiveUntil', date: '15.06.2099' })
    expect(done.poa).toMatchObject({ done: true, key: 'effective' })
  })

  it('документ действует, но сервер не принимает его для новой поставки — «Нужен новый документ», шаг активный', () => {
    // Разовый договор привязан к открытой поставке: локально «действует», can-create — contractOk=false.
    const busy = doc({ status: 2, isSingleUse: true, clientSigned: true, providerSigned: true })
    const s = companySteps({ reg: reg({ poaDone: true }), contracts: [busy], poas: [doc({ kind: 'poa', status: 2 })] })
    expect(s.contract).toMatchObject({ done: false, tone: 'action', key: 'needNew' })
    // И наоборот: сервер сказал «готово» — шаг готов, даже если локально документ не распознан действующим.
    const trust = companySteps({ reg: reg({ contractDone: true }), contracts: [], poas: [] })
    expect(trust.contract).toMatchObject({ done: true, key: 'effective' })
    // Израсходованная разовая доверенность — тоже «нужен новый».
    const consumed = companySteps({ reg: reg({ contractDone: true }), contracts: [], poas: [doc({ kind: 'poa', status: 2, isSingleUse: true, consumedByCaseId: 'c' })] })
    expect(consumed.poa).toMatchObject({ done: false, key: 'needNew' })
  })

  it('срок действия — по UTC: 31.12 23:59:59Z не «переезжает» на 01.01; конец дня — по UTC', () => {
    expect(validDate('2026-12-31T23:59:59Z')).toBe('31.12.2026')
    expect(validDate('2027-01-01T00:00:00Z')).toBe('01.01.2027')
    expect(validDate(null)).toBe('')
    expect(endOfDayUtc('2027-03-05')).toBe('2027-03-05T23:59:59.000Z')
  })

  it('перечисление на языке интерфейса', () => {
    expect(joinList(['a', 'b', 'c'], 'ru')).toBe('a, b и c')
    expect(joinList(['a'], 'en')).toBe('a')
  })
})
