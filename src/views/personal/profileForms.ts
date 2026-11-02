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

// ---- «Кем выдан» (02.11.2026, F4) ----
// Хранится текстом: фиксированные значения — ровно «МВД РК» / «МЮ РК» (так печатаются доверенность и гр.54), у «другого
// органа» — введённый текст. Старые написания («мвд», «ҚР ІІМ») сервер распознаёт и отдаёт уже как «МВД РК».
export const ISSUER_MVD = 'МВД РК'
export const ISSUER_MJ = 'МЮ РК'
export type IssuerChoice = 'mvd' | 'mj' | 'other'
export const ISSUER_CHOICES: IssuerChoice[] = ['mvd', 'mj', 'other']

/** Какой пункт списка выбран для сохранённого текста; пусто — ничего. */
export const issuerChoice = (text: string | null | undefined): IssuerChoice | null => {
  const v = (text ?? '').trim()
  if (!v) return null
  return v === ISSUER_MVD ? 'mvd' : v === ISSUER_MJ ? 'mj' : 'other'
}

/** Текст для пункта списка: «другой орган» — введённое пользователем (пусто — null). */
export const issuerText = (choice: IssuerChoice | null, other: string | null | undefined): string | null =>
  choice === 'mvd' ? ISSUER_MVD : choice === 'mj' ? ISSUER_MJ : choice === 'other' ? ((other ?? '').trim() || null) : null

// ---- «Мои доверенности» (02.11.2026, F2) ----
type PoaState = { status: number; daysLeft: number | null; replacedBy?: string | null }

/** Истекла (статус или срок прошёл), отозвана или заменена перевыпущенной (02.11.2026) — уходит в свёрнутый список. */
export const poaIsPast = (r: PoaState): boolean =>
  r.status === 3 || r.status === 4 || (r.status === 2 && ((r.daysLeft !== null && r.daysLeft < 0) || !!r.replacedBy))

/** Сначала действующие (и ждущие подписи), потом истекшие и отозванные; порядок внутри — как пришёл с сервера. */
export const splitMyPoas = <T extends PoaState>(items: T[]): { current: T[]; past: T[] } => ({
  current: items.filter((r) => !poaIsPast(r)),
  past: items.filter(poaIsPast),
})
