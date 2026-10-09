import { describe, expect, it } from 'vitest'
import {
  changedSections, compact, formatSavedAt, groupIik, toForm, toPayload, validate, type OrgForm,
} from '../organization'

const base = (): OrgForm => toForm({
  companyName: 'ТОО «AQNIET Customs»', shortName: 'AQNIET', bin: '180940012345', legalAddress: 'Алматы',
  bank: 'Kaspi', iik: 'KZ72722S000012345678', bik: 'CASPKZKA', kbe: '17',
  directorName: 'Ахметов К. С.', directorBasis: 'устава', accountantName: 'Жумабек А. Е.', phone: '+7 727 355 12 40', email: 'a@b.kz',
  vatPayer: true, vatRate: 16, updatedAtUtc: null,
})

describe('organization: проверки полей', () => {
  it('верные реквизиты — без ошибок', () => {
    expect(validate(base())).toEqual({})
  })
  it('полное наименование обязательно', () => {
    expect(validate({ ...base(), companyName: '  ' }).companyName).toBe('required')
  })
  it('БИН — 12 цифр', () => {
    expect(validate({ ...base(), bin: '12345678901' }).bin).toBe('bin')
    expect(validate({ ...base(), bin: '1809400123AB' }).bin).toBe('bin')
    expect(validate({ ...base(), bin: '' }).bin).toBeUndefined()
  })
  it('ИИК — KZ и 18 знаков (буквы/цифры), пробелы и регистр не мешают', () => {
    expect(validate({ ...base(), iik: 'kz72 722s 0000 1234 5678' }).iik).toBeUndefined()
    expect(validate({ ...base(), iik: 'KZ72722S00001234567' }).iik).toBe('iik')
    expect(validate({ ...base(), iik: 'RU72722S000012345678' }).iik).toBe('iik')
    expect(validate({ ...base(), iik: 'KZ72722S0000123456-8' }).iik).toBe('iik')
  })
  it('БИК — 8 латинских букв/цифр', () => {
    expect(validate({ ...base(), bik: 'CASPKZK' }).bik).toBe('bik')
    expect(validate({ ...base(), bik: 'КАСПКZKA' }).bik).toBe('bik') // кириллица
    expect(validate({ ...base(), bik: 'caspkzka' }).bik).toBeUndefined()
  })
  it('Кбе — 2 цифры; email — формат', () => {
    expect(validate({ ...base(), kbe: '1' }).kbe).toBe('kbe')
    expect(validate({ ...base(), kbe: '1a' }).kbe).toBe('kbe')
    expect(validate({ ...base(), email: 'abc' }).email).toBe('email')
    expect(validate({ ...base(), email: '' }).email).toBeUndefined()
  })
  it('основание не пустое; ставка НДС 0–30, только у плательщика', () => {
    expect(validate({ ...base(), directorBasis: '' }).directorBasis).toBe('basis')
    expect(validate({ ...base(), vatRate: 31 }).vatRate).toBe('vatRate')
    expect(validate({ ...base(), vatRate: null }).vatRate).toBe('vatRate')
    expect(validate({ ...base(), vatPayer: false, vatRate: null }).vatRate).toBeUndefined()
  })
})

describe('organization: форма и секции', () => {
  it('null и пропуски с сервера — пустые строки; основание по умолчанию «устава»; ИИК сгруппирован', () => {
    const f = toForm({ companyName: null as unknown as string, directorBasis: '', iik: 'kz72722s000012345678' })
    expect(f.companyName).toBe('')
    expect(f.directorBasis).toBe('устава')
    expect(f.iik).toBe('KZ72 722S 0000 1234 5678')
  })
  it('groupIik / compact', () => {
    expect(groupIik('kz72722s000012345678')).toBe('KZ72 722S 0000 1234 5678')
    expect(compact(' kz72 722S ')).toBe('KZ72722S')
  })
  it('изменённые секции — в порядке страницы; пробелы по краям и регистр ИИК — не правка', () => {
    const a = base()
    expect(changedSections(a, { ...a, iik: 'kz72 722s 0000 1234 5678', bank: 'Kaspi ' })).toEqual([])
    expect(changedSections(a, { ...a, vatRate: 12, bank: 'Halyk', companyName: 'X' })).toEqual(['company', 'bank', 'vat'])
    expect(changedSections(a, { ...a, phone: '+7 700 000 00 00' })).toEqual(['signers'])
  })
  it('PUT: весь DTO, строки обрезаны и без null, ИИК сжат, updatedAtUtc сохранён', () => {
    const p = toPayload({ ...base(), companyName: ' ТОО ', iik: 'KZ72 722S 0000 1234 5678' }, { updatedAtUtc: '2026-10-02T09:20:00Z' })
    expect(p.companyName).toBe('ТОО')
    expect(p.iik).toBe('KZ72722S000012345678')
    expect(p.updatedAtUtc).toBe('2026-10-02T09:20:00Z')
    expect(Object.values(p).includes(null as never)).toBe(false)
    expect(Object.keys(p).sort()).toEqual([
      'accountantName', 'bank', 'bik', 'bin', 'companyName', 'directorBasis', 'directorName', 'email', 'iik', 'kbe',
      'legalAddress', 'phone', 'shortName', 'updatedAtUtc', 'vatPayer', 'vatRate',
    ].sort())
  })
})

describe('organization: «Сохранено»', () => {
  const now = new Date('2026-10-09T12:00:00Z')
  const local = new Date('2026-10-02T09:20:00Z')
  const hm = `${String(local.getHours()).padStart(2, '0')}:${String(local.getMinutes()).padStart(2, '0')}`
  it('ДД.ММ, ЧЧ:ММ без года в этом году; время без пояса — UTC', () => {
    expect(formatSavedAt('2026-10-02T09:20:00Z', 'ru-RU', now)).toBe(`02.10, ${hm}`)
    expect(formatSavedAt('2026-10-02T09:20:00', 'ru-RU', now)).toBe(`02.10, ${hm}`)
  })
  it('год — если не текущий; пусто — если времени нет', () => {
    expect(formatSavedAt('2025-10-02T09:20:00Z', 'ru-RU', now)).toContain('2025')
    expect(formatSavedAt(null, 'ru-RU', now)).toBe('')
    expect(formatSavedAt('мусор', 'ru-RU', now)).toBe('')
  })
})
