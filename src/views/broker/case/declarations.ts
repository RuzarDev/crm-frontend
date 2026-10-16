import type { Import40DeclarationDto, Import40DeclarationUpsert, Import40ExtractionPreview } from '@/api/import40'
import type { CaseStepMode } from './caseContext'
import { rowsFromLegacy } from '@/views/broker/dt/goods/editor/characteristics'

// Список ДТ на шаге 3 карточки заявки (редизайн, волна 4а).

/**
 * Действия над списком ДТ («Добавить ДТ», «Из документов», «Импорт из КП», пакетная выгрузка):
 * только пока шаг 3 текущий — декларирование (статус 2) или ДТ подана (статус 3).
 * Удаление ДТ — отдельное правило (casePermissions.canDeleteCaseDt): с выпуска — только администратор.
 */
export const dtListActive = (status: number, mode: CaseStepMode): boolean =>
  mode === 'current' && (status === 2 || status === 3)

/**
 * «Заполнить» и «XML для КЕДЕН» в строке ДТ: на текущем шаге 3 — всегда (без права — выключены с подсказкой);
 * после него — тем, кто может править ДТ (perms.canEditDt: админ, РОП, назначенный декларант — решение владельца
 * 09.10: правка после выпуска разрешена, как на сервере). Остальным — «Открыть».
 */
export const dtRowActions = (status: number, mode: CaseStepMode, canEdit: boolean): boolean =>
  dtListActive(status, mode) || (canEdit && status >= 2)

type T = (k: string, p?: Record<string, unknown>) => string

/** Страница ДТ. */
export const dtPath = (caseId: string, dtId: string): string => `/import-40/${caseId}/dt/${dtId}`

/** Поиск ДТ по номеру (прежний dtSearch: по вхождению, без учёта регистра). */
export function filterDeclarations<D extends { declarationNumber?: string | null }>(list: D[], query: string): D[] {
  const q = query.trim().toLowerCase()
  if (!q) return list
  return list.filter((d) => (d.declarationNumber || '').toLowerCase().includes(q))
}

/**
 * Роль строки в списке ДТ (решение владельца 16.10.2026): исходная ДТ разделения — «Исходная ДТ (все товары)», её части
 * ЕТТ/ВТО — под ней со сдвигом; часть, которую до 16.10 разделили ещё раз, — тоже часть (со своими частями ниже), а не
 * «Разделена».
 */
export type DtRowKind = 'plain' | 'source' | 'part'
type SplitFields = Pick<Import40DeclarationDto, 'id' | 'splitRole' | 'splitSourceDeclarationId'>
export interface DtListRow<D> {
  dt: D
  /** Глубина вложенности: 0 — исходная или обычная ДТ, 1 — её часть, 2 — часть повторного разделения. */
  depth: number
  kind: DtRowKind
  /** Частей разделения у этой ДТ (у исходной; у повторно разделённой части — её части). */
  parts: number
  /** Часть, у которой есть свои части (старая цепочка). */
  resplit: boolean
  /** Часть, исходной ДТ которой нет в списке (удалили до запрета 16.10). */
  orphan: boolean
}

const roleRank = (role?: string | null) => ((role ?? '').toUpperCase() === 'ETT' ? 0 : (role ?? '').toUpperCase() === 'VTO' ? 1 : 2)

/**
 * Список ДТ группами: обычные ДТ и исходные — в своём порядке, части исходной — сразу под ней (ЕТТ, затем ВТО), части
 * частей — под частью. Часть без исходной в списке — сама по себе (orphan). Порядок внутри — как в исходном списке.
 */
export function groupDeclarations<D extends SplitFields>(list: readonly D[]): DtListRow<D>[] {
  const byId = new Set(list.map((d) => d.id))
  const children = new Map<string, D[]>()
  for (const d of list) {
    const parent = d.splitSourceDeclarationId
    if (parent && byId.has(parent) && parent !== d.id) children.set(parent, [...(children.get(parent) ?? []), d])
  }
  for (const [k, v] of children) children.set(k, [...v].sort((a, b) => roleRank(a.splitRole) - roleRank(b.splitRole)))
  const rows: DtListRow<D>[] = []
  const seen = new Set<string>()
  const walk = (d: D, depth: number) => {
    if (seen.has(d.id)) return
    seen.add(d.id)
    const kids = children.get(d.id) ?? []
    const isPart = !!d.splitSourceDeclarationId
    rows.push({
      dt: d,
      depth,
      kind: isPart ? 'part' : kids.length ? 'source' : 'plain',
      parts: kids.length,
      resplit: isPart && kids.length > 0,
      orphan: isPart && !byId.has(d.splitSourceDeclarationId!),
    })
    for (const k of kids) walk(k, depth + 1)
  }
  for (const d of list) {
    const parent = d.splitSourceDeclarationId
    if (!parent || !byId.has(parent) || parent === d.id) walk(d, 0)
  }
  for (const d of list) walk(d, 0) // цикл в данных — не терять строки
  return rows
}

/** У ДТ есть части разделения — исходную ДТ не удалить, пока они есть (сервер отвечает 409). */
export const hasSplitParts = (dt: Pick<Import40DeclarationDto, 'id'>, all: readonly Pick<Import40DeclarationDto, 'splitSourceDeclarationId'>[]): boolean =>
  all.some((d) => d.splitSourceDeclarationId === dt.id)

/**
 * Тег строки: исходная ДТ разделения — «Исходная ДТ» с подсказкой (только просмотр, печать, Excel); часть — «ЕТТ»/«ВТО»
 * по splitRole (без splitRole, но rateType EATT — «ВТО»), в подсказке — от какой ДТ (или что исходная удалена);
 * обычная ДТ — без тега.
 */
export interface SplitTag { label: string; tone: 'neutral' | 'submitted' | 'info'; tip: string }
export function splitTag(
  dt: Pick<Import40DeclarationDto, 'id' | 'splitRole' | 'rateType' | 'splitSourceDeclarationId'>,
  all: Pick<Import40DeclarationDto, 'id' | 'declarationNumber' | 'splitSourceDeclarationId'>[],
  t: T,
): SplitTag | null {
  if (!dt.splitSourceDeclarationId && hasSplitParts(dt, all)) {
    return { label: t('import40Case.splitSource'), tone: 'neutral', tip: t('import40Case.splitSourceTooltip') }
  }
  const role = (dt.splitRole ?? '').toUpperCase()
  const label = role === 'VTO' ? 'ВТО' : role === 'ETT' ? 'ЕТТ' : !dt.splitRole && (dt.rateType ?? '').toUpperCase() === 'EATT' ? 'ВТО' : null
  if (!label) return null
  let tip = ''
  if (dt.splitSourceDeclarationId) {
    const i = all.findIndex((d) => d.id === dt.splitSourceDeclarationId)
    tip = i < 0
      ? t('import40Case.splitOrphanTooltip')
      : t('import40Case.splitTooltip', { num: all[i].declarationNumber || t('import40Case.dtFallback', { n: i + 1 }) })
  }
  return { label, tone: label === 'ВТО' ? 'submitted' : 'info', tip }
}

/** «не хватает: …» — первые n пунктов и сколько осталось. */
export const missingPreview = (missing: string[], n = 3): { shown: string[]; rest: number } =>
  ({ shown: missing.slice(0, n), rest: Math.max(0, missing.length - n) })

/** Предпросмотр извлечения из пакета документов → тело создания ДТ (как прежний previewToUpsert карточки). */
export const previewToUpsert = (preview: Import40ExtractionPreview): Import40DeclarationUpsert => ({
  declarationNumber: preview.declarationNumber ?? null,
  corridor: preview.corridor ?? null,
  procedureCode: preview.procedureCode ?? null,
  sender: preview.sender ?? null,
  receiver: preview.receiver ?? null,
  departureCountryCode: preview.departureCountryCode ?? null,
  destinationCountryCode: preview.destinationCountryCode ?? null,
  incoterms: preview.incoterms ?? null,
  incotermsPlace: preview.incotermsPlace ?? null,
  originCountryCode: preview.originCountryCode ?? null,
  currency: preview.currency ?? null,
  totalInvoiceValue: preview.totalInvoiceValue ?? null,
  exchangeRate: preview.exchangeRate ?? null,
  borderTransportNumbers: preview.borderTransportNumbers?.length ? preview.borderTransportNumbers : undefined,
  arrivalTransportNumbers: preview.arrivalTransportNumbers?.length ? preview.arrivalTransportNumbers : undefined,
  goodsItems: preview.goodsItems?.length
    ? preview.goodsItems.map((g) => ({
        description: g.description ?? null,
        tnvedCode: g.tnvedCode ?? null,
        tnvedDescription: null,
        countryOfOrigin: g.countryOfOrigin ?? null,
        quantity: g.quantity ?? null,
        unit: null,
        unitCode: null,
        grossWeightKg: g.grossWeightKg ?? null,
        netWeightKg: g.netWeightKg ?? null,
        packagesCount: g.packagesCount ?? null,
        quantityTypeCode: null,
        invoiceValue: g.invoiceValue ?? null,
        currency: g.currency ?? null,
        // Распознанные марка, знак и производитель — в строку 1 характеристик гр. 31; количество и стоимость строка берёт
        // у товара (гр. 41 / гр. 42), копию не пишем.
        characteristics: rowsFromLegacy({
          tradeMarkName: g.tradeMarkName, productMarkName: g.productMarkName, manufacturerName: g.manufacturerName,
        }),
      }))
    : undefined,
})
