import { describe, expect, it } from 'vitest'
import type { TruckStatus } from '@/api/autoTransit'
import { STAGE_BLOCKERS, blockerText, currentBlockers, lastMachineMark, recipientSees, rights } from '../truckView'
import { card, event, file } from './truckFixtures'

const all = { border: true, declare: true, manage: true }
const r = (status: TruckStatus, currentStage: number | null = 3) => rights({ status, currentStage, can: all })

describe('truckView.rights: файлы по статусам', () => {
  it('в работе и в «Проблеме» — менять и удалять можно', () => {
    expect(r('inWork')).toMatchObject({ upload: true, patchFile: true, deleteFile: true })
    expect(r('problem')).toMatchObject({ upload: true, patchFile: true, deleteFile: true })
  })

  it('выпущена — загрузка и правка файла (вид, партия, печать, видимость) есть, удаления нет (решение 23)', () => {
    expect(r('released', null)).toMatchObject({ upload: true, patchFile: true, deleteFile: false, td: true })
  })

  it('архив — ничего', () => {
    expect(r('archived', null)).toMatchObject({ upload: false, patchFile: false, deleteFile: false, links: false, undo: false })
  })

  it('без прав границы и декларанта файл не меняется', () => {
    expect(rights({ status: 'released', currentStage: null, can: { border: false, declare: false, manage: true } }).patchFile).toBe(false)
  })
})

describe('truckView.currentBlockers: «Что мешает» — только текущего этапа', () => {
  const ALL = [
    { code: 'no_files', partyId: null }, { code: 'party_no_recipient', partyId: 'p1' }, { code: 'party_no_invoice', partyId: 'p1' },
    { code: 'no_stamped_invoice', partyId: 'p1' }, { code: 'not_submitted', partyId: 'p1' }, { code: 'no_td_number', partyId: 'p1' },
    { code: 'no_td_file', partyId: 'p1' }, { code: 'no_warehouse_receipt', partyId: null },
  ]
  const codes = (stage: number | null, status: TruckStatus = 'inWork') =>
    currentBlockers(card({ currentStage: stage, status, blockers: ALL })).map((b) => b.code)

  it('по этапам — как на сервере', () => {
    expect(codes(1)).toEqual(['no_files'])
    expect(codes(2)).toEqual(['party_no_recipient', 'party_no_invoice', 'no_stamped_invoice'])
    expect(codes(3)).toEqual([])
    expect(codes(4)).toEqual([])
    expect(codes(5)).toEqual(['party_no_recipient', 'party_no_invoice', 'not_submitted'])
    expect(codes(6)).toEqual(['no_td_number', 'no_td_file'])
    expect(codes(7)).toEqual(['no_warehouse_receipt'])
    expect(codes(null, 'released')).toEqual([])
  })

  it('страховка: известный blockerCode строки всегда среди currentBlockers', () => {
    for (const stage of [1, 2, 3, 4, 5, 6, 7]) {
      for (const b of ALL) {
        const c = card({ currentStage: stage, blockers: ALL, blockerCode: b.code })
        const own = (STAGE_BLOCKERS[stage] ?? []) as readonly string[]
        if (!own.includes(b.code)) continue // сервер такой blockerCode на этом этапе не пришлёт
        expect(currentBlockers(c).map((x) => x.code)).toContain(c.blockerCode)
      }
    }
  })
})

describe('truckView.recipientSees: что получатель видит на самом деле', () => {
  it('файл партии — по признаку; общий — только CMR', () => {
    expect(recipientSees(file('a', { partyId: 'p1', kind: 'invoice', visibleToRecipient: true }))).toBe(true)
    expect(recipientSees(file('a', { partyId: 'p1', kind: 'invoice', visibleToRecipient: false }))).toBe(false)
    expect(recipientSees(file('a', { partyId: null, kind: 'cmr', visibleToRecipient: true }))).toBe(true)
    expect(recipientSees(file('a', { partyId: null, kind: 'warehouseReceipt', visibleToRecipient: true }))).toBe(false)
    expect(recipientSees(file('a', { partyId: null, kind: 'td', visibleToRecipient: true }))).toBe(false)
  })
})

describe('truckView.lastMachineMark: что отменит «Отменить последнюю отметку»', () => {
  it('нет отметок 2–4 и 7 — null (этап 1 не отменяется)', () => {
    expect(lastMachineMark(card({ events: [event('e1', 1, '2026-11-16T09:14:00Z')] }))).toBeNull()
    expect(lastMachineMark(card({ events: [] }))).toBeNull()
  })
  it('последний пройденный машинный этап; отменённый не считается', () => {
    expect(lastMachineMark(card({ events: [event('e1', 1, '2026-11-16T09:14:00Z'), event('e2', 2, '2026-11-16T09:31:00Z'), event('e3', 3, '2026-11-16T09:40:00Z')] }))).toBe(3)
    expect(lastMachineMark(card({ events: [
      event('e2', 2, '2026-11-16T09:31:00Z'), event('e3', 3, '2026-11-16T09:40:00Z'), event('e4', 3, '2026-11-16T09:41:00Z', { action: 'undone' }),
    ] }))).toBe(2)
    expect(lastMachineMark(card({ events: [event('e2', 2, '2026-11-16T09:31:00Z', { action: 'undone' })] }))).toBeNull()
  })
  it('события партий (этапы 5 и 6) не в счёт', () => {
    expect(lastMachineMark(card({ events: [event('e5', 5, '2026-11-16T10:00:00Z', { partyId: 'p1' })] }))).toBeNull()
  })
})

describe('truckView.rights: правка после выпуска и возврат из архива (очередь 2а)', () => {
  const can = (border: boolean, declare: boolean, manage: boolean) => ({ border, declare, manage })
  const at = (status: TruckStatus, c: ReturnType<typeof can>) => rights({ status, currentStage: status === 'released' ? null : 3, can: c })

  it('выпущена: «Изменить» машину и партию — только с manage (остальным сервер отвечает 409 released)', () => {
    expect(at('released', can(true, true, false))).toMatchObject({ editTruck: false, editParty: false })
    expect(at('released', can(true, true, true))).toMatchObject({ editTruck: true, editParty: true })
    // Одного manage достаточно для правки выпущенной (сервер, правка по ревью 17.11).
    expect(at('released', can(false, false, true))).toMatchObject({ editTruck: true, editParty: true })
    // Новую партию выпущенной машине не добавить ни с каким правом (409 released).
    expect(at('released', can(true, true, true)).addParty).toBe(false)
  })

  it('в работе — как раньше: border или declare', () => {
    expect(at('inWork', can(true, false, false))).toMatchObject({ editTruck: true, editParty: true })
    expect(at('inWork', can(false, false, true))).toMatchObject({ editTruck: false, editParty: false })
  })

  it('«Вернуть из архива» — только архив и только manage', () => {
    expect(at('archived', can(true, true, true)).unarchive).toBe(true)
    expect(at('archived', can(true, true, false)).unarchive).toBe(false)
    expect(at('released', can(true, true, true)).unarchive).toBe(false)
    expect(at('inWork', can(true, true, true)).unarchive).toBe(false)
  })
})

describe('truckView: подсказки по ТД в «Что мешает» (declaration_missing / declaration_incomplete)', () => {
  const B = [
    { code: 'not_submitted', partyId: 'p1' },
    { code: 'declaration_missing', partyId: 'p1' },
    { code: 'declaration_incomplete', partyId: 'p2', count: 4 },
  ]
  it('показываются на любом этапе машины в работе, после подсказок этапа; у выпущенной и архивной — нет', () => {
    expect(currentBlockers(card({ currentStage: 5, blockers: B })).map((b) => b.code)).toEqual(['not_submitted', 'declaration_missing', 'declaration_incomplete'])
    expect(currentBlockers(card({ currentStage: 3, blockers: B })).map((b) => b.code)).toEqual(['declaration_missing', 'declaration_incomplete'])
    expect(currentBlockers(card({ currentStage: 3, status: 'problem', blockers: B })).map((b) => b.code)).toEqual(['declaration_missing', 'declaration_incomplete'])
    expect(currentBlockers(card({ currentStage: null, status: 'released', blockers: B }))).toEqual([])
  })

  it('текст с номером партии и числом незаполненного, не сырой ключ', () => {
    const msgs: Record<string, string> = {
      'broker.autoTransit.blocker.hint.declaration_missing': 'ТД не заполнена.',
      'broker.autoTransit.blocker.hint.declaration_incomplete': 'в ТД не заполнено: {count}.',
      'broker.autoTransit.blocker.party': 'Партия {n}: {text}',
    }
    const t = (k: string, p: Record<string, unknown> = {}) => (msgs[k] ?? k).replace(/\{(\w+)\}/g, (_, x) => String(p[x]))
    const c = card({ parties: [card().parties[0]!, { ...card().parties[0]!, id: 'p2', number: 2 }] })
    expect(blockerText(B[1]!, c, t)).toBe('Партия 1: ТД не заполнена.')
    expect(blockerText(B[2]!, c, t)).toBe('Партия 2: в ТД не заполнено: 4.')
  })
})
