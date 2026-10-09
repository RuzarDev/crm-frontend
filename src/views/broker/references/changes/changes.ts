import type { TnvedRateChangeDto, TnvedTimelineDto } from '@/types/api'
import type { ZTone } from '@/components/z/ZTag.vue'
import { cleanName, codeDigits, formatTnvedCode } from '@/views/references/tnvedShared'

// «Изменения» (волна 5а): одна лента из хронологии ТН ВЭД (вступление в силу и окончание действия ставок)
// и изменений ставок, найденных синхронизацией. Без Vue — проверяется отдельно.

export type ChangeKind = 'starts' | 'ends' | 'rate'
/** Что именно меняется в событии хронологии: ставка ЕТТ, пониженная ставка ВТО, антидемпинговая пошлина. */
export type ChangeWhat = 'ett' | 'vto' | 'ad'

export interface ChangeEntry {
  /** Уникален в ленте: «источник:дата:…». */
  key: string
  kind: ChangeKind
  /** Дата события, «ГГГГ-ММ-ДД». */
  date: string
  /** До пяти кодов; остальные — moreCodes. */
  codes: string[]
  moreCodes: number
  /** Хронология: что меняется и подробности (значение ставки, страна) — из структуры и из строки сервера. */
  what: ChangeWhat | null
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

/** Сегодня по местному времени, «ГГГГ-ММ-ДД». */
export const todayIso = (now: Date = new Date()): string =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

const WHAT_BY_TYPE: Record<number, ChangeWhat> = { 1: 'ett', 2: 'vto', 3: 'ad' }

/**
 * Подробности события из строки сервера («С 15.10.2026: ставка ввозной пошлины ЕТТ 10% — 8 кодов: …»): значение ставки
 * и страну отдельным полем сервер пока не присылает. Что именно меняется, определяем и по строке — у окончания
 * действия typeId всегда 4, а «что» из него не узнать.
 */
export function parseDescription(description: string | null | undefined): { what: ChangeWhat | null; detail: string } {
  const m = /^(?:С|До)\s+\d{2}\.\d{2}\.\d{4}:\s*(.+?)\s+—\s+\d+\s+код/i.exec((description ?? '').trim())
  if (!m) return { what: null, detail: '' }
  const body = m[1].replace(/^окончание:\s*/i, '')
  const rules: [RegExp, ChangeWhat][] = [
    [/^ставка ввозной пошлины ЕТТ\s*/i, 'ett'],
    [/^пониженная ставка ВТО(?:\s*\([^)]*\))?\s*/i, 'vto'],
    [/^антидемпинговая пошлина\s*/i, 'ad'],
  ]
  for (const [re, what] of rules) if (re.test(body)) return { what, detail: body.replace(re, '').trim() }
  return { what: null, detail: '' }
}

/** Хронология ТН ВЭД (tnved/timeline): структурные поля сервера, текст строится на экране. */
export function timelineEntries(items: TnvedTimelineDto[] | null | undefined): ChangeEntry[] {
  return (items ?? []).map((it, i) => {
    const date = isoDate(it.date || it.showDate)
    const parsed = parseDescription(it.description)
    const kind: ChangeKind = it.kind === 'ends' || it.typeId === 4 ? 'ends' : 'starts'
    const codes = it.codes ?? []
    return {
      key: `tl:${date}:${it.typeId}:${codes[0] ?? ''}:${i}`,
      kind,
      date,
      codes,
      moreCodes: Math.max(0, (it.totalCodes ?? codes.length) - codes.length),
      what: parsed.what ?? WHAT_BY_TYPE[it.typeId] ?? null,
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
    key: `rate:${isoDate(c.detectedAtUtc)}:${c.code}:${i}`,
    kind: 'rate' as const,
    date: isoDate(c.detectedAtUtc),
    codes: [c.code],
    moreCodes: 0,
    what: null,
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

/** Текст события из структурных полей (переводится); не хватило структуры — старая строка сервера. */
export function changeText(e: ChangeEntry, t: Translate): string {
  if (e.kind === 'rate') return e.name || formatTnvedCode(e.codes[0] ?? '') || '—'
  if (!e.what) return e.description || '—'
  const what = t(`broker.references.changes.what.${e.what}`)
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
