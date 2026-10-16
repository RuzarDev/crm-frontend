import type { Import40SplitPartVersion, Import40SplitState } from '@/api/import40'

// «Изменить разделение» исходной ДТ (решение владельца 16.10.2026): что сохранится, что пропадёт или вернётся при замене
// частей ЕТТ/ВТО. Правила переноса — на сервере (Import40SplitPlan); здесь только тексты для окна и подтверждения.

type T = (k: string, p?: Record<string, unknown>) => string
type Part = Import40SplitState['parts'][number]

/** Номера товаров для людей: SortOrder с нуля → «1, 3». */
const nums = (orders: readonly number[]) => [...orders].sort((a, b) => a - b).map((o) => o + 1).join(', ')

const roleOf = (p: Part) => (p.role ?? '').toUpperCase()
const roleLabel = (r: string | null) => ((r ?? '').toUpperCase() === 'ETT' ? 'ЕТТ' : (r ?? '').toUpperCase() === 'VTO' ? 'ВТО' : 'ДТ')

/** «ЕТТ 12345…» / «ВТО без номера» — часть для людей. */
export const splitPartLabel = (p: Part, t: T): string => `${roleLabel(p.role)} ${p.declarationNumber || t('broker.dt.banners.noNumber')}`

/**
 * Несколько частей одной роли (ЕТТ или ВТО) — исходную ДТ до 16.10 разделили больше одного раза. Какую пару оставить,
 * решает РОП: замена удалила бы «лишние» части вместе с номером, гр.54 и гр.В (сервер тоже отвечает 409).
 */
export function splitDuplicateRoles(state: Import40SplitState): boolean {
  const ett = state.parts.filter((p) => roleOf(p) === 'ETT').length
  const vto = state.parts.filter((p) => roleOf(p) === 'VTO').length
  return ett > 1 || vto > 1
}

/** Отметки частей для POST split: сервер сверит, что части не менялись с открытия окна. */
export const splitPartVersions = (state: Import40SplitState): Import40SplitPartVersion[] =>
  state.parts.map((p) => ({ id: p.id, updatedAtUtc: p.updatedAtUtc }))

/** Отмечены те же товары, что сейчас в ВТО, и замена ничего не вернёт и не потеряет — менять нечего. */
export function splitUnchanged(state: Import40SplitState, selected: readonly number[]): boolean {
  const cur = new Set(state.vtoSortOrders)
  return state.goodsCarryOver
    && !state.addedGoods.length
    && !state.returnedSortOrders.length
    && selected.length === cur.size
    && selected.every((s) => cur.has(s))
}

/**
 * Строки «что изменится» для выбора ВТО <paramref name="selected"/> (SortOrder исходной ДТ) из <paramref name="goodsCount"/>
 * товаров. <paramref name="names"/> — наименования товаров исходной ДТ по SortOrder (для списка «перейдут ЕТТ↔ВТО»).
 */
export function splitChangeNotes(
  state: Import40SplitState,
  selected: readonly number[],
  goodsCount: number,
  t: T,
  names: ReadonlyMap<number, string | null | undefined> = new Map(),
): string[] {
  const notes = [t(state.goodsCarryOver ? 'broker.dt.split.changeKept' : 'broker.dt.split.changeKeptLegacy')]
  // Старое разделение: какие товары сейчас в ВТО, сервер угадал по коду и наименованию — отметки нужно проверить.
  if (!state.goodsCarryOver) notes.push(t('broker.dt.split.changeGuessed'))
  const sel = new Set(selected)
  const wasVto = new Set(state.vtoSortOrders)
  const needsEtt = selected.length < goodsCount

  // Части: ЕТТ и ВТО переиспользуются (несколько частей одной роли — запрет, см. splitDuplicateRoles); ненужная ЕТТ удаляется.
  const firstEtt = state.parts.find((p) => roleOf(p) === 'ETT')
  const firstVto = state.parts.find((p) => roleOf(p) === 'VTO')
  const removed = new Set(state.parts.filter((p) => !((p === firstEtt && needsEtt) || p === firstVto)))
  for (const p of removed) notes.push(t('broker.dt.split.changeRemovePart', { label: splitPartLabel(p, t) }))
  if (needsEtt && !firstEtt) notes.push(t('broker.dt.split.changeNewPart', { role: 'ЕТТ' }))
  if (!firstVto) notes.push(t('broker.dt.split.changeNewPart', { role: 'ВТО' }))

  // Какие товары меняют часть: «№ 2 «Наименование»».
  const goods = (orders: number[]) => orders.sort((a, b) => a - b).map((o) => {
    const name = names.get(o)?.trim()
    return name ? t('broker.dt.split.changeGoodsItem', { n: o + 1, name }) : `№ ${o + 1}`
  }).join(', ')
  // Вернувшиеся из исходной ДТ (их не было ни в одной части) — не «переход», они перечислены в «Вернутся…».
  const returned = new Set(state.returnedSortOrders)
  const toVto = [...sel].filter((s) => !wasVto.has(s) && !returned.has(s))
  const toEtt = [...wasVto].filter((s) => !sel.has(s))
  if (toVto.length) notes.push(t('broker.dt.split.changeToVto', { list: goods(toVto) }))
  if (toEtt.length) notes.push(t('broker.dt.split.changeToEtt', { list: goods(toEtt) }))

  notes.push(t('broker.dt.split.changePayments'))
  // Часть уже в КЕДЕН: остающаяся — сброс EDocId, следующий XML создаст новый черновик, старый (прежний состав) останется
  // там; удаляемая — XML у неё больше не будет, её черновик в КЕДЕН удаляют вручную.
  for (const p of state.parts.filter((x) => x.uploadedToKeden)) {
    notes.push(t(removed.has(p) ? 'broker.dt.split.changeKedenRemoved' : 'broker.dt.split.changeKeden', { label: splitPartLabel(p, t) }))
  }
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
