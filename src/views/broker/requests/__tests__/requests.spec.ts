import { describe, expect, it } from 'vitest'
import type { Import40BoardRow } from '@/api/import40Board'
import {
  EXECUTOR_NONE, clientOptions, emptyFilters, executorInfo, executorOptions, executorText, filterRows, formatTnved,
  hasFilters, inTab, needsDeclarant, needsKpp, parseTab, shortName, stageTone, tabCounts, tabOf,
} from '../requests'

const T: Record<string, string> = {
  'import40Case.you': 'вы',
  'import40Case.staffAssigned': 'назначен',
  'broker.requests.unassigned': 'не назначен',
  'broker.requests.unassignedOption': 'Не назначен',
}
const t = (k: string) => T[k] ?? k

const row = (o: Partial<Import40BoardRow> = {}): Import40BoardRow => ({
  id: 'r1', number: 'ИМ-2026-0182', clientId: 'c1', clientName: 'ТОО «Казахмыс Трейд»', cargo: 'ноутбуки', post: 'Нур-Жолы',
  status: 2, step: 3, isProblem: false, hasClientMessage: false,
  assignedDeclarantId: null, assignedDeclarantName: null, assignedKppId: null, assignedKppName: null,
  containerNumbers: [], declarationsCount: 0, tnvedCodes: [], customsPaymentsKzt: 0,
  createdAtUtc: '2026-10-01T08:00:00Z', updatedAtUtc: '2026-10-08T08:00:00Z',
  ...o,
})

describe('вкладки', () => {
  it('«В работе» — статусы 1–7, черновики и завершённые отдельно', () => {
    for (const s of [1, 2, 3, 4, 5, 6, 7]) expect(inTab(row({ status: s }), 'active')).toBe(true)
    for (const s of [0, 8, 9]) expect(inTab(row({ status: s }), 'active')).toBe(false)
    expect(inTab(row({ status: 0 }), 'drafts')).toBe(true)
    expect(inTab(row({ status: 2 }), 'drafts')).toBe(false)
    expect(inTab(row({ status: 8 }), 'done')).toBe(true)
    expect(inTab(row({ status: 9 }), 'done')).toBe(true)
    expect(inTab(row({ status: 7 }), 'done')).toBe(false)
  })
  it('«Ждут клиента»: счёт выставлен или проблема с вопросом клиенту', () => {
    expect(inTab(row({ status: 6 }), 'waiting')).toBe(true)
    expect(inTab(row({ status: 3, isProblem: true, hasClientMessage: true }), 'waiting')).toBe(true)
    expect(inTab(row({ status: 3, isProblem: true, hasClientMessage: false }), 'waiting')).toBe(false)
    expect(inTab(row({ status: 3, isProblem: false, hasClientMessage: true }), 'waiting')).toBe(false)
    // «Ждут клиента» — подмножество «В работе»: завершённая заявка с хвостом проблемы сюда не попадает.
    expect(inTab(row({ status: 8, isProblem: true, hasClientMessage: true }), 'waiting')).toBe(false)
    expect(inTab(row({ status: 9, isProblem: true, hasClientMessage: true }), 'waiting')).toBe(false)
  })
  it('«Мои» — любая строка ответа view=my', () => {
    expect(inTab(row({ status: 8 }), 'my')).toBe(true)
  })
  it('tabOf — главная вкладка заявки', () => {
    expect(tabOf(row({ status: 0 }))).toBe('drafts')
    expect(tabOf(row({ status: 9 }))).toBe('done')
    expect(tabOf(row({ status: 6 }))).toBe('waiting')
    expect(tabOf(row({ status: 2, isProblem: true, hasClientMessage: true }))).toBe('waiting')
    expect(tabOf(row({ status: 2 }))).toBe('active')
  })
  it('tabCounts считает вкладки «все»', () => {
    const rows = [row({ id: 'a', status: 2 }), row({ id: 'b', status: 6 }), row({ id: 'c', status: 0 }), row({ id: 'd', status: 8 }), row({ id: 'e', status: 9 })]
    expect(tabCounts(rows)).toEqual({ active: 2, waiting: 1, drafts: 1, done: 2 })
  })
  it('parseTab: all → active, мусор → null', () => {
    expect(parseTab('all')).toBe('active')
    expect(parseTab('my')).toBe('my')
    expect(parseTab('done')).toBe('done')
    expect(parseTab('x')).toBeNull()
    expect(parseTab(undefined)).toBeNull()
    expect(parseTab(['my'])).toBeNull()
  })
})

describe('этап и исполнитель', () => {
  it('stageTone по статусам', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(stageTone)).toEqual(
      ['neutral', 'wait', 'info', 'submitted', 'done', 'pay', 'wait', 'wait', 'done', 'neutral'],
    )
  })
  it('needsKpp / needsDeclarant', () => {
    expect([1, 4, 5, 6].every(needsKpp)).toBe(true)
    expect([0, 2, 3, 7, 8].some(needsKpp)).toBe(false)
    expect([2, 3].every(needsDeclarant)).toBe(true)
    expect([0, 1, 4, 5, 6, 7, 8].some(needsDeclarant)).toBe(false)
  })
  it('своё имя — «вы», чужое — по имени, без имени — «назначен»', () => {
    const r = row({ status: 2, assignedDeclarantId: 'me', assignedDeclarantName: 'Айгерим Касымова', assignedKppId: 'k1', assignedKppName: 'Данияр С.' })
    expect(executorText(r, 'me', t)).toBe('вы · Данияр С.')
    expect(executorText(r, 'other', t)).toBe('Айгерим Касымова · Данияр С.')
    expect(executorText(row({ status: 2, assignedDeclarantId: 'x', assignedDeclarantName: null }), 'me', t)).toBe('назначен')
  })
  it('shortName: «Имя Ф.» для узкой колонки', () => {
    expect(shortName('Айгерим Касымова')).toBe('Айгерим К.')
    expect(shortName('  данияр   сейтов  ')).toBe('данияр С.')
    expect(shortName('aigerim')).toBe('aigerim')
    const r = row({ status: 2, assignedDeclarantId: 'd', assignedDeclarantName: 'Айгерим Касымова', assignedKppId: 'me', assignedKppName: 'Жанна Омарова' })
    expect(executorInfo(r, 'me', t, true).text).toBe('Айгерим К. · вы')
    expect(executorInfo(r, 'me', t).text).toBe('Айгерим Касымова · вы')
  })
  it('«не назначен» — только когда исполнитель нужен на этом шаге', () => {
    expect(executorInfo(row({ status: 1 }), null, t)).toEqual({ text: '', missing: true })
    expect(executorText(row({ status: 3 }), null, t)).toBe('не назначен')
    // на шаге, где никто не нужен (оплата услуг, завершена, черновик), — прочерк
    for (const s of [0, 7, 8, 9]) expect(executorText(row({ status: s }), null, t)).toBe('—')
    // нужный на месте — не «не назначен»: декларант нужен, назначен КПП
    expect(executorInfo(row({ status: 2, assignedKppId: 'k', assignedKppName: 'Данияр' }), null, t)).toEqual({ text: 'Данияр', missing: true })
    expect(executorInfo(row({ status: 2, assignedDeclarantId: 'd', assignedDeclarantName: 'Жанна' }), null, t)).toEqual({ text: 'Жанна', missing: false })
    expect(executorText(row({ status: 7, assignedDeclarantId: 'd', assignedDeclarantName: 'Жанна' }), null, t)).toBe('Жанна')
  })
})

describe('formatTnved', () => {
  it('10 цифр → «8471 30 000 0», иное — как есть', () => {
    expect(formatTnved('8471300000')).toBe('8471 30 000 0')
    expect(formatTnved('847130')).toBe('847130')
    expect(formatTnved('')).toBe('')
  })
})

describe('filterRows', () => {
  const a = row({ id: 'a', number: 'ИМ-2026-0001', clientId: 'c1', clientName: 'ТОО Альфа', cargo: 'ноутбуки', post: 'Нур-Жолы', status: 2, assignedDeclarantId: 'd1', assignedDeclarantName: 'Айгерим', tnvedCodes: ['8471300000'], containerNumbers: ['MSKU1234567'], updatedAtUtc: '2026-10-05T10:00:00Z' })
  const b = row({ id: 'b', number: 'ИМ-2026-0002', clientId: 'c2', clientName: 'ТОО Бета', cargo: 'ткань', post: null, status: 1, assignedKppId: 'k1', assignedKppName: 'Данияр', tnvedCodes: ['5208520000'], updatedAtUtc: '2026-09-20T10:00:00Z' })
  const c = row({ id: 'c', number: 'ИМ-2026-0003', clientId: 'c1', clientName: 'ТОО Альфа', cargo: 'реагенты', status: 3, updatedAtUtc: '2026-10-07T10:00:00Z' })
  const rows = [a, b, c]
  const ids = (f: Partial<ReturnType<typeof emptyFilters>>) => filterRows(rows, { ...emptyFilters(), ...f }).map((r) => r.id)

  it('без фильтров — всё', () => {
    expect(ids({})).toEqual(['a', 'b', 'c'])
    expect(hasFilters(emptyFilters())).toBe(false)
  })
  it('поиск: номер, клиент, груз, пост, код ТН ВЭД (с пробелами), контейнер', () => {
    expect(ids({ q: '0002' })).toEqual(['b'])
    expect(ids({ q: 'бета' })).toEqual(['b'])
    expect(ids({ q: 'РЕАГЕНТЫ' })).toEqual(['c'])
    expect(ids({ q: 'нур-жолы' })).toEqual(['a', 'c'])
    expect(ids({ q: '8471 30' })).toEqual(['a'])
    expect(ids({ q: '5208' })).toEqual(['b'])
    expect(ids({ q: 'msku1234' })).toEqual(['a'])
    expect(ids({ q: 'нет такого' })).toEqual([])
    expect(hasFilters({ ...emptyFilters(), q: ' x ' })).toBe(true)
  })
  it('клиент', () => {
    expect(ids({ client: 'c1' })).toEqual(['a', 'c'])
  })
  it('исполнитель: декларант, КПП, «не назначен»', () => {
    expect(ids({ executor: 'd1' })).toEqual(['a'])
    expect(ids({ executor: 'k1' })).toEqual(['b'])
    expect(ids({ executor: EXECUTOR_NONE })).toEqual(['c'])
  })
  it('этап', () => {
    expect(ids({ stage: '1' })).toEqual(['b'])
    expect(ids({ stage: '0' })).toEqual([])
  })
  it('период по «Обновлена», границы включительно', () => {
    expect(ids({ period: ['2026-10-05', '2026-10-07'] })).toEqual(['a', 'c'])
    expect(ids({ period: ['2026-09-01', '2026-09-30'] })).toEqual(['b'])
  })
  it('фильтры складываются', () => {
    expect(ids({ client: 'c1', stage: '3' })).toEqual(['c'])
    expect(ids({ client: 'c1', q: 'ткань' })).toEqual([])
  })
})

describe('варианты фильтров', () => {
  const rows = [
    row({ id: 'a', clientId: 'c2', clientName: 'ТОО Бета', assignedDeclarantId: 'd1', assignedDeclarantName: 'Айгерим' }),
    row({ id: 'b', clientId: 'c1', clientName: 'ТОО Альфа', assignedKppId: 'k1', assignedKppName: 'Данияр', assignedDeclarantId: 'd1', assignedDeclarantName: 'Айгерим' }),
    row({ id: 'c', clientId: 'c1', clientName: 'ТОО Альфа' }),
  ]
  it('клиенты — без повторов, по алфавиту', () => {
    expect(clientOptions(rows)).toEqual([{ value: 'c1', label: 'ТОО Альфа' }, { value: 'c2', label: 'ТОО Бета' }])
  })
  it('исполнители — «Не назначен» первым, затем люди без повторов', () => {
    expect(executorOptions(rows, t)).toEqual([
      { value: EXECUTOR_NONE, label: 'Не назначен' },
      { value: 'd1', label: 'Айгерим' },
      { value: 'k1', label: 'Данияр' },
    ])
  })
})
