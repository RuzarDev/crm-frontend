import { describe, expect, it } from 'vitest'
import type { DtAccessUser } from '@/views/import40/dtAccess'
import {
  adjacentSection, dtsReadinessItems, navMarks, paymentsStale, rateTag, readonlyReason, sectionFromQuery, splitChildren, visibleSections,
} from '../dtPageModel'
import { caseDto, fullDto } from './dtFixture'

const user = (o: Partial<DtAccessUser> = {}): DtAccessUser =>
  ({ isAdmin: false, isClient: false, isRop: false, canDeclare: true, userId: 'me', ...o })

describe('разделы и ?s=', () => {
  it('ДТС — только с правом декларанта; порядок как на доске', () => {
    expect(visibleSections(true)).toEqual(
      ['number', 'general', 'parties', 'countries', 'transport', 'finance', 'customs', 'goods', 'docs', 'dts', 'closing'])
    expect(visibleSections(false)).not.toContain('dts')
  })
  it('раздел из адреса: известный — он, чужой или скрытый — «Номер и дата»', () => {
    const keys = visibleSections(false)
    expect(sectionFromQuery('parties', keys)).toBe('parties')
    expect(sectionFromQuery(['goods'], keys)).toBe('goods')
    expect(sectionFromQuery('dts', keys)).toBe('number')
    expect(sectionFromQuery('zzz', keys)).toBe('number')
    expect(sectionFromQuery(undefined, keys)).toBe('number')
  })
  it('соседний раздел; у края — null', () => {
    const keys = visibleSections(true)
    expect(adjacentSection(keys, 'number', 1)).toBe('general')
    expect(adjacentSection(keys, 'general', -1)).toBe('number')
    expect(adjacentSection(keys, 'number', -1)).toBeNull()
    expect(adjacentSection(keys, 'closing', 1)).toBeNull()
  })
})

describe('отметки разделов', () => {
  const keys = visibleSections(true)
  it('число — пунктов не хватает; галочка — проверено сервером и пусто; кружок — сервер не проверяет или нет ответа', () => {
    const m = navMarks({ keys, readinessLoaded: true, bySection: { parties: 2, goods: 1 }, dtsLoaded: false })
    expect(m.parties).toEqual({ kind: 'count', count: 2 })
    expect(m.goods).toEqual({ kind: 'count', count: 1 })
    expect(m.countries).toEqual({ kind: 'done' })
    expect(m.number).toEqual({ kind: 'done' })
    // Сервер не проверяет гр. 1, 3–7 и 48–54 — «готово» там было бы ложью.
    expect(m.general).toEqual({ kind: 'unknown' })
    expect(m.closing).toEqual({ kind: 'unknown' })
    expect(m.dts).toEqual({ kind: 'unknown' })
  })
  it('без ответа готовности — ни одной галочки (B4)', () => {
    const m = navMarks({ keys, readinessLoaded: false, bySection: {}, dtsLoaded: false })
    expect(Object.values(m).every((x) => x.kind === 'unknown')).toBe(true)
  })
  it('ДТС: галочка по ответу GET …/dts без пунктов, число — пункты ДТС', () => {
    expect(navMarks({ keys, readinessLoaded: false, bySection: {}, dtsLoaded: true }).dts).toEqual({ kind: 'done' })
    expect(navMarks({ keys, readinessLoaded: true, bySection: { dts: 3 }, dtsLoaded: true }).dts).toEqual({ kind: 'count', count: 3 })
  })
  it('платежи устарели: признак пересчёта или товар без гр. 47; без товаров — нет', () => {
    expect(paymentsStale([])).toBe(false)
    expect(paymentsStale([{ payments: [{}] }])).toBe(false)
    expect(paymentsStale([{ payments: [{}], needsTpinRecalc: true }])).toBe(true)
    expect(paymentsStale([{ payments: [{}] }, { payments: [] }])).toBe(true)
  })
})

describe('тег ЕТТ/ВТО', () => {
  it('разделена, роль разделения, тип ставок', () => {
    expect(rateTag(fullDto({ isSplitReplaced: true, splitRole: 'VTO' }))).toEqual({ kind: 'replaced' })
    expect(rateTag(fullDto({ splitRole: 'VTO', rateType: 'ETT' }))).toEqual({ kind: 'vto' })
    expect(rateTag(fullDto({ splitRole: 'ETT', rateType: 'EATT' }))).toEqual({ kind: 'ett' })
    expect(rateTag(fullDto({ splitRole: null, rateType: 'eatt' }))).toEqual({ kind: 'vto' })
    expect(rateTag(fullDto({ splitRole: null, rateType: null }))).toEqual({ kind: 'ett' })
    expect(rateTag(null)).toBeNull()
  })
  it('ДТ, заменившие разделённую', () => {
    const kase = caseDto({
      declarations: [
        fullDto({ id: 'src', isSplitReplaced: true }),
        fullDto({ id: 'e', splitSourceDeclarationId: 'src', splitRole: 'ETT' }),
        fullDto({ id: 'v', splitSourceDeclarationId: 'src', splitRole: 'VTO' }),
        fullDto({ id: 'other', splitSourceDeclarationId: 'x', splitRole: 'VTO' }),
      ],
    })
    expect(splitChildren(kase, 'src')).toMatchObject({ ett: { id: 'e' }, vto: { id: 'v' } })
    expect(splitChildren(kase, 'e')).toEqual({ ett: null, vto: null })
  })
})

describe('причина «только просмотр»', () => {
  const kase = (status: number, assigned: string | null) => caseDto({ status, assignedDeclarantId: assigned })
  it('админ и РОП правят всегда', () => {
    expect(readonlyReason(user({ isAdmin: true }), kase(5, 'other'))).toBeNull()
    expect(readonlyReason(user({ isRop: true, canDeclare: false }), kase(5, 'other'))).toBeNull()
  })
  it('клиент; без права декларанта', () => {
    expect(readonlyReason(user({ isClient: true, canDeclare: false }), kase(1, null))).toBe('client')
    expect(readonlyReason(user({ canDeclare: false }), kase(1, null))).toBe('role')
  })
  it('декларант: до «Декларирования» — правит; потом — только назначенный или если никто не назначен', () => {
    expect(readonlyReason(user(), kase(1, 'other'))).toBeNull()
    expect(readonlyReason(user(), kase(2, null))).toBeNull()
    expect(readonlyReason(user(), kase(2, 'me'))).toBeNull()
    expect(readonlyReason(user(), kase(4, 'other'))).toBe('assigned')
  })
})

describe('пункты ДТС', () => {
  it('из items — только графа «ДТС»; без items — строки «ДТС: …»', () => {
    expect(dtsReadinessItems({
      missing: ['x', 'y'],
      items: [{ text: 'Отправитель (гр.2)', graph: '2', goodsIndex: null }, { text: 'ДТС: товар 2 без метода', graph: 'ДТС', goodsIndex: 1 }],
    })).toEqual([{ text: 'ДТС: товар 2 без метода', graph: 'ДТС', goodsIndex: 1, section: 'dts', fromXml: false }])
    expect(dtsReadinessItems({ missing: ['Отправитель (гр.2)', 'ДТС: нет места'] }).map((i) => i.text)).toEqual(['ДТС: нет места'])
  })
})
