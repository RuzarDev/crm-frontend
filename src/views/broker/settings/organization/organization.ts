import type { OrganizationSettings } from '@/api/billing'

// Чистая логика страницы «Организация» (редизайн, волна 5б): форма, проверки, секции, подпись «Сохранено».

// notify — почта для писем о смене статуса ДТ в КЕДЕН (23.10.2026).
export type SectionKey = 'company' | 'signers' | 'bank' | 'vat' | 'notify'
export const SECTIONS: SectionKey[] = ['company', 'signers', 'bank', 'vat', 'notify']

export interface OrgForm {
  companyName: string
  shortName: string
  bin: string
  legalAddress: string
  directorName: string
  directorBasis: string
  accountantName: string
  phone: string
  email: string
  bank: string
  iik: string
  bik: string
  kbe: string
  vatPayer: boolean
  vatRate: number | null
  /** Адреса для писем КЕДЕН — в форме по одному на строку. */
  kedenStatusEmails: string
}
export type FieldKey = keyof OrgForm

export const FIELD_SECTION: Record<FieldKey, SectionKey> = {
  companyName: 'company', shortName: 'company', bin: 'company', legalAddress: 'company',
  directorName: 'signers', directorBasis: 'signers', accountantName: 'signers', phone: 'signers', email: 'signers',
  bank: 'bank', iik: 'bank', bik: 'bank', kbe: 'bank',
  vatPayer: 'vat', vatRate: 'vat',
  kedenStatusEmails: 'notify',
}

/** Основания по умолчанию: попадают в документы по-русски как есть, поэтому не переводятся. */
export const BASIS_PRESETS = ['устава', 'доверенности'] as const
export const VAT_MIN = 0
export const VAT_MAX = 30
export const DEFAULT_BASIS = 'устава'
/** Сколько адресов КЕДЕН принимает сервер (больше — 400). */
export const KEDEN_EMAILS_MAX = 20

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

/** ИИК/БИК вводят с пробелами и в любом регистре — сравниваем и отправляем в сжатом виде. */
export const compact = (v: string): string => v.replace(/\s+/g, '').toUpperCase()
/** KZ72 722S 0000 1234 5678 — как печатают в банковских документах. */
export const groupIik = (v: string): string => compact(v).replace(/(.{4})(?=.)/g, '$1 ')

/**
 * Адреса писем КЕДЕН (23.10.2026): разделители — запятая, точка с запятой, пробел, перевод строки (как на сервере);
 * нижний регистр, без повторов, порядок ввода сохраняется. Сервер хранит так же, через запятую.
 */
export const splitEmails = (v: string): string[] =>
  [...new Set(v.split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean))]

/** Ответ сервера → форма (null и отсутствующее поле — пустая строка, ИИК — с группами). */
export const toForm = (d: Partial<OrganizationSettings> | null | undefined): OrgForm => ({
  companyName: str(d?.companyName), shortName: str(d?.shortName), bin: str(d?.bin), legalAddress: str(d?.legalAddress),
  directorName: str(d?.directorName), directorBasis: str(d?.directorBasis) || DEFAULT_BASIS,
  accountantName: str(d?.accountantName), phone: str(d?.phone), email: str(d?.email),
  bank: str(d?.bank), iik: groupIik(str(d?.iik)), bik: compact(str(d?.bik)), kbe: str(d?.kbe),
  vatPayer: d?.vatPayer ?? true,
  vatRate: typeof d?.vatRate === 'number' ? d.vatRate : 16,
  // Старый сервер поля не знает — пусто.
  kedenStatusEmails: splitEmails(str(d?.kedenStatusEmails)).join('\n'),
})

/**
 * Значение поля для сравнения «изменено ли»: пробелы по краям и регистр ИИК/БИК не считаются правкой;
 * у адресов КЕДЕН — ни разделители, ни регистр, ни повторы.
 */
const comparable = (key: FieldKey, f: OrgForm): string | number | boolean | null => {
  const v = f[key]
  if (typeof v !== 'string') return v
  if (key === 'kedenStatusEmails') return splitEmails(v).join(',')
  return key === 'iik' || key === 'bik' ? compact(v) : v.trim()
}
export const changedFields = (saved: OrgForm, draft: OrgForm): FieldKey[] =>
  (Object.keys(FIELD_SECTION) as FieldKey[]).filter((k) => comparable(k, saved) !== comparable(k, draft))
export const changedSections = (saved: OrgForm, draft: OrgForm): SectionKey[] => {
  const hit = new Set(changedFields(saved, draft).map((k) => FIELD_SECTION[k]))
  return SECTIONS.filter((s) => hit.has(s))
}

export type OrgErrorCode = 'required' | 'bin' | 'iik' | 'bik' | 'kbe' | 'email' | 'basis' | 'vatRate' | 'emails' | 'emailsLimit'
const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/
/** Первый неверный адрес КЕДЕН (для текста ошибки); все верные — null. */
export const invalidEmail = (v: string): string | null => splitEmails(v).find((x) => !EMAIL.test(x)) ?? null

/**
 * Проверки на месте. Обязательно одно полное наименование (оно печатается в счетах и актах);
 * остальные поля могут быть пустыми — свежая установка заполняется по частям, — но заполненные обязаны быть
 * в формате: БИН — 12 цифр, ИИК — KZ и 18 знаков, БИК — 8 латинских букв/цифр, Кбе — 2 цифры, email.
 * Адреса КЕДЕН — не больше 20, каждый в формате email (сервер проверяет так же и отвечает 400).
 */
export const validate = (f: OrgForm): Partial<Record<FieldKey, OrgErrorCode>> => {
  const e: Partial<Record<FieldKey, OrgErrorCode>> = {}
  if (!f.companyName.trim()) e.companyName = 'required'
  const bin = f.bin.trim()
  if (bin && !/^\d{12}$/.test(bin)) e.bin = 'bin'
  const iik = compact(f.iik)
  if (iik && !/^KZ[A-Z0-9]{18}$/.test(iik)) e.iik = 'iik'
  const bik = compact(f.bik)
  if (bik && !/^[A-Z0-9]{8}$/.test(bik)) e.bik = 'bik'
  const kbe = f.kbe.trim()
  if (kbe && !/^\d{2}$/.test(kbe)) e.kbe = 'kbe'
  const email = f.email.trim()
  if (email && !EMAIL.test(email)) e.email = 'email'
  if (!f.directorBasis.trim()) e.directorBasis = 'basis'
  if (f.vatPayer && (f.vatRate === null || f.vatRate < VAT_MIN || f.vatRate > VAT_MAX)) e.vatRate = 'vatRate'
  const emails = splitEmails(f.kedenStatusEmails)
  if (emails.length > KEDEN_EMAILS_MAX) e.kedenStatusEmails = 'emailsLimit'
  else if (invalidEmail(f.kedenStatusEmails)) e.kedenStatusEmails = 'emails'
  return e
}

/**
 * Весь DTO в PUT: строки обрезаны и никогда не null (сервер на null отвечает 500), updatedAtUtc — как пришёл.
 * Исключение — адреса КЕДЕН: если передана сохранённая форма (saved) и список не менялся, уходит null — сервер
 * его не трогает (23.10.2026, ревью: давно открытая вкладка при правке реквизитов молча стирала бы список,
 * и письма о статусах ДТ переставали бы уходить; сервер версию записи не сверяет).
 */
export const toPayload = (
  f: OrgForm, base: Pick<OrganizationSettings, 'updatedAtUtc'> | null, saved: OrgForm | null = null,
): OrganizationSettings => ({
  companyName: f.companyName.trim(), shortName: f.shortName.trim(), bin: f.bin.trim(), legalAddress: f.legalAddress.trim(),
  bank: f.bank.trim(), iik: compact(f.iik), bik: compact(f.bik), kbe: f.kbe.trim(),
  directorName: f.directorName.trim(), directorBasis: f.directorBasis.trim() || DEFAULT_BASIS,
  accountantName: f.accountantName.trim(), phone: f.phone.trim(), email: f.email.trim(),
  vatPayer: f.vatPayer, vatRate: f.vatRate ?? 16,
  // Через запятую, как хранит сервер; очистили намеренно — '' (сервер очищает список); не трогали — null.
  kedenStatusEmails: saved && comparable('kedenStatusEmails', saved) === comparable('kedenStatusEmails', f)
    ? null
    : splitEmails(f.kedenStatusEmails).join(','),
  updatedAtUtc: base?.updatedAtUtc ?? null,
})

/** Время с сервера приходит без пояснения пояса — это UTC. */
const parseUtc = (s: string): Date => new Date(/(Z|[+-]\d{2}:?\d{2})$/i.test(s) ? s : `${s}Z`)

/** «02.10, 14:20» (год — только если не текущий), день первым во всех языках; пусто — если времени нет. */
export const formatSavedAt = (iso: string | null | undefined, locale: string, now: Date = new Date()): string => {
  if (!iso) return ''
  const d = parseUtc(iso)
  if (Number.isNaN(d.getTime())) return ''
  const withYear = d.getFullYear() !== now.getFullYear()
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit', month: '2-digit', ...(withYear ? { year: 'numeric' as const } : {}),
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(d)
}
