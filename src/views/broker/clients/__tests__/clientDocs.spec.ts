import { describe, expect, it } from 'vitest'
import type { ClientDocumentRow } from '@/api/clientCard'
import ru from '@/i18n/locales/ru'
import { DOC_KINDS, DOC_STATES, docExcelRows, filterDocs, matchesDoc, needsAqniet, stateCounts, validity } from '../clientDocs'

const doc = (o: Partial<ClientDocumentRow>): ClientDocumentRow => ({
  id: 'd', clientId: 'c', clientName: 'ТОО «Клиент»', clientEmail: 'c@client.kz', kind: 'contract', number: '1', year: 2026, status: 2,
  clientSigned: true, providerSigned: true, isSingleUse: false, validUntilUtc: null, daysLeft: null, expiringSoon: false,
  consumedByCaseId: null, generatedAtUtc: '2026-10-02T04:00:00Z',
  ...o,
})
const ROWS = [
  doc({ id: 'a', clientName: 'ТОО «Казахмыс Трейд»', clientEmail: 'finance@kazakhmys.kz', number: '14', validUntilUtc: '2026-12-31T00:00:00Z', daysLeft: 84 }),
  doc({ id: 'b', clientName: 'ТОО «Altyn Med»', number: '21', status: 1, providerSigned: false }),
  doc({ id: 'c', clientName: 'ТОО «Ақжол Логистик»', kind: 'poa', number: '9', providerSigned: false, validUntilUtc: '2026-10-20T00:00:00Z', daysLeft: 12, expiringSoon: true }),
  doc({ id: 'd', clientName: 'ТОО «Nomad Build»', number: '19', status: 0, clientSigned: false, providerSigned: false }),
  doc({ id: 'e', clientName: 'ИП «Елубаев»', kind: 'poa', number: '2', status: 3, providerSigned: false, validUntilUtc: '2026-10-01T00:00:00Z', daysLeft: -7 }),
  doc({ id: 'f', clientName: 'ТОО «Алатау Строй»', number: '22', status: 1, providerSigned: false }),
  doc({ id: 'g', clientName: 'ТОО «Ждёт клиента»', number: '23', status: 1, clientSigned: false, providerSigned: false }),
]
const ids = (rs: ClientDocumentRow[]) => rs.map((r) => r.id)

describe('needsAqniet', () => {
  it('только договор: ждёт подписи, клиент подписал, AQNIET нет', () => {
    expect(ids(ROWS.filter(needsAqniet))).toEqual(['b', 'f'])
  })
  it('доверенность, отозванный, подписанный AQNIET и неподписанный клиентом — не в счёте', () => {
    expect(needsAqniet(doc({ kind: 'poa', status: 1, providerSigned: false }))).toBe(false)
    expect(needsAqniet(doc({ status: 4, providerSigned: false }))).toBe(false)
    expect(needsAqniet(doc({ status: 1, providerSigned: true }))).toBe(false)
    expect(needsAqniet(doc({ status: 1, clientSigned: false, providerSigned: false }))).toBe(false)
  })
})

describe('фильтры', () => {
  it('порядок видов и состояний', () => {
    expect(DOC_KINDS).toEqual(['all', 'contract', 'poa'])
    expect(DOC_STATES).toEqual(['all', 'active', 'expiring', 'awaiting', 'aqniet'])
  })
  it('состояние: действуют — статус 2; истекают — expiringSoon; ждут подписи — статус 1; AQNIET — needsAqniet', () => {
    expect(ids(filterDocs(ROWS, '', 'all', 'active'))).toEqual(['a', 'c'])
    expect(ids(filterDocs(ROWS, '', 'all', 'expiring'))).toEqual(['c'])
    expect(ids(filterDocs(ROWS, '', 'all', 'awaiting'))).toEqual(['b', 'f', 'g'])
    expect(ids(filterDocs(ROWS, '', 'all', 'aqniet'))).toEqual(['b', 'f'])
    expect(filterDocs(ROWS, '', 'all', 'all')).toHaveLength(7)
  })
  it('вид и состояние работают вместе', () => {
    expect(ids(filterDocs(ROWS, '', 'poa', 'all'))).toEqual(['c', 'e'])
    expect(ids(filterDocs(ROWS, '', 'poa', 'active'))).toEqual(['c'])
    expect(ids(filterDocs(ROWS, '', 'contract', 'expiring'))).toEqual([])
  })
  it('порядок строк — как пришли', () => {
    expect(ids(filterDocs([...ROWS].reverse(), '', 'all', 'all'))).toEqual(['g', 'f', 'e', 'd', 'c', 'b', 'a'])
  })
  it('поиск: клиент, email, номер и «номер/год»; без учёта регистра', () => {
    expect(matchesDoc('казахмыс', ROWS[0])).toBe(true)
    expect(matchesDoc('FINANCE@', ROWS[0])).toBe(true)
    expect(matchesDoc('14', ROWS[0])).toBe(true)
    expect(matchesDoc('14/2026', ROWS[0])).toBe(true)
    expect(matchesDoc('нет такого', ROWS[0])).toBe(false)
    expect(matchesDoc('  ', ROWS[0])).toBe(true)
    expect(ids(filterDocs(ROWS, 'altyn', 'all', 'awaiting'))).toEqual(['b'])
  })
  it('счётчики: поиск и вид учтены, состояние — нет', () => {
    expect(stateCounts(ROWS, '', 'all')).toEqual({ all: 7, active: 2, expiring: 1, awaiting: 3, aqniet: 2 })
    expect(stateCounts(ROWS, '', 'poa')).toEqual({ all: 2, active: 1, expiring: 1, awaiting: 0, aqniet: 0 })
    expect(stateCounts(ROWS, 'altyn', 'all')).toEqual({ all: 1, active: 0, expiring: 0, awaiting: 1, aqniet: 1 })
  })
})

describe('срок действия', () => {
  it('осталось дней; у истекающего soon', () => {
    expect(validity(ROWS[0])).toEqual({ date: '31.12.2026', hint: { kind: 'left', n: 84, soon: false } })
    expect(validity(ROWS[2]).hint).toEqual({ kind: 'left', n: 12, soon: true })
  })
  it('просрочен: число дней без знака', () => {
    expect(validity(ROWS[4])).toEqual({ date: '01.10.2026', hint: { kind: 'overdue', n: 7, soon: false } })
  })
  it('без даты: «без срока» только у действующего, у черновика и ждущего подписи — просто тире', () => {
    expect(validity(doc({ status: 2 }))).toEqual({ date: '—', hint: { kind: 'unlimited', n: 0, soon: false } })
    expect(validity(ROWS[1])).toEqual({ date: '—', hint: null })
    expect(validity(ROWS[3])).toEqual({ date: '—', hint: null })
  })
  it('дата есть, дней нет — только дата', () => {
    expect(validity(doc({ validUntilUtc: '2026-12-31T00:00:00Z', daysLeft: null }))).toEqual({ date: '31.12.2026', hint: null })
  })
})

describe('Excel', () => {
  const t = (k: string): string => k.split('.').reduce<unknown>((o, p) => (o as Record<string, unknown>)?.[p], ru) as string
  it('заголовки разные: имя клиента и подпись клиента — разные колонки', () => {
    const [row] = docExcelRows([ROWS[0]], t)
    const keys = Object.keys(row)
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys).toEqual([
      'Клиент', 'Email', 'Документ', 'Номер', 'Статус', 'Разовый', 'Подпись клиента', 'Подпись AQNIET', 'Срок действия', 'Осталось дней',
    ])
  })
  it('значения', () => {
    const rows = docExcelRows([ROWS[0], ROWS[1], ROWS[4]], t)
    expect(rows[0]).toMatchObject({
      Клиент: 'ТОО «Казахмыс Трейд»', Документ: 'Договор', Номер: '14/2026', Статус: 'Действует', Разовый: 'нет',
      'Подпись клиента': 'да', 'Подпись AQNIET': 'да', 'Срок действия': '31.12.2026', 'Осталось дней': 84,
    })
    expect(rows[1]).toMatchObject({ Статус: 'Ждёт подписи', 'Подпись AQNIET': 'нет', 'Срок действия': '', 'Осталось дней': '' })
    expect(rows[2]).toMatchObject({ Документ: 'Доверенность', Статус: 'Истёк', 'Осталось дней': -7 })
  })
})
