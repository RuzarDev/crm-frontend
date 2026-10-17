import type { ZTone } from '@/components/z/ZTag.vue'
import type { ExpeditorContract, ExpeditorShipment } from '@/api/expeditorImport40'
import { matchesQuery } from '@/views/broker/list'

// Экран логиста «Импорт 40 клиентов» (17.10): фильтры и подписи — отдельно от разметки, чтобы проверять тестами.
export type ShipmentFilter = 'active' | 'done' | 'all'

/** В работе — до выполнения (0–7); выполненные и отменённые — «Завершённые». */
export const isFinished = (status: number): boolean => status >= 8

export function filterShipments(list: readonly ExpeditorShipment[], filter: ShipmentFilter, query: string): ExpeditorShipment[] {
  return list.filter((s) =>
    (filter === 'all' || (filter === 'done') === isFinished(s.status))
    && matchesQuery(query, [s.number, s.clientName, s.cargo, s.post, ...s.declarationNumbers]))
}

export const filterCounts = (list: readonly ExpeditorShipment[]): Record<ShipmentFilter, number> => ({
  active: list.filter((s) => !isFinished(s.status)).length,
  done: list.filter((s) => isFinished(s.status)).length,
  all: list.length,
})

/** Тон статуса груза: таможня ждёт ответа — внимание; выпущена и дальше — готово; отменена — нейтрально. */
export function shipmentTone(s: Pick<ExpeditorShipment, 'status' | 'customsRequestOpen'>): ZTone {
  if (s.status === 9) return 'neutral'
  if (s.customsRequestOpen) return 'danger'
  if (s.status >= 4) return 'done'
  return 'wait'
}

export type ContractState = 'none' | 'draft' | 'awaiting' | 'active' | 'expired' | 'revoked'

/** Состояние договора: отозван / истёк (статусом или сроком) / действует / ждёт подписи / черновик / нет. */
export function contractState(c: ExpeditorContract | null, now: Date = new Date()): ContractState {
  if (!c) return 'none'
  if (c.status === 4) return 'revoked'
  if (c.status === 3 || (c.validUntilUtc && new Date(c.validUntilUtc).getTime() < now.getTime())) return 'expired'
  if (c.status === 2) return 'active'
  if (c.status === 1) return 'awaiting'
  return 'draft'
}

export const CONTRACT_TONE: Record<ContractState, ZTone> = {
  none: 'neutral', draft: 'neutral', awaiting: 'wait', active: 'done', expired: 'neutral', revoked: 'danger',
}
