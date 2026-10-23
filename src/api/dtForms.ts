import apiClient from './client'
import { i18n } from '@/i18n'

// Документы по ДТ в Word (23.10.2026): уведомление по Решению Совета ЕЭК № 130 (п. 6 Порядка, гр. 44 — 01416) и
// обязательство при условном выпуске (письмо в ДГД по образцу декларантов, гр. 44 — 08999). Право — CanManageDeclarations.
// Уведомление сервер строит по СОХРАНЁННОЙ ДТ (страница сохраняет перед открытием окна); выбор товаров и буквы не хранит.
// Обязательство: значения по умолчанию из ДТ — GET …/obligation/defaults, окно их правит, POST рендерит ровно присланное.
// Ответ — файл; 400 — { error, code }: validateStatus пропускает 400 мимо общего перехватчика, текст разбираем из Blob
// сами (как downloadKedenXml).

/** Буквы подпунктов п. 6 Порядка (Решение 130): кириллица, «й» нет. */
export const NOTICE130_SUBITEMS = ['а', 'б', 'в', 'г', 'д', 'е', 'ж', 'з', 'и', 'к', 'л'] as const
export type Notice130Subitem = (typeof NOTICE130_SUBITEMS)[number]

/** Уведомление: даты — 'YYYY-MM-DD'. */
export interface Notice130Request {
  number: string | null
  date: string
  signerPosition: string | null
  signerName: string | null
  /** sortOrder — номер товара ДТ по SortOrder сервера (с 0, как vtoGoodSortOrders разделения): id товаров при PUT меняются. */
  items: { sortOrder: number; subitem: Notice130Subitem | null }[]
}

/** Инвойс обязательства: гр. 44 (04021, 04022, 04051) — номер и дата 'YYYY-MM-DD'. */
export interface ObligationInvoice {
  number: string | null
  date: string | null
}

/**
 * Поля обязательства (23.10.2026, образец декларантов): и значения по умолчанию (GET), и тело POST. Даты — 'YYYY-MM-DD'.
 * date — дата гр. А; number — исх. № («Б/Н»); consigneeName и address — гр. 8 (пусто — гр. 14); countryFrom — гр. 15 в
 * родительном падеже («Китая»); пост — гр. А (код и наименование без «Т/П»); warehouseName — СВХ гр. 30.
 */
export interface ObligationFields {
  date: string
  number: string | null
  consigneeName: string | null
  invoices: ObligationInvoice[]
  countryFrom: string | null
  postCode: string | null
  postName: string | null
  warehouseName: string | null
  address: string | null
  signerPosition: string | null
  signerName: string | null
}

/** Лимиты сервера (иначе 400): строки — до 500 знаков, адрес — до 1000, инвойсов — до 20. */
export const OBLIGATION_LIMITS = { text: 500, address: 1000, invoices: 20 } as const

export type DtFormResult = { blob: Blob } | { error: string; code: string | null }

const base = (caseId: string, dtId: string) =>
  `/import40/${encodeURIComponent(caseId)}/declarations/${encodeURIComponent(dtId)}`

const post = async (url: string, body: unknown): Promise<DtFormResult> => {
  const res = await apiClient.post(url, body, { responseType: 'blob', validateStatus: (s) => s === 200 || s === 400 })
  if (res.status !== 400) return { blob: res.data as Blob }
  const fallback = i18n.global.t('broker.dt.forms.failed')
  try {
    const parsed = JSON.parse(await (res.data as Blob).text()) as { error?: unknown; code?: unknown } | null
    const error = typeof parsed?.error === 'string' && parsed.error ? parsed.error : fallback
    return { error, code: typeof parsed?.code === 'string' ? parsed.code : null }
  } catch {
    return { error: fallback, code: null }
  }
}

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null)
const day = (v: unknown): string | null => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null)

/** Ответ defaults — в поля окна: нет поля (старый или неполный ответ) — пусто, даты — 'YYYY-MM-DD'. */
export function obligationFieldsFrom(raw: Partial<Record<keyof ObligationFields, unknown>> | null | undefined, today: string): ObligationFields {
  const r = raw ?? {}
  const invoices = Array.isArray(r.invoices) ? (r.invoices as { number?: unknown; date?: unknown }[]) : []
  return {
    date: day(r.date) ?? today,
    number: text(r.number),
    consigneeName: text(r.consigneeName),
    invoices: invoices.map((i) => ({ number: text(i?.number), date: day(i?.date) })),
    countryFrom: text(r.countryFrom),
    postCode: text(r.postCode),
    postName: text(r.postName),
    warehouseName: text(r.warehouseName),
    address: text(r.address),
    signerPosition: text(r.signerPosition),
    signerName: text(r.signerName),
  }
}

export const dtFormsApi = {
  notice130: (caseId: string, dtId: string, body: Notice130Request): Promise<DtFormResult> =>
    post(`${base(caseId, dtId)}/notice-130`, body),
  /** Значения по умолчанию из сохранённой ДТ; silent — окно само показывает ошибку и «Повторить». */
  obligationDefaults: async (caseId: string, dtId: string): Promise<Partial<Record<keyof ObligationFields, unknown>>> => {
    const { data } = await apiClient.get(`${base(caseId, dtId)}/conditional-release/obligation/defaults`, { silent: true })
    return (data ?? {}) as Partial<Record<keyof ObligationFields, unknown>>
  },
  obligation: (caseId: string, dtId: string, body: ObligationFields): Promise<DtFormResult> =>
    post(`${base(caseId, dtId)}/conditional-release/obligation`, body),
}
