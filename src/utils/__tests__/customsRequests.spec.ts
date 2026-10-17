import { describe, expect, it } from 'vitest'
import type { CustomsRequestDto } from '@/api/customsRequests'
import {
  canCreateAtStatus, canManageCustoms, canRemindClient, dateLabel, defaultUploadKind, elapsedLabel, hasClientDebt,
  oldestWaiting, waitingLabel,
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

  it('шаг 3 для нового запроса, долги клиента, вид документа и дата', () => {
    expect([0, 1, 2, 3, 4].map(canCreateAtStatus)).toEqual([false, false, true, true, false])
    expect(hasClientDebt(0, [])).toBe(true)
    expect(hasClientDebt(6, [])).toBe(true)
    expect(hasClientDebt(3, [])).toBe(false)
    expect(hasClientDebt(3, [req()])).toBe(true)
    expect(defaultUploadKind(req({ docKinds: ['certificate', 'invoice'] }))).toBe('certificate')
    expect(defaultUploadKind(req({ docKinds: [] }))).toBe('other')
    expect(dateLabel('2026-10-20T12:00:00Z')).toBe('20.10.2026')
    expect(dateLabel(null)).toBe('')
  })
})
