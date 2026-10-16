import type { Import40SplitState } from '@/api/import40'

// «Изменить разделение» исходной ДТ (решение владельца 16.10.2026): что сохранится, что пропадёт или вернётся при замене
// частей ЕТТ/ВТО. Правила переноса — на сервере (Import40SplitPlan); здесь только тексты для окна и подтверждения.

type T = (k: string, p?: Record<string, unknown>) => string

/** Номера товаров для людей: SortOrder с нуля → «1, 3». */
const nums = (orders: readonly number[]) => [...orders].sort((a, b) => a - b).map((o) => o + 1).join(', ')

/** Отмечены те же товары, что сейчас в ВТО, и замена ничего не вернёт и не потеряет — менять нечего. */
export function splitUnchanged(state: Import40SplitState, selected: readonly number[]): boolean {
  const cur = new Set(state.vtoSortOrders)
  return state.goodsCarryOver
    && !state.addedGoods.length
    && !state.returnedSortOrders.length
    && selected.length === cur.size
    && selected.every((s) => cur.has(s))
}

/** Строки «что изменится» для выбора ВТО <paramref name="selected"/> (SortOrder исходной ДТ) из <paramref name="goodsCount"/> товаров. */
export function splitChangeNotes(state: Import40SplitState, selected: readonly number[], goodsCount: number, t: T): string[] {
  const notes = [t(state.goodsCarryOver ? 'broker.dt.split.changeKept' : 'broker.dt.split.changeKeptLegacy')]
  const sel = new Set(selected)
  const wasVto = new Set(state.vtoSortOrders)
  const needsEtt = selected.length < goodsCount
  const role = (r: string | null) => ((r ?? '').toUpperCase() === 'ETT' ? 'ЕТТ' : (r ?? '').toUpperCase() === 'VTO' ? 'ВТО' : 'ДТ')
  const label = (p: Import40SplitState['parts'][number]) => `${role(p.role)} ${p.declarationNumber || t('broker.dt.banners.noNumber')}`

  // Части: первая ЕТТ и первая ВТО переиспользуются, лишние (старые двойные разделения) и ненужная ЕТТ — удаляются.
  const firstEtt = state.parts.find((p) => (p.role ?? '').toUpperCase() === 'ETT')
  const firstVto = state.parts.find((p) => (p.role ?? '').toUpperCase() === 'VTO')
  for (const p of state.parts) {
    const kept = (p === firstEtt && needsEtt) || p === firstVto
    if (!kept) notes.push(t('broker.dt.split.changeRemovePart', { label: label(p) }))
  }
  if (needsEtt && !firstEtt) notes.push(t('broker.dt.split.changeNewPart', { role: 'ЕТТ' }))
  if (!firstVto) notes.push(t('broker.dt.split.changeNewPart', { role: 'ВТО' }))

  notes.push(t('broker.dt.split.changePayments'))
  const switching = state.manualPaymentSortOrders.filter((s) => wasVto.has(s) !== sel.has(s))
  if (switching.length) notes.push(t('broker.dt.split.changeManual', { list: nums(switching) }))
  if (state.addedGoods.length) {
    const list = state.addedGoods.map((g) => g.description || g.tnvedCode || `№ ${g.sortOrder + 1}`).join(', ')
    notes.push(t('broker.dt.split.changeAdded', { list }))
  }
  if (state.returnedSortOrders.length) notes.push(t('broker.dt.split.changeReturned', { list: nums(state.returnedSortOrders) }))
  if (state.expensesFromSource && state.goodsCarryOver) notes.push(t('broker.dt.split.changeExpenses'))
  return notes
}
