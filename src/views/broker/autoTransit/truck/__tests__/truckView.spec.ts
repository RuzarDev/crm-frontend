import { describe, expect, it } from 'vitest'
import type { TruckStatus } from '@/api/autoTransit'
import { STAGE_BLOCKERS, currentBlockers, lastMachineMark, recipientSees, rights } from '../truckView'
import { card, event, file } from './truckFixtures'

const all = { border: true, declare: true, manage: true }
const r = (status: TruckStatus, currentStage: number | null = 3) => rights({ status, currentStage, can: all })

describe('truckView.rights: файлы по статусам', () => {
  it('в работе и в «Проблеме» — менять и удалять можно', () => {
    expect(r('inWork')).toMatchObject({ upload: true, patchFile: true, deleteFile: true })
    expect(r('problem')).toMatchObject({ upload: true, patchFile: true, deleteFile: true })
  })

  it('выпущена — загрузка и правка файла (вид, партия, печать, видимость) есть, удаления нет (решение 23)', () => {
    expect(r('released', null)).toMatchObject({ upload: true, patchFile: true, deleteFile: false, editParty: false, td: true })
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
