import apiClient from './client'
import { i18n } from '@/i18n'

// Документы по ДТ в Word (23.10.2026): уведомление по Решению Совета ЕЭК № 130 (п. 6 Порядка, гр. 44 — 01416) и
// обязательство при условном выпуске. Сервер строит .docx по СОХРАНЁННОЙ ДТ (страница сохраняет перед открытием окна),
// право — CanManageDeclarations. Выбор товаров и буквы подпунктов сервер не хранит (первая версия).
// Ответ — файл; 400 — { error, code } (пустой список, чужой sortOrder, неизвестная буква): validateStatus пропускает 400
// мимо общего перехватчика, текст разбираем из Blob сами (как downloadKedenXml).

/** Буквы подпунктов п. 6 Порядка (Решение 130): кириллица, «й» нет. */
export const NOTICE130_SUBITEMS = ['а', 'б', 'в', 'г', 'д', 'е', 'ж', 'з', 'и', 'к', 'л'] as const
export type Notice130Subitem = (typeof NOTICE130_SUBITEMS)[number]

/** Подписант и реквизиты документа; даты — 'YYYY-MM-DD'. */
interface DtFormHead {
  number: string | null
  date: string
  signerPosition: string | null
  signerName: string | null
}

export interface Notice130Request extends DtFormHead {
  /** sortOrder — номер товара ДТ по SortOrder сервера (с 0, как vtoGoodSortOrders разделения): id товаров при PUT меняются. */
  items: { sortOrder: number; subitem: Notice130Subitem | null }[]
}

export interface ObligationRequest extends DtFormHead {
  /** Срок представления, 'YYYY-MM-DD'. */
  deadline: string
  /** Что представить (фраза «Представить …»), до 300 знаков. */
  documentKind: string
  items: { sortOrder: number }[]
}

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

export const dtFormsApi = {
  notice130: (caseId: string, dtId: string, body: Notice130Request): Promise<DtFormResult> =>
    post(`${base(caseId, dtId)}/notice-130`, body),
  obligation: (caseId: string, dtId: string, body: ObligationRequest): Promise<DtFormResult> =>
    post(`${base(caseId, dtId)}/conditional-release/obligation`, body),
}
