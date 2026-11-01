// Подписи и значения сверки документов — общие для блока в карточке заявки, прежних сверок и окна подачи (01.11.2026:
// вынесено из CaseDocumentCheck.vue при новом виде сверки).
import { useI18n } from 'vue-i18n'
import type { DocumentCheck, DocumentCheckRow, DocumentCheckSource, DocumentDiscrepancy, DocumentDiscrepancyValue } from '@/api/documentChecks'
import { formatDateText } from '@/ui/date'
import { formatNumberIn } from '@/ui/number'

export function useDocCheckFormat() {
  const { t, te, locale } = useI18n()

  /** Разделённая ДТ — по частям, которые есть: у одного товара бывает только ВТО (без части ЕТТ). */
  const splitLabel = (roles: readonly (string | null | undefined)[]) => {
    const has = (r: string) => roles.some((x) => x?.toUpperCase() === r)
    return has('VTO') && !has('ETT') ? t('docCheck.splitDtVto')
      : has('ETT') && !has('VTO') ? t('docCheck.splitDtEtt')
        : t('docCheck.splitDt')
  }
  const checkTitle = (c: DocumentCheck) =>
    c.declarationSplit ? splitLabel(c.declarationSplitRoles ?? [])
      : c.declarationNumber ? t('docCheck.forDt', { n: c.declarationNumber })
        : c.declarationId ? t('docCheck.forDtNoNumber') : t('docCheck.noDt')
  const when = (iso: string | null | undefined) => {
    if (!iso) return ''
    const d = new Date(iso)
    const p = (n: number) => String(n).padStart(2, '0')
    return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
  }
  const day = (iso: string | null | undefined) => when(iso).slice(0, 5)
  const rowLabel = (r: Pick<DocumentCheckRow, 'field' | 'fieldLabel'>) => (te(`docCheck.row.${r.field}`) ? t(`docCheck.row.${r.field}`) : r.fieldLabel)
  const kindLabel = (kind: string) => (te(`docCheck.docKind.${kind}`) ? t(`docCheck.docKind.${kind}`) : t('docCheck.docKind.other'))
  const reasonLabel = (s: DocumentCheckSource) => (s.reason && te(`docCheck.reason.${s.reason}`) ? t(`docCheck.reason.${s.reason}`) : '')

  const num = (v: string, kind: DocumentCheckRow['valueKind'], currency?: string | null) => {
    const n = Number(v)
    if (!Number.isFinite(n)) return v
    return kind === 'money'
      ? `${formatNumberIn(locale.value, n, 2, 2)}${currency ? ` ${currency}` : ''}`
      : formatNumberIn(locale.value, n, 3)
  }
  const money = (v: number | null | undefined, currency?: string | null) =>
    v == null ? '' : `${formatNumberIn(locale.value, v, 2, 2)}${currency ? ` ${currency}` : ''}`
  /** Значение по роду: числа и деньги — по языку интерфейса, даты — ДД.ММ.ГГГГ, списки — через запятую. */
  const fmt = (v: string | null | undefined, r: Pick<DocumentCheckRow, 'valueKind' | 'currency'>): string => {
    if (v == null || v === '') return '—'
    if (r.valueKind === 'number' || r.valueKind === 'money') return num(v, r.valueKind, r.currency)
    if (r.valueKind === 'date') return v.split(', ').map((d) => formatDateText(d) || d).join(', ')
    return v
  }
  const noteText = (note: string | null | undefined, r: Pick<DocumentCheckRow, 'currency'>): string => {
    if (!note) return ''
    const [key, ...rest] = note.split(':')
    const arg = rest.join(':')
    switch (key) {
      case 'dtPartial': {
        const [k, n] = arg.split('/')
        return t('docCheck.note.dtPartial', { k, n })
      }
      case 'sum42': return t('docCheck.note.sum42', { v: num(arg, 'money', r.currency) })
      case 'docsSum': return t('docCheck.note.docsSum', { n: arg })
      case 'matchesFile': return t('docCheck.note.matchesFile', { f: arg })
      default: return te(`docCheck.note.${key}`) ? t(`docCheck.note.${key}`) : ''
    }
  }

  // ── Документы между собой и с заявкой ──
  const fieldName = (d: DocumentDiscrepancy) => (te(`docCheck.field.${d.field}`) ? t(`docCheck.field.${d.field}`) : d.fieldLabel)
  const sourceName = (v: DocumentDiscrepancyValue) => {
    if (v.sourceKind === 'case') return t('docCheck.source.case')
    if (v.sourceKind === 'declaration') return t('docCheck.source.dt', { n: v.source || '—' })
    if (v.sourceKind === 'documents') return t('docCheck.source.documents')
    return v.source || t('docCheck.source.document')
  }

  return { t, te, locale, splitLabel, checkTitle, when, day, rowLabel, kindLabel, reasonLabel, num, money, fmt, noteText, fieldName, sourceName }
}
