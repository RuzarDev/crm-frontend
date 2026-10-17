import type { Import40CaseDto } from '@/api/import40'
import type { ReworkItemDto, ReworkItemInput, ReworkKind, ReworkSuggestionDto } from '@/api/import40Rework'
import { DOC_CHECKLIST } from '@/views/client/docKinds'

// Окно «Вернуть на доработку» и список пунктов в карточке (17.10): чистая логика без шаблона.

/** Галочки окна — виды чек-листа клиента (вкл. certificate); «Другое» — отдельными строками с названием. */
export const REWORK_KINDS: ReworkKind[] = DOC_CHECKLIST.map((d) => d.key)

/** Строка сверх галочек: «Другой документ» (название пишет сотрудник) или подсказка нетарифных мер (название готово). */
export interface ReworkExtraRow {
  key: string
  kind: ReworkKind
  title: string
  note: string
  /** Код ТН ВЭД подсказки; у «Другого документа» — нет. */
  code: string | null
}

export type ReworkChecks = Record<ReworkKind, { on: boolean; note: string }>

export const emptyChecks = (): ReworkChecks =>
  Object.fromEntries(REWORK_KINDS.map((k) => [k, { on: false, note: '' }])) as ReworkChecks

/** Коды ТН ВЭД товаров ДТ заявки: 10 цифр, без повторов, без исходных ДТ разделения ЕТТ/ВТО. */
export function dtCodesOf(kase: Pick<Import40CaseDto, 'declarations'> | null | undefined): string[] {
  const out: string[] = []
  for (const d of kase?.declarations ?? []) {
    if (d.isSplitReplaced) continue
    for (const g of d.goodsItems ?? []) {
      const c = (g.tnvedCode ?? '').replace(/\D/g, '')
      if (c.length === 10 && !out.includes(c)) out.push(c)
    }
  }
  return out
}

/** Коды из поля: через запятую/пробел/точку с запятой; только 10-значные, без повторов. */
export function parseCodes(text: string): string[] {
  const out: string[] = []
  for (const part of text.split(/[\s,;]+/)) {
    const c = part.replace(/\D/g, '')
    if (c.length === 10 && !out.includes(c)) out.push(c)
  }
  return out
}

/** Тело запроса: отмеченные виды (в порядке чек-листа), затем строки «Другое» и подсказок. */
export function buildItems(checks: ReworkChecks, extra: ReworkExtraRow[]): ReworkItemInput[] {
  const items: ReworkItemInput[] = REWORK_KINDS
    .filter((k) => checks[k].on)
    .map((k) => ({ kind: k, note: checks[k].note.trim() || null }))
  for (const r of extra) items.push({ kind: r.kind, title: r.title.trim(), note: r.note.trim() || null })
  return items
}

export const otherMissingTitle = (extra: ReworkExtraRow[]): boolean =>
  extra.some((r) => r.kind === 'other' && !r.title.trim())

export const suggestionAdded = (extra: ReworkExtraRow[], s: ReworkSuggestionDto): boolean =>
  extra.some((r) => r.code === s.code && r.kind === s.kind && r.title === s.title)

/** Открытые сверху, внутри — по времени возврата. */
export const sortItems = (items: ReworkItemDto[]): ReworkItemDto[] =>
  [...items].sort((a, b) => Number(!!a.resolvedAtUtc) - Number(!!b.resolvedAtUtc) || a.createdAtUtc.localeCompare(b.createdAtUtc))
