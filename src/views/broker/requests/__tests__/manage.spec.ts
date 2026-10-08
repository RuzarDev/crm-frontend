import { describe, expect, it } from 'vitest'
import type { ManageCase, StaffMember } from '@/api/manage'
import {
  HEAVY_LOAD, defaultSegment, loadPercent, needsDeclarant, needsKpp, segmentCounts, segmentOf, staffLoad,
} from '../manage'

const c = (o: Partial<ManageCase> = {}): ManageCase => ({
  id: 'c1', number: 'ИМ-2026-0001', clientName: 'ТОО Альфа', cargo: 'кабель', post: 'Нур-Жолы', status: 2, isProblem: false, problemNote: '',
  assignedKppId: null, assignedDeclarantId: null, createdAtUtc: '2026-10-01T08:00:00Z', updatedAtUtc: '2026-10-08T08:00:00Z',
  daysInWork: 3, daysSinceUpdate: 0, declarationsCount: 0,
  ...o,
})
const u = (id: string, roles: string[], displayName: string | null = id): StaffMember => ({ id, username: `${id}-login`, displayName, roles })

describe('сегменты', () => {
  const cases = [
    c({ id: 'a', status: 2 }), // нужен декларант, нет
    c({ id: 'b', status: 3, assignedDeclarantId: 'd1' }), // декларант есть
    c({ id: 'e', status: 1 }), // нужен КПП, нет
    c({ id: 'f', status: 4, assignedKppId: 'k1' }), // КПП есть
    c({ id: 'g', status: 7 }), // ждёт оплаты — ни декларант, ни КПП не нужны
    c({ id: 'h', status: 2, isProblem: true, assignedDeclarantId: 'd1', daysSinceUpdate: 5 }),
    c({ id: 'i', status: 5, daysSinceUpdate: 4 }),
  ]
  it('«Без декларанта» — нужен по шагу (2, 3) и не назначен', () => {
    expect(segmentOf(cases, 'noDeclarant').map((x) => x.id)).toEqual(['a'])
  })
  it('«Без КПП» — нужен по шагу (1, 4, 5, 6) и не назначен; шаг 7 и шаги декларанта не считаются', () => {
    expect(segmentOf(cases, 'noKpp').map((x) => x.id)).toEqual(['e', 'i'])
  })
  it('«С проблемой», «Зависли» (5 дней и больше), «Все»', () => {
    expect(segmentOf(cases, 'problem').map((x) => x.id)).toEqual(['h'])
    expect(segmentOf(cases, 'stale').map((x) => x.id)).toEqual(['h'])
    expect(segmentOf(cases, 'all')).toHaveLength(7)
  })
  it('счётчики по всем сегментам', () => {
    expect(segmentCounts(cases)).toEqual({ noDeclarant: 1, noKpp: 2, problem: 1, stale: 1, all: 7 })
  })
  it('нужен декларант/КПП — по шагам, как на сервере', () => {
    expect([1, 2, 3, 4, 5, 6, 7].filter(needsDeclarant)).toEqual([2, 3])
    expect([1, 2, 3, 4, 5, 6, 7].filter(needsKpp)).toEqual([1, 4, 5, 6])
  })
})

describe('сегмент по умолчанию', () => {
  it('первый непустой из четырёх рабочих', () => {
    expect(defaultSegment([c({ status: 2 }), c({ status: 1 })])).toBe('noDeclarant')
    expect(defaultSegment([c({ status: 1 })])).toBe('noKpp')
    expect(defaultSegment([c({ status: 7, isProblem: true })])).toBe('problem')
    expect(defaultSegment([c({ status: 7, daysSinceUpdate: 9 })])).toBe('stale')
  })
  it('все назначены, проблем и зависших нет — «Все активные»; пусто — тоже', () => {
    expect(defaultSegment([c({ status: 2, assignedDeclarantId: 'd1' })])).toBe('all')
    expect(defaultSegment([])).toBe('all')
  })
})

describe('нагрузка сотрудников', () => {
  const staff = [u('d1', ['declarant']), u('k1', ['kpp']), u('x', ['sales']), u('both', ['declarant', 'kpp', 'sales'], null)]
  it('только декларанты и КПП, по убыванию; без имени — логин; в ролях только рабочие', () => {
    const cases = [
      c({ assignedDeclarantId: 'd1', assignedKppId: 'k1' }),
      c({ assignedDeclarantId: 'd1' }),
      c({ assignedKppId: 'k1' }),
      c({ assignedDeclarantId: 'd1' }),
    ]
    const load = staffLoad(staff, cases)
    expect(load.map((s) => [s.id, s.count])).toEqual([['d1', 3], ['k1', 2], ['both', 0]])
    expect(load[2]).toMatchObject({ name: 'both-login', roles: ['declarant', 'kpp'] })
  })
  it('заявка с одним человеком в двух ролях считается один раз', () => {
    const load = staffLoad([u('both', ['declarant', 'kpp'])], [c({ assignedDeclarantId: 'both', assignedKppId: 'both' }), c({ assignedKppId: 'both' })])
    expect(load[0].count).toBe(2)
  })
  it('полоса: пропорционально максимуму, у ненулевых не меньше 6%, у нуля — 0', () => {
    expect(loadPercent(10, 10)).toBe(100)
    expect(loadPercent(5, 10)).toBe(50)
    expect(loadPercent(1, 100)).toBe(6)
    expect(loadPercent(0, 10)).toBe(0)
    expect(loadPercent(0, 0)).toBe(0)
    expect(HEAVY_LOAD).toBe(10)
  })
})
