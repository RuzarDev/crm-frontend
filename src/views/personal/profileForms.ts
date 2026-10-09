import type { DeclarantProfileDto } from '@/api/declarantProfile'

// Проверки и сравнение форм страницы «Профиль» — без Vue, чтобы проверять тестами.

/** ИИН не обязателен, но если указан — ровно 12 цифр (так же проверяет сервер). */
export const iinError = (iin: string | null | undefined): 'iin' | null => {
  const v = (iin ?? '').trim()
  return v === '' || /^\d{12}$/.test(v) ? null : 'iin'
}

export const PASSWORD_MIN = 8

export interface PasswordForm { current: string; next: string; repeat: string }
export type PasswordErrors = Partial<Record<keyof PasswordForm, 'required' | 'min' | 'mismatch'>>

export const passwordErrors = (f: PasswordForm): PasswordErrors => {
  const e: PasswordErrors = {}
  if (!f.current) e.current = 'required'
  if (f.next.length < PASSWORD_MIN) e.next = 'min'
  else if (f.repeat !== f.next) e.repeat = 'mismatch'
  return e
}

const DECLARANT_FIELDS: (keyof DeclarantProfileDto)[] = [
  'fullName', 'position', 'phone', 'iin', 'powerOfAttorneyNumber', 'powerOfAttorneyDate', 'powerOfAttorneyValidUntil',
  'idDocTypeCode', 'idDocNumber', 'idDocIssueDate', 'idDocIssuedBy', 'idDocCountryCode',
]
const DATE_FIELDS = new Set<keyof DeclarantProfileDto>(['powerOfAttorneyDate', 'powerOfAttorneyValidUntil', 'idDocIssueDate'])

// Пустое = null = не заполнено; дата сравнивается по дню ('2026-01-02T00:00:00Z' и '2026-01-02' — одно и то же).
const norm = (k: keyof DeclarantProfileDto, v: string | null | undefined): string => {
  const s = (v ?? '').trim()
  return DATE_FIELDS.has(k) ? s.slice(0, 10) : s
}

export const declarantChanged = (saved: DeclarantProfileDto, draft: DeclarantProfileDto): boolean =>
  DECLARANT_FIELDS.some((k) => norm(k, saved[k]) !== norm(k, draft[k]))

export const emptyDeclarant = (): DeclarantProfileDto => ({
  fullName: null, position: null, phone: null, iin: null,
  powerOfAttorneyNumber: null, powerOfAttorneyDate: null, powerOfAttorneyValidUntil: null,
  idDocTypeCode: null, idDocNumber: null, idDocIssueDate: null, idDocIssuedBy: null, idDocCountryCode: null,
})
