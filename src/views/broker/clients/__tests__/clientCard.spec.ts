import { describe, expect, it } from 'vitest'
import { directorBasisOf } from '../clientCard'

describe('directorBasisOf', () => {
  it('профиля нет (updatedAtUtc == null): основание по умолчанию с сервера не показываем', () => {
    expect(directorBasisOf({ directorBasis: 'устава', updatedAtUtc: null })).toBe('—')
  })
  it('профиль есть: основание как заполнено, пустое — «—»', () => {
    expect(directorBasisOf({ directorBasis: 'устава', updatedAtUtc: '2026-09-01T04:00:00Z' })).toBe('устава')
    expect(directorBasisOf({ directorBasis: '', updatedAtUtc: '2026-09-01T04:00:00Z' })).toBe('—')
  })
})
