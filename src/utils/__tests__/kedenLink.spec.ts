import { describe, expect, it } from 'vitest'
import { createI18n } from 'vue-i18n'
import ru from '@/i18n/locales/ru'
import kk from '@/i18n/locales/kk'
import en from '@/i18n/locales/en'
import type { KedenLinkDto } from '@/api/kedenLink'
import { caseDto, declaration } from '@/views/client/__tests__/caseFixture'
import { notificationTarget } from '@/shell/notificationTarget'
import { declaringSubstages } from '@/utils/import40StageModel'
import {
  KEDEN_DOCS_NOTIFICATION, KEDEN_STATUS_NOTIFICATION, isKedenReleased, kedenCaseSummary, kedenChipText,
  kedenCorridorText, kedenCustomsRequestPath, kedenNotificationDtPath, kedenTone, kedenUnlinked,
} from '../kedenLink'

const i18n = createI18n({ legacy: false, locale: 'ru', messages: { ru } })
const t = i18n.global.t as unknown as (k: string, p?: Record<string, unknown>) => string
const te = i18n.global.te as unknown as (k: string) => boolean

const link = (o: Partial<KedenLinkDto> = {}): KedenLinkDto => ({
  linked: true, kedenDeclarationId: 'k1', source: 'number', linkedAtUtc: '2026-10-17T08:00:00Z',
  registrationNumber: '55302/171026/0000001', statusCode: null, statusName: 'Зарегистрирована', statusKind: 'registered',
  statusAtUtc: '2026-10-17T09:00:00Z', corridor: null, dhtNumber: null, numberConflict: null, ...o,
})

describe('чип КЕДЕН', () => {
  it('тон и подпись по виду статуса; без связи — серый «нет связи»', () => {
    expect(kedenTone(null)).toBe('neutral')
    expect(kedenChipText(null, t)).toBe('нет связи')
    expect(kedenTone(link({ linked: false }))).toBe('neutral')
    expect(kedenTone(link())).toBe('submitted')
    expect(kedenTone(link({ statusKind: 'released' }))).toBe('done')
    expect(kedenTone(link({ statusKind: 'docsRequired' }))).toBe('wait')
    expect(kedenTone(link({ statusKind: 'refused' }))).toBe('danger')
    expect(kedenTone(link({ statusKind: 'other' }))).toBe('info')
    expect(kedenChipText(link({ statusName: 'Выпущена' }), t)).toBe('Выпущена')
    expect(kedenChipText(link({ statusName: null }), t)).toBe('статус не получен')
  })
  it('коридор: перевод или «КЕДЕН не передал»', () => {
    expect(kedenCorridorText('yellow', t, te)).toBe('жёлтый')
    expect(kedenCorridorText(null, t, te)).toBe('КЕДЕН не передал')
  })
  it('выпуск — и обычный, и условный', () => {
    expect(isKedenReleased(link({ statusKind: 'conditionalRelease' }))).toBe(true)
    expect(isKedenReleased(link({ statusKind: 'registered' }))).toBe(false)
    expect(isKedenReleased(link({ linked: false, statusKind: 'released' }))).toBe(false)
  })
})

describe('сводка по ДТ заявки', () => {
  it('без связанных ДТ — null; исходная ДТ разделения не считается', () => {
    expect(kedenCaseSummary([declaration()])).toBeNull()
    expect(kedenCaseSummary([declaration({ isSplitReplaced: true, keden: link() })])).toBeNull()
  })
  it('счётчики, флаги и время', () => {
    const s = kedenCaseSummary([
      declaration({ id: 'a', keden: link({ statusKind: 'released', statusName: 'Выпущена', statusAtUtc: '2026-10-17T10:00:00Z' }) }),
      declaration({ id: 'b', keden: link({ statusKind: 'docsRequired', statusName: 'Запрос', statusAtUtc: '2026-10-17T11:00:00Z' }) }),
      declaration({ id: 'c' }),
    ])!
    expect(s).toMatchObject({ total: 3, linked: 2, released: 1, docs: true, refused: false, latestName: 'Запрос', firstAtUtc: '2026-10-17T10:00:00Z' })
  })
})

describe('подэтапы шага 3 по КЕДЕН (сотрудник)', () => {
  it('заявка ещё на заполнении, а КЕДЕН уже зарегистрировал — подача готова, «отметьте подачу»', () => {
    const kase = caseDto({ status: 2, declarations: [declaration({ keden: link() })] })
    const sub = declaringSubstages({ audience: 'staff', kase, stages: null, invoices: [] }, t, te)
    expect(sub.map((s) => s.state)).toEqual(['done', 'done', 'current', 'todo'])
    expect(sub[1]!.caption).toMatch(/^КЕДЕН: зарегистрирована · .+ · отметьте подачу$/)
    expect(sub[2]!.caption).toBe('КЕДЕН: Зарегистрирована')
  })
  it('запрос документов из КЕДЕН — «Коридор» красным', () => {
    const kase = caseDto({ status: 3, declarations: [declaration({ corridor: 'yellow', keden: link({ statusKind: 'docsRequired', statusName: 'Требуются документы' }) })] })
    const sub = declaringSubstages({ audience: 'staff', kase, stages: null, invoices: [] }, t, te)
    expect(sub[2]).toMatchObject({ state: 'current', tone: 'problem', caption: 'жёлтый коридор · КЕДЕН: запрос документов' })
  })
  it('КЕДЕН выпустил все ДТ — выпуск готов с подсказкой; часть — «выпущено N из M»', () => {
    const all = caseDto({ status: 3, declarations: [declaration({ keden: link({ statusKind: 'released', statusName: 'Выпущена' }) })] })
    const sub = declaringSubstages({ audience: 'staff', kase: all, stages: null, invoices: [] }, t, te)
    expect(sub.map((s) => s.state)).toEqual(['done', 'done', 'done', 'done'])
    expect(sub[3]!.caption).toMatch(/^КЕДЕН: выпуск · .+ · отметьте выпуск$/)
    const part = caseDto({ status: 3, declarations: [
      declaration({ id: 'a', keden: link({ statusKind: 'released' }) }), declaration({ id: 'b', keden: link() }),
    ] })
    const sub2 = declaringSubstages({ audience: 'staff', kase: part, stages: null, invoices: [] }, t, te)
    expect(sub2[3]).toMatchObject({ state: 'current', caption: 'КЕДЕН: выпущено 1 из 2' })
  })
  it('клиенту подэтапы по-прежнему по статусу заявки', () => {
    const kase = caseDto({ status: 2, declarations: [declaration({ keden: link({ statusKind: 'released' }) })] })
    expect(declaringSubstages({ audience: 'client', kase, stages: null, invoices: [] }, t, te).map((s) => s.state))
      .toEqual(['current', 'todo', 'todo', 'todo'])
  })
})

describe('список и уведомления', () => {
  it('«Нет связи с КЕДЕН» — только поданные заявки с несвязанной ДТ', () => {
    expect(kedenUnlinked({ status: 3, kedenUnlinkedCount: 1 })).toBe(true)
    expect(kedenUnlinked({ status: 8, kedenUnlinkedCount: 2 })).toBe(true)
    expect(kedenUnlinked({ status: 2, kedenUnlinkedCount: 1 })).toBe(false)
    expect(kedenUnlinked({ status: 9, kedenUnlinkedCount: 1 })).toBe(false)
    expect(kedenUnlinked({ status: 4, kedenUnlinkedCount: 0 })).toBe(false)
    expect(kedenUnlinked({ status: 4 })).toBe(false)
  })
  it('уведомление КЕДЕН ведёт на ДТ; «Завести запрос таможни» — только у запроса документов', () => {
    const docs = { type: KEDEN_DOCS_NOTIFICATION, caseId: 'c 1', declarationId: 'd1', reestrEntryId: null }
    expect(kedenNotificationDtPath(docs)).toBe('/import-40/c%201/dt/d1')
    expect(kedenCustomsRequestPath(docs)).toBe('/import-40/c%201/dt/d1?customsRequest=new')
    const status = { ...docs, type: KEDEN_STATUS_NOTIFICATION }
    expect(kedenCustomsRequestPath(status)).toBeNull()
    expect(notificationTarget(status, false)).toBe('/import-40/c%201/dt/d1')
    expect(notificationTarget(status, true)).toBe('/billing?case=c%201')
    expect(kedenNotificationDtPath({ ...docs, declarationId: null })).toBeNull()
    expect(kedenNotificationDtPath({ ...docs, type: 'Import40Transition' })).toBeNull()
  })
})

describe('переводы kedenLink', () => {
  const keys = (o: unknown, prefix = ''): string[] =>
    o && typeof o === 'object'
      ? Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k))
      : [prefix]
  it('ru, kk, en — одинаковый набор ключей', () => {
    const r = keys((ru as Record<string, unknown>).kedenLink).sort()
    expect(keys((kk as Record<string, unknown>).kedenLink).sort()).toEqual(r)
    expect(keys((en as Record<string, unknown>).kedenLink).sort()).toEqual(r)
    expect(r.length).toBeGreaterThan(40)
  })
})
