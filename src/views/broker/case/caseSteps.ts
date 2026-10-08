import type { Import40CaseDto, Import40CaseInvoiceDto, Import40FileDto } from '@/api/import40'
import type { DeclarationReadiness } from '@/types/api'
import { formatMoney } from '@/ui/number'
import { pluralForm } from '@/views/broker/list'
import { TOTAL_STEPS, stepForStatus } from '@/utils/import40Steps'

// Шаги карточки заявки (редизайн, волна 4а): состояния, исполнители, сводки пройденных шагов и «что осталось».
// Статус → шаг — общий utils/import40Steps (зеркало Import40Steps.StepOf на сервере).

type T = (k: string, p?: Record<string, unknown>) => string

export const STEP_NUMBERS = [1, 2, 3, 4, 5, 6] as const
export type StepNo = (typeof STEP_NUMBERS)[number]
export type StepState = 'done' | 'current' | 'future'
export type StepExecutor = 'client' | 'kpp' | 'declarant' | 'clientKpp' | 'accountant'

export { TOTAL_STEPS }

/** Кто выполняет шаг (подпись enum.role.*): 1 клиент, 2 КПП, 3 декларант, 4 КПП, 5 клиент и КПП, 6 бухгалтер. */
export const STEP_EXECUTOR: Record<StepNo, StepExecutor> = { 1: 'client', 2: 'kpp', 3: 'declarant', 4: 'kpp', 5: 'clientKpp', 6: 'accountant' }

export const isCancelled = (status: number): boolean => status === 9
export const isDone = (status: number): boolean => status === 8

/** Текущий шаг 1..6; null — заявка выполнена или отменена (текущего шага нет). */
export function currentStepOf(status: number): StepNo | null {
  if (status >= 8) return null
  const n = stepForStatus(status)
  return n >= 1 && n <= TOTAL_STEPS ? (n as StepNo) : null
}

/**
 * Состояние шага: отменённая — все будущие (как раньше: без галочек, тела скрыты);
 * выполненная — все пройдены; иначе до текущего — пройден, текущий, после — будущий.
 */
export function stepStateOf(status: number, n: StepNo): StepState {
  if (isCancelled(status)) return 'future'
  const cur = stepForStatus(status)
  return n < cur ? 'done' : n === cur ? 'current' : 'future'
}

const docsOf = (files: Import40FileDto[]) => files.filter((f) => f.section === 'documents')

/** «4 файла», «1 контейнер» — формы числа из broker.case.count.* . */
export const countText = (kind: 'files' | 'containers', n: number, t: T, locale: string): string =>
  t(`broker.case.count.${kind}.${pluralForm(n, locale)}`, { n })

/** Сводка счёта СВХ (прежний step4Summary): «312 400 ₸ · № 1187 · заметка» | «счёт: заметка» | «закрыт». */
export function svhSummary(c: Import40CaseDto, t: T): string {
  if (c.svhInvoiceAmount != null) {
    const amount = formatMoney(Math.round(c.svhInvoiceAmount))
    const withNumber = c.svhInvoiceNumber ? `${amount} · № ${c.svhInvoiceNumber}` : amount
    return c.svhInvoiceNote ? `${withNumber} · ${c.svhInvoiceNote}` : withNumber
  }
  return c.svhInvoiceNote ? t('import40Case.invoicePrefix', { note: c.svhInvoiceNote }) : t('import40Case.closed')
}

/**
 * Сводка пройденного шага (полоса шагов и «Пройденные шаги»):
 * 1 — контейнеры и файлы клиента, 2 — «пройдена», 3 — «ДТ: N» (все ДТ, как раньше), 4 — счёт СВХ,
 * 5 — «оплачена», 6 — «оплачено»; выполненная без оплаченного счёта AQNIET (complete-without-invoice, 7→8) —
 * «завершена без счёта».
 */
export function stepSummary(
  n: StepNo,
  c: Import40CaseDto,
  files: Import40FileDto[],
  t: T,
  locale: string,
  invoices: Import40CaseInvoiceDto[],
): string {
  switch (n) {
    case 1: {
      const parts: string[] = []
      if (c.containers.length) parts.push(countText('containers', c.containers.length, t, locale))
      parts.push(countText('files', docsOf(files).length, t, locale))
      return parts.join(' · ')
    }
    case 2: return t('import40Case.passed')
    case 3: return t('import40Case.dtCount', { n: c.declarations.length })
    case 4: return svhSummary(c, t)
    case 5: return t('import40Case.paid')
    case 6:
      // 2 — оплачен (как в «Счетах»). Заявка выполнена, а оплаченного счёта нет — значит, завершена без счёта.
      return isDone(c.status) && !invoices.some((i) => i.status === 2)
        ? t('broker.case.aqniet.completedWithoutInvoice')
        : t('import40Case.aqnietPaid')
  }
}

/**
 * «Что осталось до подачи» (шаг 3, Task 4) — пункты по порядку:
 * - dt — создана хотя бы одна ДТ (заменённые разделением не считаются);
 * - fill — по пункту на каждую неготовую ДТ из сводки готовности (заменённых в сводке нет): «Заполнить ДТ N — x из y граф»;
 *   сводки нет (null — недоступна или не загрузилась) — этих пунктов нет;
 * - docs — документы клиента есть (count — сколько);
 * - problem — только пока заявка в проблеме: «Снять запрос таможни».
 * «Подать ДТ» этим не блокируется — это подсказка.
 */
export type WhatsLeftItem =
  | { id: 'dt'; done: boolean }
  | { id: 'fill'; done: false; declarationId: string; label: string; filled: number; total: number }
  | { id: 'docs'; done: boolean; count: number }
  | { id: 'problem'; done: false }

/** Подпись ДТ: номер или «ДТ i» (i — место в списке ДТ заявки). */
export const dtLabel = (c: Import40CaseDto, declarationId: string, t: T): string => {
  const i = c.declarations.findIndex((d) => d.id === declarationId)
  const dt = i >= 0 ? c.declarations[i] : null
  return dt?.declarationNumber || t('import40Case.dtFallback', { n: i >= 0 ? i + 1 : '?' })
}

export function whatsLeft(c: Import40CaseDto, readiness: DeclarationReadiness[] | null, files: Import40FileDto[], t: T): WhatsLeftItem[] {
  const items: WhatsLeftItem[] = [{ id: 'dt', done: c.declarations.some((d) => !d.isSplitReplaced) }]
  const replaced = new Set(c.declarations.filter((d) => d.isSplitReplaced).map((d) => d.id))
  for (const r of readiness ?? []) {
    if (r.isReady || replaced.has(r.declarationId)) continue
    items.push({ id: 'fill', done: false, declarationId: r.declarationId, label: dtLabel(c, r.declarationId, t), filled: r.filled, total: r.total })
  }
  const docs = docsOf(files).length
  items.push({ id: 'docs', done: docs > 0, count: docs })
  if (c.isProblem) items.push({ id: 'problem', done: false })
  return items
}
