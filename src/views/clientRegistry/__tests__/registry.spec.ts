import { describe, expect, it } from 'vitest'
import ru from '@/i18n/locales/ru'
import kk from '@/i18n/locales/kk'
import en from '@/i18n/locales/en'
import { REGISTRY_CATEGORIES } from '@/api/clientRegistry'
import {
  categoryCounts, defaultDocKind, docTitle, fieldErrors, filterDocs, emptyFields, registryExcelRows, statusCounts, validityHint,
} from '../registry'
import { regDoc } from './registryFixture'

// Простой t для проверок: ключ и параметры строкой.
const t = (key: string, named?: Record<string, unknown>) => (named ? `${key}${JSON.stringify(named)}` : key)

const DOCS = [
  regDoc({ id: 'a', category: 'certificate', number: 'KZ-1', status: 'expiring', counterparty: 'ТОО Орган' }),
  regDoc({ id: 'b', category: 'supplyContract', number: 'SC-7', status: 'active', tnvedCodes: '8413 70' }),
  regDoc({ id: 'c', category: 'permit', number: 'P-2', status: 'expired' }),
  regDoc({ id: 'd', category: 'other', number: '', title: 'Письмо поставщика', status: 'unlimited', validUntil: null, daysLeft: null }),
]

describe('реестр документов: логика', () => {
  it('вид документа заявки по категории — как на сервере', () => {
    expect(defaultDocKind('supplyContract')).toBe('contract')
    expect(defaultDocKind('unk')).toBe('contract')
    expect(defaultDocKind('certificate')).toBe('certificate')
    expect(defaultDocKind('conformityDeclaration')).toBe('conformity')
    expect(defaultDocKind('permit')).toBe('permit')
    expect(defaultDocKind('license')).toBe('permit')
    expect(defaultDocKind('trois')).toBe('other')
    expect(defaultDocKind('other')).toBe('other')
  })

  it('фильтры: категория, статус, поиск по номеру/контрагенту/кодам/файлам', () => {
    expect(filterDocs(DOCS, '', 'all', 'all').map((d) => d.id)).toEqual(['a', 'b', 'c', 'd'])
    expect(filterDocs(DOCS, '', 'permit', 'all').map((d) => d.id)).toEqual(['c'])
    expect(filterDocs(DOCS, '', 'all', 'expired').map((d) => d.id)).toEqual(['c'])
    expect(filterDocs(DOCS, 'орган', 'all', 'all').map((d) => d.id)).toEqual(['a'])
    expect(filterDocs(DOCS, '841370', 'all', 'all').map((d) => d.id)).toEqual(['b'])
    expect(filterDocs(DOCS, 'письмо', 'all', 'all').map((d) => d.id)).toEqual(['d'])
  })

  it('счётчики статусов и категорий', () => {
    expect(statusCounts(DOCS, '', 'all')).toEqual({ all: 4, active: 1, expiring: 1, expired: 1, unlimited: 1 })
    expect(statusCounts(DOCS, '', 'certificate')).toEqual({ all: 1, active: 0, expiring: 1, expired: 0, unlimited: 0 })
    const cats = categoryCounts(DOCS)
    expect(cats.certificate).toBe(1)
    expect(cats.license).toBe(0)
  })

  it('заголовок и пояснение срока', () => {
    expect(docTitle(DOCS[0], t)).toBe('clientRegistry.category.certificate clientRegistry.numberShort{"n":"KZ-1"}')
    expect(docTitle(DOCS[3], t)).toBe('clientRegistry.category.other · Письмо поставщика')
    expect(validityHint({ status: 'expiring', daysLeft: 5 }, t)).toBe('clientRegistry.hint.left{"n":5}')
    expect(validityHint({ status: 'expiring', daysLeft: 0 }, t)).toBe('clientRegistry.hint.today')
    expect(validityHint({ status: 'expired', daysLeft: -3 }, t)).toBe('clientRegistry.hint.overdue{"n":3}')
    expect(validityHint({ status: 'unlimited', daysLeft: null }, t)).toBe('clientRegistry.hint.unlimited')
  })

  it('проверка формы — как на сервере', () => {
    expect(fieldErrors(emptyFields('certificate')).number).toBeDefined()
    expect(fieldErrors(emptyFields('other')).title).toBeDefined()
    expect(fieldErrors({ ...emptyFields('other'), title: 'x' })).toEqual({})
    expect(fieldErrors({ ...emptyFields('permit'), number: '1', issuedOn: '2026-05-01', validUntil: '2026-04-01' }).validUntil).toBeDefined()
    expect(fieldErrors({ ...emptyFields('permit'), number: '1', issuedOn: '2026-05-01', validUntil: '2026-05-01' })).toEqual({})
  })

  it('строки Excel', () => {
    const rows = registryExcelRows([regDoc({ clientName: 'ТОО «Клиент»', validUntil: '2026-11-01', daysLeft: 15 })], t)
    expect(rows[0]['clientRegistry.col.client']).toBe('ТОО «Клиент»')
    expect(rows[0]['clientRegistry.form.validUntil']).toBe('01.11.2026')
    expect(rows[0]['clientRegistry.col.daysLeft']).toBe(15)
    expect(rows[0]['clientRegistry.col.files']).toBe(1)
  })

  it('тексты есть на трёх языках, для всех категорий и статусов', () => {
    for (const loc of [ru, kk, en]) {
      const r = (loc as unknown as { clientRegistry: Record<string, Record<string, unknown>> }).clientRegistry
      for (const c of REGISTRY_CATEGORIES) expect(r.category[c]).toBeTruthy()
      for (const s of ['active', 'expiring', 'expired', 'unlimited']) expect(r.status[s]).toBeTruthy()
    }
    const keys = (o: unknown, p = ''): string[] => (o && typeof o === 'object'
      ? Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => keys(v, `${p}${k}.`))
      : [p])
    const ruKeys = keys(ru.clientRegistry).sort()
    expect(keys(kk.clientRegistry).sort()).toEqual(ruKeys)
    expect(keys(en.clientRegistry).sort()).toEqual(ruKeys)
  })
})
