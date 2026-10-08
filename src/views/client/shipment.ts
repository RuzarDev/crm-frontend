import type { ClientShipment } from '@/api/clientShipments'
import type { Import40CaseDto, Import40FileDto } from '@/api/import40'
import type { ZTone } from '@/components/z/ZTag.vue'
import { stepForStatus } from '@/utils/import40Steps'

// Правила поставки клиента (редизайн, волна 2a): чей ход, вкладка списка, тег, полоса этапов.
// Одни на «Главную», список «Мои поставки» и карточку — чтобы экраны не расходились.

export type ShipmentTab = 'active' | 'waiting' | 'drafts' | 'done'
export type AskKind = 'problem' | 'returned' | 'draft' | 'paySvh'

export const TOTAL_STEPS = 6

/** Что известно экрану сверх лёгкой строки. filesUnknown — файлы поставки не загрузились (карточка): загружен ли чек, неизвестно. */
export type ShipmentCtx = { filesUnknown?: boolean }

/**
 * «Нужно от вас» — ход клиента: проблема (вопрос AQNIET), черновик (возврат на доработку — черновик с причиной),
 * счёт СВХ без загруженного чека. Загруженный чек — уже не ход клиента (ждём подтверждения), даже пока оплату
 * не подтвердили; выполненная и отменённая поставка не спрашивает ничего. Без файлов (filesUnknown) про чек не гадаем.
 */
export function askFor(s: ClientShipment, ctx: ShipmentCtx = {}): AskKind | null {
  if (s.status === 8 || s.status === 9) return null
  if (s.isProblem) return 'problem'
  if (s.status === 0) return s.returnReason ? 'returned' : 'draft'
  if (s.status === 6 && !s.paymentCheckUploaded && !ctx.filesUnknown) return 'paySvh'
  return null
}

export function tabOf(s: ClientShipment): ShipmentTab {
  if (s.status === 8 || s.status === 9) return 'done'
  if (s.status === 0 && !s.isProblem && !s.returnReason) return 'drafts'
  return askFor(s) ? 'waiting' : 'active'
}

/** Тег в словаре клиента (ключ client.tag.*) и тон. */
export function shipmentTag(s: ClientShipment, ctx: ShipmentCtx = {}): { key: string; tone: ZTone } {
  if (s.status === 9) return { key: 'cancelled', tone: 'neutral' }
  if (s.status === 8) return { key: 'done', tone: 'done' }
  const ask = askFor(s, ctx)
  if (ask === 'problem') return { key: 'needDoc', tone: 'danger' }
  if (ask === 'returned') return { key: 'returned', tone: 'wait' }
  if (ask === 'draft') return { key: 'draft', tone: 'neutral' }
  if (ask === 'paySvh') return { key: 'paySvh', tone: 'wait' }
  // Файлы не загрузились — ни «Ждём оплату склада», ни «Чек на проверке»: нейтральное «Оформляем».
  if (s.status === 6 && ctx.filesUnknown) return { key: 'processing', tone: 'neutral' }
  if (s.status === 6) return { key: 'checkReview', tone: 'pay' } // чек загружен, ждём подтверждения
  if (s.status === 7) return { key: 'payService', tone: 'pay' }
  if (s.status >= 4) return { key: 'released', tone: 'done' }
  if (s.status === 1) return { key: 'inTransit', tone: 'info' }
  return { key: 'processing', tone: 'info' }
}

/**
 * Состояние сегментов полосы этапов (6 шт.): done / current / todo; current получает тон: gold, если ход клиента,
 * иначе accent; у проблемной — danger. Выполненная — все пройдены; отменённая — все впереди (этапы не пройдены).
 */
export type SegState = 'done' | 'current' | 'currentAsk' | 'currentProblem' | 'todo'
export function segments(s: ClientShipment, ctx: ShipmentCtx = {}): SegState[] {
  if (s.status === 9) return Array<SegState>(TOTAL_STEPS).fill('todo')
  const step = s.status === 8 ? TOTAL_STEPS + 1 : s.step || 1
  return Array.from({ length: TOTAL_STEPS }, (_, i) => {
    if (i + 1 < step) return 'done'
    if (i + 1 > step) return 'todo'
    return s.isProblem ? 'currentProblem' : askFor(s, ctx) ? 'currentAsk' : 'current'
  })
}

export const tabCounts = (list: ClientShipment[]): Record<ShipmentTab, number> =>
  list.reduce((acc, s) => { acc[tabOf(s)] += 1; return acc }, { active: 0, waiting: 0, drafts: 0, done: 0 } as Record<ShipmentTab, number>)

/** Текущий этап 1..6 для подписи (сервер присылает step; на всякий случай зажимаем в диапазон). */
export const stepNo = (s: ClientShipment): number => Math.min(TOTAL_STEPS, Math.max(1, s.step || 1))

/** Куда ведёт поставка из списка: неотправленный черновик дописывается в мастере, остальное — карточка. */
export const shipmentHref = (s: ClientShipment): string =>
  tabOf(s) === 'drafts' ? `/import-40/new/${s.id}` : `/import-40/${s.id}`

/**
 * Куда ведёт строка «Нужно от вас»: черновик и возврат на доработку дописываются в мастере (причину возврата
 * мастер показывает сверху), остальное — включая черновик с вопросом AQNIET — карточка.
 */
export const askHref = (s: ClientShipment): string => {
  const ask = askFor(s)
  return ask === 'draft' || ask === 'returned' ? `/import-40/new/${s.id}` : `/import-40/${s.id}`
}

/**
 * Лёгкая сводка из полной заявки (карточка поставки): те же поля, что отдаёт GET import40/client/shipments,
 * чтобы askFor/shipmentTag/segments карточки совпадали со списком. Шаг — как Import40Steps.StepOf на сервере
 * (выполнена/отменена — 0); чек «загружен», если в разделе payment-check есть файл.
 */
export function toShipmentSummary(c: Import40CaseDto, files: Pick<Import40FileDto, 'section'>[]): ClientShipment {
  return {
    id: c.id,
    number: c.number,
    cargo: c.cargo ?? '',
    post: c.post ?? '',
    status: c.status,
    step: c.status >= 8 ? 0 : stepForStatus(c.status),
    isProblem: !!c.isProblem,
    problemClientMessage: c.problemClientMessage ?? '',
    returnReason: c.returnReason ?? '',
    senderCountryCode: c.clientSenderCountryCode ?? '',
    estimatedValue: c.clientEstimatedValue ?? null,
    currencyCode: c.clientCurrencyCode ?? '',
    svhInvoiceAmount: c.svhInvoiceAmount ?? null,
    svhInvoiceNumber: c.svhInvoiceNumber ?? '',
    paymentCheckUploaded: files.some((f) => f.section === 'payment-check'),
    paymentConfirmed: !!c.paymentConfirmed,
    declarationsCount: c.declarations?.length ?? 0,
    assignedDeclarantName: c.assignedDeclarantName ?? null,
    createdAtUtc: c.createdAtUtc,
    updatedAtUtc: c.updatedAtUtc,
  }
}
