// Новый вид сверки документов (01.11.2026, дизайн docs/superpowers/specs/2026-11-01-document-check-redesign-design.md):
// какие сверки показывать (одна новейшая на ДТ, прежние — свёрнуто), что попадает в «Исправить», что — в окно подачи.
// Чистые функции без i18n: подписи и форматирование — в компонентах.
import type { DocumentCheck, DocumentCheckDocValue, DocumentCheckRow, DocumentCheckSource, DocumentDiscrepancy } from '@/api/documentChecks'
import type { DtSectionKey } from '@/views/broker/dt/dtSections'

/** ДТ заявки (как в CaseDocumentCheck): разделённая — исходная с частями, части к ней ссылаются. */
export interface DocCheckDtRef {
  id: string
  isSplitReplaced?: boolean
  splitSourceDeclarationId?: string | null
}

/** Самостоятельные ДТ заявки: исходная с частями — одна ДТ (части не считаются). */
export function rootDeclarations<T extends DocCheckDtRef>(list: readonly T[]): T[] {
  const ids = new Set(list.map((d) => d.id))
  return list.filter((d) => !d.splitSourceDeclarationId || d.splitSourceDeclarationId === d.id || !ids.has(d.splitSourceDeclarationId))
}

export interface ShownChecks {
  /** По ДТ — самая новая сверка (сервер отдаёт новые сверху). */
  perDt: DocumentCheck[]
  /** «Разбор без ДТ» — при нескольких ДТ, только самый новый. */
  noDt: DocumentCheck | null
  /** Прежние сверки — свёрнутой строкой, новые сверху. */
  older: DocumentCheck[]
}

/**
 * Какие сверки показывать (D4, правило дизайна 01.11): сверка с ДТ относится к ней; без ДТ при единственной ДТ заявки —
 * к этой ДТ; при нескольких — блок «Разбор без ДТ», только самый новый. На ДТ — самая новая, остальные — в «Прежние».
 */
export function pickShown(checks: readonly DocumentCheck[], declarations: readonly DocCheckDtRef[]): ShownChecks {
  const roots = rootDeclarations(declarations)
  const single = roots.length === 1 ? roots[0].id : null
  const seen = new Set<string>()
  const perDt: DocumentCheck[] = []
  const older: DocumentCheck[] = []
  let noDt: DocumentCheck | null = null
  for (const c of checks) {
    const dt = c.declarationId ?? single
    if (dt == null) {
      if (noDt) older.push(c)
      else noDt = c
      continue
    }
    if (seen.has(dt)) {
      older.push(c)
      continue
    }
    seen.add(dt)
    perDt.push(c)
  }
  return { perDt, noDt, older }
}

// ── «Исправить в ДТ» ──

export const rowsOf = (c: DocumentCheck, section: DocumentCheckRow['section'], marked?: boolean): DocumentCheckRow[] =>
  (c.rows ?? []).filter((r) => (r.section ?? sectionOf(r.result)) === section && (marked == null || !!r.mark === marked))

/** Раздел по итогу строки — если сервер старый и раздела не прислал. */
export const sectionOf = (result: DocumentCheckRow['result']): NonNullable<DocumentCheckRow['section']> =>
  result === 'mismatch' || result === 'docsDiffer' ? 'fix' : result === 'match' ? 'match' : 'manual'

/** Расхождения вне таблицы (строки товаров между документами, ТС с заявкой) — тоже «Исправить». */
export const conflictsOf = (c: DocumentCheck, marked?: boolean): DocumentDiscrepancy[] =>
  [...(c.itemConflicts ?? []), ...(c.caseDiscrepancies ?? [])].filter((d) => marked == null || !!d.mark === marked)

/** Значение документа один раз — с источниками без повторов (D6). */
export interface DocValueGroup {
  value: string
  files: string[]
}

export function groupDocValues(docs: readonly DocumentCheckDocValue[], norm: (v: string) => string = (v) => v.trim()): DocValueGroup[] {
  const groups = new Map<string, DocValueGroup>()
  for (const d of docs) {
    if (d.value == null || d.value === '') continue
    const key = norm(d.value)
    const g = groups.get(key) ?? { value: d.value, files: [] }
    const file = d.fileName ?? ''
    if (file && !g.files.includes(file)) g.files.push(file)
    groups.set(key, g)
  }
  return [...groups.values()]
}

/** Числовые поля строк товаров в расхождениях документов между собой — показываются числом, как в строках сверки. */
const CONFLICT_NUMBER_FIELDS = new Set(['quantity', 'packages', 'gross', 'net', 'value'])
export const conflictValueKind = (d: Pick<DocumentDiscrepancy, 'field' | 'itemIndex'>): 'number' | 'text' =>
  d.itemIndex != null && CONFLICT_NUMBER_FIELDS.has(d.field) ? 'number' : 'text'

/**
 * Значения расхождения «документы между собой / с заявкой» (01.11.2026, доработка пакета D) — по тем же правилам, что у
 * строк: одно значение — один раз, источники без повторов («179随车.pdf · p3, 179随车.pdf · p4-5 → 475 870,83»).
 * Числа сравниваются по величине (475870.83 = 475870.830), текст — без регистра и крайних пробелов.
 */
export function groupConflictValues(d: DocumentDiscrepancy, sourceLabel: (v: DocumentDiscrepancy['values'][number]) => string): DocValueGroup[] {
  const kind = conflictValueKind(d)
  const groups = new Map<string, DocValueGroup>()
  for (const v of d.values) {
    const raw = (v.value ?? '').trim()
    const n = kind === 'number' && raw !== '' ? Number(raw) : NaN
    const key = Number.isFinite(n) ? `n:${n}` : `t:${raw.toUpperCase()}`
    const g = groups.get(key) ?? { value: v.value ?? '', files: [] }
    const label = sourceLabel(v)
    if (label && !g.files.includes(label)) g.files.push(label)
    groups.set(key, g)
  }
  return [...groups.values()]
}

/** Подпись источника из разбора «файл#часть» → «файл · часть», как в строках (прежний сервер присылал «#p3»). */
export const partLabel = (source: string): string => {
  const i = source.indexOf('#')
  return i > 0 && i < source.length - 1 ? `${source.slice(0, i).trim()} · ${source.slice(i + 1).trim()}` : source
}

/** Источник по подписи строки («file.pdf · p3») — для «Открыть документ». */
export function sourceByDisplayName(c: DocumentCheck, display: string): DocumentCheckSource | undefined {
  return (c.documents ?? []).find((s) => (s.sheet ? `${s.fileName} · ${s.sheet}` : s.fileName) === display)
}

/** Страница в источнике, если разбор её дал («p3», «p.3», «стр. 3»); иначе null — не выдумываем. */
export function pageOf(sheet: string | null | undefined): number | null {
  const m = /^(?:p|pg|page|стр)\.?\s*(\d+)/i.exec((sheet ?? '').trim())
  return m ? Number(m[1]) : null
}

/** Раздел страницы ДТ, где поле правят: стороны, финансы, документы гр. 44, транспорт, товары. */
export function dtSectionOf(field: string): DtSectionKey {
  switch (field) {
    case 'sender': case 'receiver': case 'receiverBin': return 'parties'
    case 'currency': return 'finance'
    case 'tractor': case 'trailer': return 'transport'
    case 'gross': case 'net': case 'packages': case 'quantity': case 'valueTotal': return 'goods'
    default: return 'docs'
  }
}

// ── Окно при «Подать ДТ» ──

export interface SubmitFixItem {
  checkId: string
  row?: DocumentCheckRow
  conflict?: DocumentDiscrepancy
}

export interface SubmitSummary {
  fix: SubmitFixItem[]
  /** Файлы, похоже, другой поставки (не исключённые). */
  foreignFiles: string[]
  /** Не проверено вручную — одной строкой. */
  manual: number
  /** Окно нужно: есть «Исправить» или файл другой поставки. Непроверенное вручную само окно не вызывает. */
  show: boolean
}

/** Что показать в окне подачи — по самой новой сверке каждой ДТ заявки («Разбор без ДТ» к ДТ не относится). */
export function submitSummary(checks: readonly DocumentCheck[], declarations: readonly DocCheckDtRef[]): SubmitSummary {
  const { perDt } = pickShown(checks, declarations)
  const fix: SubmitFixItem[] = []
  const foreignFiles: string[] = []
  let manual = 0
  for (const c of perDt) {
    for (const row of rowsOf(c, 'fix', false)) fix.push({ checkId: c.id, row })
    for (const conflict of conflictsOf(c, false)) fix.push({ checkId: c.id, conflict })
    for (const g of c.shipment?.foreign ?? []) for (const f of g.fileNames) if (!foreignFiles.includes(f)) foreignFiles.push(f)
    manual += c.manualCount ?? 0
  }
  return { fix, foreignFiles, manual, show: fix.length > 0 || foreignFiles.length > 0 }
}
