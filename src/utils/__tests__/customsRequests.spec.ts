import { describe, expect, it } from 'vitest'
import type { CustomsRequestDto } from '@/api/customsRequests'
import {
  canCreateAtStatus, canManageCustoms, canRemindClient, dateLabel, defaultStage, defaultUploadKind, dueDateLabel, dueForApi, dueTimeLabel,
  elapsedLabel, almatyToday, hasClientDebt, isDuePast, isOverdue, oldestWaiting, stageOf, stagesAt, waitingForClient, waitingLabel, waitingOfStage,
} from '../customsRequests'

const t = (key: string, named?: Record<string, unknown>) => `${key}${named ? JSON.stringify(named) : ''}`
const req = (p: Partial<CustomsRequestDto> = {}): CustomsRequestDto => ({
  id: 'r1', declarationId: null, declarationNumber: null, corridor: null, text: 'x', docKinds: [], dueAtUtc: null,
  createdAtUtc: '2026-10-17T08:00:00Z', createdByName: null, status: 'open', answeredAtUtc: null, answerText: '',
  answerFiles: [], closedAtUtc: null, closedByName: null, closeNote: '', lastReminderAtUtc: null, reminderCount: 0, ...p,
})
const user = (p: Partial<{ role: string; businessRole: string; businessRoles: string[]; permissions: string[] }>) => ({
  role: 'importer', businessRole: '', businessRoles: [], permissions: [], userId: 'u1', ...p,
})

describe('customsRequests', () => {
  it('elapsedLabel: минуты, часы до 48, дальше дни; минимум 1 мин', () => {
    const now = new Date('2026-10-17T10:00:00Z')
    expect(elapsedLabel('2026-10-17T10:00:00Z', t, now)).toBe('customsRequest.time.min{"n":1}')
    expect(elapsedLabel('2026-10-17T09:35:00Z', t, now)).toBe('customsRequest.time.min{"n":25}')
    expect(elapsedLabel('2026-10-17T07:00:00Z', t, now)).toBe('customsRequest.time.hour{"n":3}')
    expect(elapsedLabel('2026-10-15T09:00:00Z', t, now)).toBe('customsRequest.time.day{"n":2}')
  })

  it('waitingLabel — по самому давнему запросу без ответа; ответившие и закрытые не считаются', () => {
    const now = new Date('2026-10-17T10:00:00Z')
    const list = [
      req({ id: 'a', status: 'answered', createdAtUtc: '2026-10-16T00:00:00Z' }),
      req({ id: 'b', status: 'open', createdAtUtc: '2026-10-17T08:00:00Z' }),
      req({ id: 'c', status: 'closed', createdAtUtc: '2026-10-10T00:00:00Z' }),
    ]
    expect(oldestWaiting(list)?.id).toBe('b')
    expect(waitingLabel(list, t, now)).toBe('customsRequest.waiting{"time":"customsRequest.time.hour{\\"n\\":2}"}')
    expect(waitingLabel([list[0], list[2]], t, now)).toBeNull()
  })

  it('права: ДТ или import40.problem — заводить; плюс КПП и руководитель — напоминать; клиенту — ничего', () => {
    expect(canManageCustoms(user({ permissions: ['import40.declarant'] }))).toBe(true)
    expect(canManageCustoms(user({ permissions: ['import40.problem'] }))).toBe(true)
    expect(canManageCustoms(user({ permissions: ['import40.kpp'] }))).toBe(false)
    expect(canRemindClient(user({ permissions: ['import40.kpp'] }))).toBe(true)
    expect(canRemindClient(user({ permissions: ['import40.read'] }))).toBe(false)
    expect(canManageCustoms(user({ role: 'administrator' }))).toBe(true)
    expect(canRemindClient(user({ role: 'client', businessRole: 'client', permissions: ['import40.read'] }))).toBe(false)
  })

  it('моменты запроса по статусу — как CanCreateAt/DefaultStage на сервере', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(canCreateAtStatus))
      .toEqual([false, true, true, true, true, true, true, true, true, false])
    expect(stagesAt(1)).toEqual(['border'])
    expect(stagesAt(3)).toEqual(['declaration'])
    expect(stagesAt(8)).toEqual(['postRelease'])
    expect(stagesAt(9)).toEqual([])
    expect([0, 1, 2, 4, 8, 9].map(defaultStage)).toEqual([null, 'border', 'declaration', 'postRelease', 'postRelease', null])
    expect(stageOf(req())).toBe('declaration')
    expect(stageOf(req({ stage: 'border' }))).toBe('border')
  })

  it('ждём клиента: выполненная — только после выпуска, отменённая — ничего; метка по моменту', () => {
    const now = new Date('2026-10-17T10:00:00Z')
    const list = [
      req({ id: 'd', stage: 'declaration' }),
      req({ id: 'b', stage: 'border', createdAtUtc: '2026-10-17T09:00:00Z' }),
      req({ id: 'p', stage: 'postRelease', createdAtUtc: '2026-10-17T07:00:00Z' }),
      req({ id: 'x', stage: 'postRelease', status: 'answered' }),
    ]
    expect(waitingForClient(list, 3).map((r) => r.id)).toEqual(['d', 'b', 'p'])
    expect(waitingForClient(list, 8).map((r) => r.id)).toEqual(['p'])
    expect(waitingForClient(list, 9)).toEqual([])
    expect(waitingOfStage(list, 'border').map((r) => r.id)).toEqual(['b'])
    expect(waitingLabel(waitingOfStage(list, 'border'), t, now)).toBe('customsRequest.waitingBorder{"time":"customsRequest.time.hour{\\"n\\":1}"}')
    expect(waitingLabel(waitingOfStage(list, 'postRelease'), t, now)).toBe('customsRequest.waitingPostRelease{"time":"customsRequest.time.hour{\\"n\\":3}"}')
  })

  it('срок: время — явным флагом dueHasTime, а не «полдень UTC»; просрочка', () => {
    expect(dueForApi(null, '10:00')).toEqual({ dueAtUtc: null, dueHasTime: false })
    expect(dueForApi('2026-10-20', '')).toEqual({ dueAtUtc: '2026-10-20T12:00:00Z', dueHasTime: false })
    expect(dueForApi('2026-10-20', '15:30')).toEqual({ dueAtUtc: new Date('2026-10-20T15:30:00').toISOString(), dueHasTime: true })
    // Время, которое в UTC выпадает ровно на полдень, — всё равно срок со временем.
    const noonUtc = new Date('2026-10-20T12:00:00Z')
    const noonLocal = `${String(noonUtc.getHours()).padStart(2, '0')}:${String(noonUtc.getMinutes()).padStart(2, '0')}`
    expect(dueTimeLabel({ dueAtUtc: '2026-10-20T12:00:00Z', dueHasTime: true })).toBe(noonLocal)
    expect(dueTimeLabel({ dueAtUtc: '2026-10-20T12:00:00Z', dueHasTime: false })).toBe('')
    expect(dueTimeLabel({ dueAtUtc: '2026-10-20T12:00:00Z' })).toBe('')
    expect(dueTimeLabel({ dueAtUtc: new Date('2026-10-20T15:30:00').toISOString(), dueHasTime: true })).toBe('15:30')
    expect(dueDateLabel({ dueAtUtc: '2026-10-20T12:00:00Z', dueHasTime: false })).toBe('20.10.2026')
    expect(dueDateLabel({ dueAtUtc: null })).toBe('')
    const withTime = req({ dueAtUtc: new Date('2026-10-20T15:30:00').toISOString(), dueHasTime: true })
    expect(isOverdue(withTime, new Date('2026-10-20T15:00:00'))).toBe(false)
    expect(isOverdue(withTime, new Date('2026-10-20T16:00:00'))).toBe(true)
    expect(isOverdue({ ...withTime, status: 'answered' }, new Date('2026-10-21T00:00:00'))).toBe(false)
    const dateOnly = req({ dueAtUtc: '2026-10-20T12:00:00Z', dueHasTime: false })
    expect(isOverdue(dateOnly, new Date('2026-10-20T22:00:00'))).toBe(false)
    expect(isOverdue(dateOnly, new Date('2026-10-21T00:30:00'))).toBe(true)
  })

  it('срок в прошлом: дата — по Алматы, время — до минуты', () => {
    const now = new Date('2026-10-17T19:30:00Z') // в Алматы уже 18.10 00:30
    expect(almatyToday(now)).toBe('2026-10-18')
    expect(almatyToday(new Date('2026-10-17T18:59:00Z'))).toBe('2026-10-17')
    expect(isDuePast('2026-10-17', '', now)).toBe(true)
    expect(isDuePast('2026-10-18', '', now)).toBe(false)
    expect(isDuePast(null, '10:00', now)).toBe(false)
    const at = new Date('2026-10-17T10:00:40Z')
    const local = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const sameMinute = new Date(at.getTime() - 30_000)
    const minuteAgo = new Date(at.getTime() - 61_000)
    expect(isDuePast(ymd(sameMinute), local(sameMinute), at)).toBe(false) // «сейчас» — можно
    expect(isDuePast(ymd(minuteAgo), local(minuteAgo), at)).toBe(true)
  })

  it('долги клиента, вид документа и дата', () => {
    expect(hasClientDebt(0, [])).toBe(true)
    expect(hasClientDebt(6, [])).toBe(true)
    expect(hasClientDebt(3, [])).toBe(false)
    expect(hasClientDebt(3, [req()])).toBe(true)
    // Статус 6 с загруженным чеком об оплате СВХ — клиент своё сделал; открытый запрос таможни — всё равно долг.
    expect(hasClientDebt(6, [], true)).toBe(false)
    expect(hasClientDebt(6, [req()], true)).toBe(true)
    expect(defaultUploadKind(req({ docKinds: ['certificate', 'invoice'] }))).toBe('certificate')
    expect(defaultUploadKind(req({ docKinds: [] }))).toBe('other')
    expect(dateLabel('2026-10-20T12:00:00Z')).toBe('20.10.2026')
    expect(dateLabel(null)).toBe('')
  })
})
