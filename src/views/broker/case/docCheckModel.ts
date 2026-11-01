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
