import type { TnvedRateChangeDto, TnvedTimelineDto } from '@/types/api'
import type { ZTone } from '@/components/z/ZTag.vue'
import { cleanName, codeDigits, formatTnvedCode } from '@/views/references/tnvedShared'

// «Изменения» (волна 5а): одна лента из хронологии ТН ВЭД (вступление в силу и окончание действия ставок)
// и изменений ставок, найденных синхронизацией. Без Vue — проверяется отдельно.

export type ChangeKind = 'starts' | 'ends' | 'rate'
/** Что меняется в событии хронологии (поле what сервера): ставка ЕТТ, ВТО, антидемпинговая, компенсационная, специальная пошлина. */
export type ChangeWhat = 'importDuty' | 'vtoDuty' | 'antiDumping' | 'compensatory' | 'special'
const KNOWN_WHAT: readonly string[] = ['importDuty', 'vtoDuty', 'antiDumping', 'compensatory', 'special']

export interface ChangeEntry {
  /** Уникален в ленте: «источник:дата:…». */
  key: string
  kind: ChangeKind
  /** Дата события, «ГГГГ-ММ-ДД». */
  date: string
  /** До пяти кодов; остальные — moreCodes. */
  codes: string[]
  moreCodes: number
  /** Хронология: что меняется, значение ставки и страна (ISO alpha-2) — структурные поля сервера. */
  what: ChangeWhat | null
  value: string | null
  countryCode: string | null
  /** Страна из скобок строки сервера — когда countryCode пуст (сервер не сопоставил название КЕДЕН). */
  countryText: string | null
  /** Только для старого сервера без структурных полей: подробности, вынутые из строки description. */
  detail: string
  /** Старая строка сервера — запасной текст, когда структуры не хватило. */
  description: string
  /** Изменение ставки: название узла и «было → стало». */
  name: string
  oldRate: string | null
  newRate: string | null
}

/** Дата из ответа сервера: «ГГГГ-ММ-ДД» от начала строки; DateTime без пояса не пересчитываем в местное время. */
export const isoDate = (s: string | null | undefined): string => {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s ?? '')
  return m ? m[1] : ''
}

// Дни событий считает сервер по времени Казахстана (UTC+5, как «сегодня» в GetTnvedTimeline): так же считаем день у моментов времени и «сегодня».
const ALMATY_OFFSET_MS = 5 * 3_600_000
const almatyDay = (ms: number): string => new Date(ms + ALMATY_OFFSET_MS).toISOString().slice(0, 10)

/** День момента времени (detectedAtUtc) по времени Казахстана; строка без пояса — UTC. Мусор — пустая строка. */
export const localDay = (s: string | null | undefined): string => {
  if (!s) return ''
  const ms = Date.parse(/(?:Z|[+-]\d{2}:?\d{2})$/.test(s) || !s.includes('T') ? s : `${s}Z`)
  return Number.isFinite(ms) ? almatyDay(ms) : ''
}

/** Сегодня по времени Казахстана, «ГГГГ-ММ-ДД». */
export const todayIso = (now: Date = new Date()): string => almatyDay(now.getTime())

// Старый сервер без what: тип по typeId (у окончания действия он всегда 4 — тогда «что» только из строки).
const WHAT_BY_TYPE: Record<number, ChangeWhat> = { 1: 'importDuty', 2: 'vtoDuty', 3: 'antiDumping' }

/**
 * Запасной вариант для сервера без структурных what/value/countryCode. Подробности события из строки сервера («С 15.10.2026: ставка ввозной пошлины ЕТТ 10% — 8 кодов: …»): значение ставки
 * и страну отдельным полем сервер пока не присылает. Что именно меняется, определяем и по строке — у окончания
 * действия typeId всегда 4, а «что» из него не узнать.
 */
export function parseDescription(description: string | null | undefined): { what: ChangeWhat | null; detail: string } {
  const m = /^(?:С|До)\s+\d{2}\.\d{2}\.\d{4}:\s*(.+?)\s+—\s+\d+\s+код/i.exec((description ?? '').trim())
  if (!m) return { what: null, detail: '' }
  const body = m[1].replace(/^окончание:\s*/i, '')
  const rules: [RegExp, ChangeWhat][] = [
    [/^ставка ввозной пошлины ЕТТ\s*/i, 'importDuty'],
    [/^пониженная ставка ВТО(?:\s*\([^)]*\))?\s*/i, 'vtoDuty'],
    [/^антидемпинговая пошлина\s*/i, 'antiDumping'],
  ]
  for (const [re, what] of rules) if (re.test(body)) return { what, detail: body.replace(re, '').trim() }
  return { what: null, detail: '' }
}

const COUNTRY_WHAT: readonly ChangeWhat[] = ['antiDumping', 'compensatory', 'special']
const capitalizeWords = (s: string): string =>
  (s === s.toLocaleUpperCase('ru') ? s.toLocaleLowerCase('ru') : s).replace(/(^|[\s-])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toLocaleUpperCase('ru'))

/** Страна специальной пошлины из скобок строки сервера («… пошлина (КИТАЙ) 28.2% — 3 кода…»); нет скобок — null. */
export function countryFromDescription(description: string | null | undefined): string | null {
  const head = (description ?? '').split(/\s+—\s+/)[0]
  const m = /\(([^()]+)\)/.exec(head)
  const raw = m?.[1].trim()
  return raw ? capitalizeWords(raw) : null
}

/** Хронология ТН ВЭД (tnved/timeline): структурные поля сервера, текст строится на экране. */
export function timelineEntries(items: TnvedTimelineDto[] | null | undefined): ChangeEntry[] {
  return (items ?? []).map((it, i) => {
    const date = isoDate(it.date || it.showDate)
    // Структура сервера главнее строки; строку разбираем, только если what не пришёл (старый сервер).
    const structured = typeof it.what === 'string' && it.what !== ''
    const parsed = structured ? { what: null, detail: '' } : parseDescription(it.description)
    const kind: ChangeKind = it.kind === 'ends' || it.typeId === 4 ? 'ends' : 'starts'
    const codes = it.codes ?? []
    const what: ChangeWhat | null = structured ? (KNOWN_WHAT.includes(it.what!) ? (it.what as ChangeWhat) : null) : (parsed.what ?? WHAT_BY_TYPE[it.typeId] ?? null)
    const countryCode = it.countryCode?.trim().toUpperCase() || null
    return {
      key: `tl:${date}:${it.typeId}:${codes[0] ?? ''}:${i}`,
      kind,
      date,
      codes,
      moreCodes: Math.max(0, (it.totalCodes ?? codes.length) - codes.length),
      what,
      value: it.value?.trim() || null,
      countryCode,
      countryText: structured && !countryCode && what && COUNTRY_WHAT.includes(what) ? countryFromDescription(it.description) : null,
      detail: parsed.detail,
      description: it.description ?? '',
      name: '',
      oldRate: null,
      newRate: null,
    }
  })
}

/** Изменения ставок (tnved/rate-changes): дата — detectedAtUtc, название — name (старый экран читал несуществующие поля). */
export function rateChangeEntries(items: TnvedRateChangeDto[] | null | undefined): ChangeEntry[] {
  return (items ?? []).map((c, i) => ({
    key: `rate:${localDay(c.detectedAtUtc)}:${c.code}:${i}`,
    kind: 'rate' as const,
    date: localDay(c.detectedAtUtc),
    codes: [c.code],
    moreCodes: 0,
    what: null,
    value: null,
    countryCode: null,
    countryText: null,
    detail: '',
    description: '',
    name: cleanName(c.name),
    oldRate: c.oldRateStr?.trim() || null,
    newRate: c.newRateStr?.trim() || null,
  }))
}

/** Склейка двух источников: новые даты сверху, при равной дате — хронология перед изменениями ставок. */
export function mergeChanges(...lists: ChangeEntry[][]): ChangeEntry[] {
  return lists
    .flat()
    .map((e, i) => ({ e, i }))
    .sort((a, b) => (a.e.date < b.e.date ? 1 : a.e.date > b.e.date ? -1 : a.i - b.i))
    .map((x) => x.e)
}

export const isFuture = (e: ChangeEntry, today: string): boolean => e.date >= today

/** Подпись типа: ключ в broker.references.changes.type.*, у «вступает в силу» прошедшее время для прошедших дат. */
export const typeKey = (e: ChangeEntry, today: string): 'starts' | 'started' | 'ends' | 'ended' | 'rate' => {
  if (e.kind === 'rate') return 'rate'
  const future = isFuture(e, today)
  if (e.kind === 'starts') return future ? 'starts' : 'started'
  return future ? 'ends' : 'ended'
}

export const typeTone = (e: ChangeEntry, today: string): ZTone => {
  if (e.kind === 'rate') return 'info'
  if (e.kind === 'ends') return 'danger'
  return isFuture(e, today) ? 'wait' : 'done'
}

type Translate = (key: string, named?: Record<string, unknown>) => string

/** Название страны по ISO alpha-2 на языке интерфейса; нет данных у браузера — сам код. */
export function countryName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(code) ?? code
  } catch {
    return code
  }
}

/** Текст события из структурных полей (переводится); не хватило структуры — старая строка сервера. */
export function changeText(e: ChangeEntry, t: Translate, locale = 'ru'): string {
  if (e.kind === 'rate') return e.name || formatTnvedCode(e.codes[0] ?? '') || '—'
  if (!e.what) return e.description || '—'
  const what = t(`broker.references.changes.what.${e.what}`)
  const countryLabel = e.countryCode ? countryName(e.countryCode, locale) : e.countryText
  const country = countryLabel ? ` (${countryLabel})` : ''
  if (e.value || countryLabel) return `${what}${country}${e.value ? `: ${e.value}` : ''}`
  if (!e.detail) return what
  return `${what}${e.detail.startsWith('(') ? ' ' : ': '}${e.detail}`
}

export type ChangePeriod = '30' | '90'

export interface ChangeFilters {
  /** «Будущие»: только события с сегодняшнего дня. */
  future: boolean
  type: ChangeKind | null
  /** Период ±N дней от сегодня; null — без ограничения. */
  period: ChangePeriod | null
  q: string
}

const addDays = (iso: string, days: number): string => {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const norm = (s: string): string => s.toLocaleLowerCase('ru').replace(/\s+/g, ' ').trim()

/** Поиск по коду (цифры — по началу кода) или по тексту: текст события, название, ставки, строка сервера. */
export function matchesQuery(e: ChangeEntry, q: string, t: Translate): boolean {
  const term = q.trim()
  if (!term) return true
  if (/^[\d\s.-]+$/.test(term)) {
    const digits = codeDigits(term)
    return !digits || e.codes.some((c) => codeDigits(c).startsWith(digits))
  }
  const hay = norm([changeText(e, t), e.name, e.oldRate, e.newRate, e.description, ...e.codes].filter(Boolean).join(' '))
  return hay.includes(norm(term))
}

export function filterChanges(entries: ChangeEntry[], f: ChangeFilters, today: string, t: Translate): ChangeEntry[] {
  const span = f.period ? Number(f.period) : null
  const from = span ? addDays(today, -span) : null
  const to = span ? addDays(today, span) : null
  return entries.filter((e) => {
    if (f.future && !isFuture(e, today)) return false
    if (f.type && e.kind !== f.type) return false
    if (from && to && (e.date < from || e.date > to)) return false
    return matchesQuery(e, f.q, t)
  })
}
