import type { ZTone } from '@/components/z/ZTag.vue'
import type {
  CargoInsurance, CargoInsuranceFields, Carrier, CarrierFields, CarrierInvoice, CarrierInvoiceFields,
} from '@/api/carriers'
import type { RegistryStatus } from '@/api/clientRegistry'
import { matchesQuery } from '@/views/broker/list'

// Чистая логика перевозчиков клиента (очередь 4, задача 2): формы, проверки (как на сервере), поиск, итоги счетов.

/** Казахстан в ОКСМ: для него рег. номер — БИН/ИИН из 12 цифр. */
export const KZ_CODE = '398'

export const CONTRACT_TONE: Record<RegistryStatus, ZTone> = {
  active: 'done',
  expiring: 'wait',
  expired: 'danger',
  unlimited: 'neutral',
}

export const emptyCarrier = (): CarrierFields => ({
  name: '',
  countryCode: null,
  regNumber: '',
  contactName: '',
  phone: '',
  email: '',
  address: '',
  contractDocumentId: null,
  note: '',
})

export const carrierFieldsOf = (c: Carrier): CarrierFields => ({
  name: c.name,
  countryCode: c.countryCode,
  regNumber: c.regNumber ?? '',
  contactName: c.contactName ?? '',
  phone: c.phone ?? '',
  email: c.email ?? '',
  address: c.address ?? '',
  contractDocumentId: c.contractDocument?.id ?? null,
  note: c.note ?? '',
})

export type CarrierField = keyof CarrierFields

/** Ошибки формы перевозчика — ключи i18n. */
export function carrierErrors(f: CarrierFields): Partial<Record<CarrierField, string>> {
  const out: Partial<Record<CarrierField, string>> = {}
  if (!f.name.trim()) out.name = 'carriers.form.required'
  if (!f.countryCode) out.countryCode = 'carriers.form.required'
  const reg = f.regNumber.trim()
  if (reg && f.countryCode === KZ_CODE && !/^\d{12}$/.test(reg)) out.regNumber = 'carriers.form.binFormat'
  const email = f.email.trim()
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) out.email = 'carriers.form.emailFormat'
  return out
}

export const emptyInvoice = (caseId: string | null = null): CarrierInvoiceFields => ({
  number: '',
  invoiceDate: null,
  amount: null,
  currency: null,
  isPaid: false,
  paidOn: null,
  caseId,
  note: '',
})

export const invoiceFieldsOf = (i: CarrierInvoice): CarrierInvoiceFields => ({
  number: i.number,
  invoiceDate: i.invoiceDate,
  amount: i.amount,
  currency: i.currency,
  isPaid: i.isPaid,
  paidOn: i.paidOn,
  caseId: i.caseId,
  note: i.note ?? '',
})

export type InvoiceField = keyof CarrierInvoiceFields

/** Ошибки формы счёта — ключи i18n. today — 'YYYY-MM-DD' по Казахстану. */
export function invoiceErrors(f: CarrierInvoiceFields, today: string): Partial<Record<InvoiceField, string>> {
  const out: Partial<Record<InvoiceField, string>> = {}
  if (!f.number.trim()) out.number = 'carriers.form.required'
  if (!f.invoiceDate) out.invoiceDate = 'carriers.form.required'
  else if (f.invoiceDate > today) out.invoiceDate = 'carriers.form.notFuture'
  if (f.amount == null || !(f.amount > 0)) out.amount = 'carriers.form.amountPositive'
  if (!f.currency) out.currency = 'carriers.form.required'
  if (f.isPaid && f.paidOn && f.paidOn > today) out.paidOn = 'carriers.form.notFuture'
  return out
}

export const filterCarriers = (list: Carrier[], q: string): Carrier[] =>
  q.trim() ? list.filter((c) => matchesQuery(q, [c.name, c.regNumber, c.contactName, c.phone, c.email])) : list

/** Сумма счетов в тенге (без счетов без курса) и сколько без курса; неоплаченные — отдельно. */
export function invoiceTotals(list: CarrierInvoice[]): { totalKzt: number; unpaidKzt: number; noRate: number } {
  let totalKzt = 0
  let unpaidKzt = 0
  let noRate = 0
  for (const i of list) {
    if (i.amountKzt == null) { noRate++; continue }
    totalKzt += i.amountKzt
    if (!i.isPaid) unpaidKzt += i.amountKzt
  }
  return { totalKzt: Math.round(totalKzt * 100) / 100, unpaidKzt: Math.round(unpaidKzt * 100) / 100, noRate }
}

export const emptyInsurance = (): CargoInsuranceFields => ({
  insurer: '', policyNumber: '', insuredAmount: null, insuredCurrency: null, premiumAmount: null, premiumCurrency: null,
})

export const insuranceFieldsOf = (x: CargoInsurance): CargoInsuranceFields => ({
  insurer: x.insurer ?? '',
  policyNumber: x.policyNumber ?? '',
  insuredAmount: x.insuredAmount,
  insuredCurrency: x.insuredCurrency,
  premiumAmount: x.premiumAmount,
  premiumCurrency: x.premiumCurrency,
})

/** Сумма указана — нужна валюта. */
export function insuranceErrors(f: CargoInsuranceFields): Partial<Record<keyof CargoInsuranceFields, string>> {
  const out: Partial<Record<keyof CargoInsuranceFields, string>> = {}
  if (f.insuredAmount != null && f.insuredAmount < 0) out.insuredAmount = 'carriers.form.amountPositive'
  if (f.premiumAmount != null && f.premiumAmount < 0) out.premiumAmount = 'carriers.form.amountPositive'
  if (f.insuredAmount != null && !f.insuredCurrency) out.insuredCurrency = 'carriers.form.required'
  if (f.premiumAmount != null && !f.premiumCurrency) out.premiumCurrency = 'carriers.form.required'
  return out
}

export const hasInsurance = (x: CargoInsurance | null): boolean =>
  !!x && !!(x.insurer || x.policyNumber || x.insuredAmount != null || x.premiumAmount != null || x.file)
