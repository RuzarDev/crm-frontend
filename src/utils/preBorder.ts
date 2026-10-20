import type { PreBorder, PreBorderFields, PreBorderMissingKey, SerialKindMode, SerialReason } from '@/api/preBorder'
import type { StageTone } from '@/utils/import40StageModel'
import { loadXlsx } from '@/utils/xlsx'

// Поставка до границы (очередь 4, задача 1): подшаги перед «Границей», проверка серийных номеров / IMEI (те же правила,
// что Import40PreBorderRules на сервере — сервер проверяет заново) и разбор списка из Excel.

type T = (k: string, p?: Record<string, unknown>) => string

// ───────────────────────── форма ─────────────────────────

export const emptyPreBorderFields = (): PreBorderFields => ({
  supplierPaymentDeferred: false, paymentIds: [], loadingDate: null, loadingCity: '', loadingWarehouse: '', sealNumbers: '',
  carrierId: null, vehicleNumber: '', trailerNumber: '', containerNumber: '', wagonNumber: '', expectedBorderDate: null,
})

export const preBorderFieldsOf = (p: PreBorder): PreBorderFields => ({
  supplierPaymentDeferred: p.supplierPaymentDeferred,
  paymentIds: p.payments.map((x) => x.id),
  loadingDate: p.loadingDate,
  loadingCity: p.loadingCity ?? '',
  loadingWarehouse: p.loadingWarehouse ?? '',
  sealNumbers: p.sealNumbers ?? '',
  carrierId: p.carrierId,
  vehicleNumber: p.vehicleNumber ?? '',
  trailerNumber: p.trailerNumber ?? '',
  containerNumber: p.containerNumber ?? '',
  wagonNumber: p.wagonNumber ?? '',
  expectedBorderDate: p.expectedBorderDate,
})

/** Ошибки формы (ключи i18n): прибытие на границу — не раньше погрузки. */
export function preBorderErrors(f: PreBorderFields): Partial<Record<keyof PreBorderFields, string>> {
  const e: Partial<Record<keyof PreBorderFields, string>> = {}
  if (f.loadingDate && f.expectedBorderDate && f.expectedBorderDate < f.loadingDate) e.expectedBorderDate = 'preBorder.err.etaBeforeLoading'
  return e
}

// ───────────────────────── подшаги ─────────────────────────

export type PreBorderSubKey = 'pay' | 'load' | 'transit' | 'arrival'
export interface PreBorderSubStage { key: PreBorderSubKey; label: string; state: 'done' | 'current' | 'todo'; tone: StageTone; caption: string }

const pad = (n: number) => String(n).padStart(2, '0')
/** 'YYYY-MM-DD' → «14.10». */
export const dayMonth = (iso: string | null | undefined): string => {
  if (!iso) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}.${m[2]}` : ''
}
const todayIso = (now: Date) => `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
const dateTimeShort = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Показывать ли подшаги до границы: начато, или заявка ещё не прошла границу (черновик / «На границе»). */
export const showPreBorder = (p: PreBorder | null | undefined): p is PreBorder =>
  !!p && p.status !== 9 && (p.started || p.status <= 1)

/**
 * Оплата → Погрузка → В пути → Прибытие (= «Машина прибыла» КПП). ask — ход клиента: подшаг не заполнен, а груз ещё не
 * на границе (только начатые поставки, как «Нужно от вас»). Сотруднику недостающее — золотом без «ваш ход».
 */
export function preBorderSubstages(p: PreBorder, t: T, now: Date = new Date()): PreBorderSubStage[] {
  const missing = new Set(p.missing)
  const arrived = !!p.borderArrivedAtUtc || (p.status >= 2 && p.status !== 9)
  const today = todayIso(now)
  const todo = (key: PreBorderSubKey, label: string, caption = ''): PreBorderSubStage => ({ key, label, state: 'todo', tone: 'future', caption })
  const ask = (key: PreBorderSubKey, label: string, caption: string): PreBorderSubStage =>
    ({ key, label, state: 'current', tone: 'ask', caption })

  // 1. Оплата поставщику
  const payLabel = t('preBorder.sub.pay')
  const lastPaid = [...p.payments].sort((a, b) => b.paidOn.localeCompare(a.paidOn))[0]
  const pay: PreBorderSubStage = lastPaid
    ? { key: 'pay', label: payLabel, state: 'done', tone: 'ok', caption: t('preBorder.sub.paidOn', { date: dayMonth(lastPaid.paidOn), n: p.payments.length }) }
    : p.supplierPaymentDeferred
      ? { key: 'pay', label: payLabel, state: 'done', tone: 'ok', caption: t('preBorder.sub.payDeferred') }
      : missing.has('payment') ? ask('pay', payLabel, t('preBorder.sub.notFilled')) : todo('pay', payLabel, arrived ? t('preBorder.sub.notFilled') : '')

  // 2. Готовность и погрузка
  const loadLabel = t('preBorder.sub.load')
  const place = [p.loadingCity, p.loadingWarehouse].filter(Boolean).join(', ')
  const load: PreBorderSubStage = p.loadingDate
    ? p.loadingDate <= today || arrived
      ? { key: 'load', label: loadLabel, state: 'done', tone: 'ok', caption: [t('preBorder.sub.loadedOn', { date: dayMonth(p.loadingDate) }), place].filter(Boolean).join(' · ') }
      : { key: 'load', label: loadLabel, state: 'current', tone: 'current', caption: [t('preBorder.sub.loadingOn', { date: dayMonth(p.loadingDate) }), place].filter(Boolean).join(' · ') }
    : missing.has('loading') ? ask('load', loadLabel, t('preBorder.sub.notFilled')) : todo('load', loadLabel)

  // 3. В пути
  const transitLabel = t('preBorder.sub.transit')
  const lastMark = p.marks[0]
  const eta = p.expectedBorderDate ? t('preBorder.sub.eta', { date: dayMonth(p.expectedBorderDate) }) : ''
  let transit: PreBorderSubStage
  if (arrived) transit = { key: 'transit', label: transitLabel, state: 'done', tone: 'ok', caption: lastMark ? lastMark.place : t('preBorder.sub.done') }
  else if (missing.has('transport') || missing.has('eta')) {
    transit = ask('transit', transitLabel, t(missing.has('transport') ? 'preBorder.sub.noTransport' : 'preBorder.sub.noEta'))
  } else if (load.state === 'done' || lastMark) {
    transit = {
      key: 'transit', label: transitLabel, state: 'current', tone: 'current',
      caption: [lastMark ? `${lastMark.place} · ${dateTimeShort(lastMark.atUtc)}` : '', eta].filter(Boolean).join(' · ') || t('preBorder.sub.inTransit'),
    }
  } else transit = todo('transit', transitLabel, eta)

  // 4. Прибытие на границу — отметка КПП «Машина прибыла»
  const arrivalLabel = t('preBorder.sub.arrival')
  const arrival: PreBorderSubStage = p.borderArrivedAtUtc
    ? {
        key: 'arrival', label: arrivalLabel, state: 'done', tone: 'ok',
        caption: [t('preBorder.sub.arrivedAt', { when: dateTimeShort(p.borderArrivedAtUtc) }), p.borderArrivalPost].filter(Boolean).join(' · '),
      }
    : arrived
      ? { key: 'arrival', label: arrivalLabel, state: 'done', tone: 'ok', caption: t('preBorder.sub.done') }
      : todo('arrival', arrivalLabel, eta || t('preBorder.sub.expected'))

  return [pay, load, transit, arrival]
}

/** «Нужно от вас»: недостающее до прибытия — подписи через запятую. */
export const missingText = (keys: readonly PreBorderMissingKey[], t: T): string =>
  keys.map((k) => t(`preBorder.missing.${k}`)).join(', ')

// ───────────────────────── серийные номера / IMEI ─────────────────────────

export const normalizeSerial = (raw: unknown): string =>
  String(raw ?? '').replace(/\s+/g, '').toUpperCase()

/** Контрольная цифра Луна (IMEI — 15 цифр, последняя — контрольная). */
export function luhnValid(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false
  let sum = 0
  let dbl = false
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48
    if (dbl) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
    dbl = !dbl
  }
  return sum % 10 === 0
}

const SERIAL_FORMAT = /^[A-Z0-9][A-Z0-9\-/._]{0,63}$/

/** То же, что Import40PreBorderRules.Check: auto — 15 цифр считаются IMEI, остальное — серийный номер. */
export function checkSerial(raw: unknown, mode: SerialKindMode): { value: string; kind: 'imei' | 'serial'; error: SerialReason | null } {
  const v = normalizeSerial(raw)
  const allDigits = /^\d+$/.test(v)
  if (mode === 'imei' || (mode !== 'serial' && allDigits && v.length === 15)) {
    if (!allDigits || v.length !== 15) return { value: v, kind: 'imei', error: 'imeiLength' }
    return { value: v, kind: 'imei', error: luhnValid(v) ? null : 'imeiChecksum' }
  }
  return { value: v, kind: 'serial', error: SERIAL_FORMAT.test(v) ? null : 'format' }
}

export interface SerialCheckRow { line: number; value: string; kind: 'imei' | 'serial'; error: SerialReason | 'duplicate' | null; firstLine?: number }

/** Предпросмотр перед отправкой: формат, Луна, повторы в списке (строка первого вхождения). line — строка файла/текста. */
export function checkSerialList(items: { line: number; raw: unknown }[], mode: SerialKindMode): SerialCheckRow[] {
  const seen = new Map<string, number>()
  const out: SerialCheckRow[] = []
  for (const it of items) {
    if (normalizeSerial(it.raw) === '') continue
    const c = checkSerial(it.raw, mode)
    if (c.error) { out.push({ line: it.line, ...c }); continue }
    const first = seen.get(c.value)
    if (first != null) { out.push({ line: it.line, value: c.value, kind: c.kind, error: 'duplicate', firstLine: first }); continue }
    seen.set(c.value, it.line)
    out.push({ line: it.line, ...c })
  }
  return out
}

/** Строки текста (вставка из буфера): по строке, запятой или точке с запятой. */
export const serialsFromText = (text: string): { line: number; raw: string }[] =>
  text.split(/\r?\n/).flatMap((ln, i) => ln.split(/[,;\t]/).map((raw) => ({ line: i + 1, raw })))
    .filter((x) => x.raw.trim() !== '')

const HEADER = /imei|серийн|serial|s\/n|^sn$|^№?\s*sn\b/i
const HEADER_SCAN_ROWS = 10

/**
 * Значение ячейки Excel: число (IMEI часто хранят числом) — целым без «e+14»; текст — как есть.
 */
const cellText = (v: unknown): string => {
  if (v == null) return ''
  if (typeof v === 'number' && Number.isFinite(v)) return Number.isInteger(v) ? BigInt(v).toString() : String(v)
  return String(v).trim()
}

/**
 * Список из листа Excel: столбец с заголовком «IMEI», «Серийный номер», «Serial», «S/N» (в первых 10 строках), иначе —
 * первый непустой столбец. line — номер строки в Excel.
 */
export function serialsFromSheet(rows: unknown[][]): { items: { line: number; raw: string }[]; header: string | null } {
  let col = -1
  let headerRow = -1
  let header: string | null = null
  for (let r = 0; r < Math.min(HEADER_SCAN_ROWS, rows.length) && col < 0; r++) {
    const row = rows[r] ?? []
    for (let c = 0; c < row.length; c++) {
      const text = cellText(row[c])
      if (text && HEADER.test(text)) { col = c; headerRow = r; header = text; break }
    }
  }
  if (col < 0) {
    // Без заголовка — первый столбец, где есть хоть одно значение.
    const width = rows.reduce((m, r) => Math.max(m, r?.length ?? 0), 0)
    for (let c = 0; c < width && col < 0; c++) if (rows.some((r) => cellText(r?.[c]) !== '')) col = c
  }
  if (col < 0) return { items: [], header: null }
  const items: { line: number; raw: string }[] = []
  for (let r = headerRow + 1; r < rows.length; r++) {
    const text = cellText(rows[r]?.[col])
    if (text) items.push({ line: r + 1, raw: text })
  }
  return { items, header }
}

/** Первый лист файла .xlsx/.xls → строки ячеек (библиотека грузится по требованию). */
export async function readSheetRows(file: File): Promise<unknown[][]> {
  const XLSX = await loadXlsx()
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
  const name = wb.SheetNames[0]
  if (!name) return []
  return XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name]!, { header: 1, raw: true, defval: null, blankrows: true })
}
