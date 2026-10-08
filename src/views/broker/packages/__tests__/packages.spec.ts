import { describe, expect, it } from 'vitest'
import { canModifyFiles } from '../packages'

describe('canModifyFiles (как CanModifyFiles на сервере)', () => {
  it('администратор — в любом статусе', () => {
    for (const status of ['uploaded', 'accepted', 'needsFix', 'processed'] as const) {
      expect(canModifyFiles({ role: 'administrator', canReview: true, status })).toBe(true)
    }
  })

  it('проверяющий (packages.manage) — и на принятом, и на обработанном пакете', () => {
    expect(canModifyFiles({ role: 'importer', canReview: true, status: 'accepted' })).toBe(true)
    expect(canModifyFiles({ role: 'importer', canReview: true, status: 'processed' })).toBe(true)
  })

  it('экспедитор — только пока пакет «Загружен» или «Нужна правка»', () => {
    expect(canModifyFiles({ role: 'expeditor', canReview: false, status: 'uploaded' })).toBe(true)
    expect(canModifyFiles({ role: 'expeditor', canReview: false, status: 'needsFix' })).toBe(true)
    expect(canModifyFiles({ role: 'expeditor', canReview: false, status: 'accepted' })).toBe(false)
    expect(canModifyFiles({ role: 'expeditor', canReview: false, status: 'processed' })).toBe(false)
  })

  it('роль сравнивается без регистра и пробелов; остальным нельзя', () => {
    expect(canModifyFiles({ role: ' Expeditor ', canReview: false, status: 'uploaded' })).toBe(true)
    expect(canModifyFiles({ role: 'client', canReview: false, status: 'uploaded' })).toBe(false)
    expect(canModifyFiles({ role: null, canReview: false, status: 'needsFix' })).toBe(false)
  })
})
