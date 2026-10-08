import { describe, expect, it } from 'vitest'
import { notificationTarget } from '@/shell/notificationTarget'

describe('notificationTarget', () => {
  it('заявка: сотруднику — карточка заявки', () => {
    expect(notificationTarget({ caseId: 'c1', reestrEntryId: null }, false)).toBe('/import-40/c1')
  })
  it('заявка: финансисту — «Счета и акты» с фильтром по заявке', () => {
    expect(notificationTarget({ caseId: 'c1', reestrEntryId: null }, true)).toBe('/billing?caseId=c1')
  })
  it('запись реестра — /reestr, без привязки — null', () => {
    expect(notificationTarget({ caseId: null, reestrEntryId: 'r1' }, false)).toBe('/reestr')
    expect(notificationTarget({ caseId: null, reestrEntryId: null }, true)).toBeNull()
  })
})
