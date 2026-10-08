import { describe, expect, it } from 'vitest'
import { notificationTarget } from '@/shell/notificationTarget'

describe('notificationTarget', () => {
  it('заявка: сотруднику — карточка заявки', () => {
    expect(notificationTarget({ caseId: 'c1', reestrEntryId: null }, false)).toBe('/import-40/c1')
  })
  it('заявка: финансисту — «Счета и акты» с фильтром по заявке', () => {
    expect(notificationTarget({ caseId: 'c1', reestrEntryId: null }, true)).toBe('/billing?case=c1')
  })
  it('id кодируется в обеих ветках', () => {
    expect(notificationTarget({ caseId: 'a b/c', reestrEntryId: null }, false)).toBe('/import-40/a%20b%2Fc')
    expect(notificationTarget({ caseId: 'a b', reestrEntryId: null }, true)).toBe('/billing?case=a%20b')
  })
  it('запись реестра — /reestr, без привязки — null', () => {
    expect(notificationTarget({ caseId: null, reestrEntryId: 'r1' }, false)).toBe('/reestr')
    expect(notificationTarget({ caseId: null, reestrEntryId: null }, true)).toBeNull()
  })
})
