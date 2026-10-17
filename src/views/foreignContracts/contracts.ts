import type { ZTone } from '@/components/z/ZTag.vue'
import type {
  ContractCheck, ContractDeadline, ContractDeadlineState, ContractPaymentFields, ForeignContract, ForeignContractFields,
} from '@/api/foreignContracts'
import { formatNumberIn } from '@/ui/number'
import { formatDay, matchesQuery } from '@/views/broker/list'

// Чистая логика внешнеторговых контрактов (17.10, задача 3): суммы в валюте, сроки, форма, тексты сверки.

type T = (key: string, params?: Record<string, unknown>) => string

/** Сумма в валюте контракта: 2 знака, код валюты после числа (как гр. 22 в ДТ). */
export const money = (locale: string, n: number | null | undefined, currency: string | null | undefined): string =>
  n == null ? '—' : `${formatNumberIn(locale, n, 2, 2)}${currency ? ` ${currency}` : ''}`

export const day = (iso: string | null | undefined): string => (iso ? formatDay(iso) : '—')

export const DEADLINE_TONE: Record<ContractDeadlineState, ZTone> = {
  ok: 'neutral',
  soon: 'wait',
  today: 'danger',
  overdue: 'danger',
  done: 'done',
}

/** «через 12 дн.», «сегодня», «просрочен на 3 дн.», «исполнено». */
export const deadlineHint = (d: ContractDeadline, t: T): string => {
  if (d.state === 'done') return t(`foreignContracts.deadlineDone.${d.kind}`)
  if (d.daysLeft < 0) return t('foreignContracts.hint.overdue', { n: -d.daysLeft })
  if (d.daysLeft === 0) return t('foreignContracts.hint.today')
  return t('foreignContracts.hint.left', { n: d.daysLeft })
}

/** Ближайший неисполненный срок, требующий внимания (≤ 30 дней или прошёл). */
export const urgentDeadline = (c: ForeignContract): ContractDeadline | null =>
  c.deadlines.filter((d) => d.state === 'soon' || d.state === 'today' || d.state === 'overdue')
    .sort((a, b) => a.daysLeft - b.daysLeft)[0] ?? null

/** Доля поставленного от суммы контракта, 0–100 (для полосы). */
export const deliveredPercent = (c: ForeignContract): number =>
  c.amount > 0 ? Math.max(0, Math.min(100, Math.round((c.balance.delivered / c.amount) * 100))) : 0

export const filterContracts = (list: ForeignContract[], q: string): ForeignContract[] => {
  if (!q.trim()) return list
  return list.filter((c) => matchesQuery(q, [c.number, c.supplierName, c.unkNumber, c.currency]))
}

export const emptyFields = (): ForeignContractFields => ({
  number: '',
  contractDate: null,
  supplierName: '',
  supplierCountryCode: null,
  currency: null,
  amount: null,
  validUntil: null,
  incoterms: null,
  incotermsPlace: '',
  paymentTerms: '',
  unkNumber: '',
  unkDate: null,
  unkBank: '',
  unkRemovalDeadline: null,
  unkRemovedOn: null,
  repatriationDeadline: null,
  contractDocumentId: null,
  unkDocumentId: null,
  note: '',
})

export const fieldsOf = (c: ForeignContract): ForeignContractFields => ({
  number: c.number,
  contractDate: c.contractDate,
  supplierName: c.supplierName,
  supplierCountryCode: c.supplierCountryCode,
  currency: c.currency,
  amount: c.amount,
  validUntil: c.validUntil,
  incoterms: c.incoterms,
  incotermsPlace: c.incotermsPlace ?? '',
  paymentTerms: c.paymentTerms ?? '',
  unkNumber: c.unkNumber ?? '',
  unkDate: c.unkDate,
  unkBank: c.unkBank ?? '',
  unkRemovalDeadline: c.unkRemovalDeadline,
  unkRemovedOn: c.unkRemovedOn,
  repatriationDeadline: c.repatriationDeadline,
  contractDocumentId: c.contractDocument?.id ?? null,
  unkDocumentId: c.unkDocument?.id ?? null,
  note: c.note ?? '',
})

export type ContractField = keyof ForeignContractFields

/** Ошибки формы — ключи i18n (те же правила, что на сервере). */
export function fieldErrors(f: ForeignContractFields): Partial<Record<ContractField, string>> {
  const out: Partial<Record<ContractField, string>> = {}
  const req = 'foreignContracts.form.required'
  if (!f.number.trim()) out.number = req
  if (!f.contractDate) out.contractDate = req
  if (!f.supplierName.trim()) out.supplierName = req
  if (!f.supplierCountryCode) out.supplierCountryCode = req
  if (!f.currency) out.currency = req
  if (f.amount == null || !(f.amount > 0)) out.amount = 'foreignContracts.form.amountPositive'
  if (f.contractDate && f.validUntil && f.validUntil < f.contractDate) out.validUntil = 'foreignContracts.form.beforeContract'
  if (f.contractDate && f.repatriationDeadline && f.repatriationDeadline < f.contractDate)
    out.repatriationDeadline = 'foreignContracts.form.beforeContract'
  if (!f.unkNumber.trim() && f.unkRemovalDeadline) out.unkRemovalDeadline = 'foreignContracts.form.unkFirst'
  if (!f.unkNumber.trim() && f.unkRemovedOn) out.unkRemovedOn = 'foreignContracts.form.unkFirst'
  return out
}

export function paymentErrors(f: ContractPaymentFields, today: string): Partial<Record<keyof ContractPaymentFields, string>> {
  const out: Partial<Record<keyof ContractPaymentFields, string>> = {}
  if (!f.paidOn) out.paidOn = 'foreignContracts.form.required'
  else if (f.paidOn > today) out.paidOn = 'foreignContracts.payment.notFuture'
  if (f.amount == null || !(f.amount > 0)) out.amount = 'foreignContracts.form.amountPositive'
  return out
}

/** Текст предупреждения сверки на языке интерфейса (сервер отдаёт русский — запасной). */
export function checkText(ch: ContractCheck, c: Pick<ForeignContract, 'number' | 'currency' | 'validUntil'>, t: T, locale: string): string {
  const who = ch.declarationId
    ? (ch.declarationNumber?.trim() ? t('foreignContracts.check.dt', { n: ch.declarationNumber.trim() }) : t('foreignContracts.check.dtNoNumber'))
    : t('foreignContracts.check.case')
  switch (ch.code) {
    case 'currencyDiffers':
      return t('foreignContracts.check.currencyDiffers', { who, cur: ch.currency ?? '', contract: c.number, contractCur: c.currency })
    case 'exceedsRemaining':
      return t('foreignContracts.check.exceedsRemaining', {
        who, value: money(locale, ch.valueInContractCurrency, c.currency), contract: c.number,
        remaining: money(locale, Math.max(0, ch.remaining), c.currency),
      })
    case 'afterContractEnd':
      return t('foreignContracts.check.afterContractEnd', { who, contract: c.number, end: day(c.validUntil) })
    case 'noRate':
      return t('foreignContracts.check.noRate', { who, cur: ch.currency ?? '', contractCur: c.currency, contract: c.number })
    default:
      return ch.text
  }
}

/** Подпись контракта в выпадающих списках: «№ 12 от 15.01.2026 · Supplier · USD». */
export const contractLabel = (c: Pick<ForeignContract, 'number' | 'contractDate' | 'supplierName' | 'currency'>, t: T): string =>
  `${t('foreignContracts.numberFrom', { n: c.number, date: day(c.contractDate) })} · ${c.supplierName} · ${c.currency}`

// ---- Гр.44 из контракта (ДТ) ----
export const CONTRACT_DOC_CODE = '03011'
export const UNK_DOC_CODE = '03031'
type Doc44Row = { docTypeCode?: string | null; docTypeName?: string | null; docNumber?: string | null; docDate?: string | null; appliesToAll?: boolean | null }

/**
 * «Из контракта»: гр.44 03011 (номер и дата контракта) и 03031 (УНК и дата). Строка с кодом есть — номер и дата
 * переписываются из контракта; нет — добавляется общей для всех товаров (как при создании ДТ на сервере).
 * newRow — пустая строка в форме списка (поля признака представления и т. п.). Возвращает число изменённых строк.
 */
export function applyContractToDoc44<R extends Doc44Row>(
  items: R[], c: Pick<ForeignContract, 'number' | 'contractDate' | 'unkNumber' | 'unkDate'>,
  nameOf: (code: string) => string | null, newRow: () => R,
): number {
  let changed = 0
  const put = (code: string, fallbackName: string, number: string, date: string | null) => {
    const row = items.find((x) => x.docTypeCode === code)
    if (row) {
      if (row.docNumber === number && (row.docDate ?? '').slice(0, 10) === (date ?? '')) return
      row.docNumber = number
      row.docDate = date
    } else {
      items.push({ ...newRow(), docTypeCode: code, docTypeName: nameOf(code) ?? fallbackName, docNumber: number, docDate: date, appliesToAll: true })
    }
    changed++
  }
  put(CONTRACT_DOC_CODE, 'ДОГОВОР (КОНТРАКТ)', c.number, c.contractDate)
  if (c.unkNumber?.trim()) put(UNK_DOC_CODE, 'УЧЕТНЫЙ НОМЕР КОНТРАКТА', c.unkNumber.trim(), c.unkDate)
  return changed
}
