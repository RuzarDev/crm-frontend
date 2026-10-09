import type { Import40DeclarationDto, Import40DeclarationUpsert, Import40ExtractionPreview } from '@/api/import40'
import type { CaseStepMode } from './caseContext'

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
 * Тег разделения ЕТТ/ВТО (прежние splitTagLabel/Color/Tooltip): заменённая — «Разделена» (приглушена);
 * дочерние — по splitRole; без splitRole, но rateType EATT — «ВТО»; обычная ДТ — без тега.
 */
export interface SplitTag { label: string; tone: 'neutral' | 'submitted' | 'info'; tip: string }
export function splitTag(
  dt: Pick<Import40DeclarationDto, 'isSplitReplaced' | 'splitRole' | 'rateType' | 'splitSourceDeclarationId'>,
  all: Pick<Import40DeclarationDto, 'id' | 'declarationNumber'>[],
  t: T,
): SplitTag | null {
  if (dt.isSplitReplaced) return { label: t('import40Case.splitReplaced'), tone: 'neutral', tip: t('import40Case.splitReplacedTooltip') }
  const label = dt.splitRole === 'VTO' ? 'ВТО' : dt.splitRole === 'ETT' ? 'ЕТТ' : !dt.splitRole && dt.rateType === 'EATT' ? 'ВТО' : null
  if (!label) return null
  let tip = ''
  if (dt.splitSourceDeclarationId) {
    const source = all.find((d) => d.id === dt.splitSourceDeclarationId)
    tip = t('import40Case.splitTooltip', { num: source?.declarationNumber || dt.splitSourceDeclarationId })
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
        tradeMarkName: g.tradeMarkName ?? null,
        productMarkName: g.productMarkName ?? null,
        manufacturerName: g.manufacturerName ?? null,
      }))
    : undefined,
})
