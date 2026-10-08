import { describe, expect, it } from 'vitest'
import { DRAFT_FIELDS, NOT_CLEARABLE, TRANSPORT_FIELDS, decideCommit } from '../draftFields'
import { caseDto } from './caseFixture'

describe('decideCommit', () => {
  const c = caseDto({ cargo: 'Ноутбуки', post: 'Хоргос', vehicleNumber: '777 KTA 02', driverPhone: '+7 700 111 22 33', trailerNumber: '12 KZ 3456', station: '' })

  it('значение не изменилось (в том числе после обрезки пробелов) — ничего не отправляем', () => {
    expect(decideCommit(c, 'cargo', 'Ноутбуки')).toEqual({ kind: 'skip' })
    expect(decideCommit(c, 'cargo', '  Ноутбуки  ')).toEqual({ kind: 'skip' })
    expect(decideCommit(c, 'station', '')).toEqual({ kind: 'skip' })
  })

  it('(баг) пустое значение груза, поста, номера машины и телефона сервер не очищает — вместо отката подсказка', () => {
    for (const f of ['cargo', 'post', 'vehicleNumber', 'driverPhone'] as const) {
      expect(decideCommit(c, f, '')).toEqual({ kind: 'blocked' })
      expect(decideCommit(c, f, '   ')).toEqual({ kind: 'blocked' })
    }
    expect([...NOT_CLEARABLE].sort()).toEqual(['cargo', 'driverPhone', 'post', 'vehicleNumber'])
  })

  it('прицеп и поля других видов транспорта очищаются — пустое значение уходит на сервер', () => {
    expect(decideCommit(c, 'trailerNumber', '')).toEqual({ kind: 'save', value: '' })
  })

  it('изменённое значение уходит обрезанным', () => {
    expect(decideCommit(c, 'cargo', ' Телефоны ')).toEqual({ kind: 'save', value: 'Телефоны' })
  })
})

describe('поля черновика', () => {
  it('поля по видам транспорта — подмножество общего списка', () => {
    for (const fields of Object.values(TRANSPORT_FIELDS)) {
      for (const f of fields) expect(DRAFT_FIELDS).toContain(f)
    }
    expect(TRANSPORT_FIELDS[1]).toEqual(['vehicleNumber', 'trailerNumber', 'driverPhone'])
  })
})
