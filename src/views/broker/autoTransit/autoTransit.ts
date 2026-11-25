import type { ZTone } from '@/components/z/ZTag.vue'
import type { FilterId, TruckCard, TruckListItem } from '@/api/autoTransit'

// Чистая логика «Авто-транзита» (очередь 1, 16.11.2026): этапы, полоса этапов строки, метка состояния, «на этапе N мин»,
// следующее действие по правам карточки, фильтры списка, тексты кодов 409. Подписи — broker.autoTransit.* на трёх языках.

type Translate = (key: string, params?: Record<string, unknown>) => string

/** Семь этапов границы: 1 Документы, 2 Номер и печати, 3 Транспортный контроль, 4 Осмотр, 5 Декларация, 6 Номер ТД, 7 СВХ и оплата. */
export const STAGES = [1, 2, 3, 4, 5, 6, 7] as const

const STAGE_KEYS = ['docs', 'stamps', 'transport', 'inspection', 'declaration', 'tdNumber', 'warehouse'] as const
export const stageKey = (n: number): string => `broker.autoTransit.stage.${STAGE_KEYS[n - 1] ?? 'docs'}`

export type StageCell = 'done' | 'current' | 'warn' | 'todo'

const isReleased = (i: Pick<TruckListItem, 'status' | 'currentStage'>) => i.status === 'released' || i.currentStage == null

/**
 * Коды, которые на своём этапе есть по определению: этап 1 «ждёт документы» (no_files), 5 «ждёт декларанта»
 * (not_submitted), 6 «ждёт номер ТД» (no_td_number). Это обычное ожидание этапа, а не препятствие: подпись этапа
 * и цвет current. Препятствие — остальные известные коды (печать на инвойсе, получатель, файл ТД, чек СВХ).
 */
const EXPECTED_BLOCKERS = new Set(['no_files', 'not_submitted', 'no_td_number'])
const OBSTACLE_BLOCKERS = new Set(['party_no_recipient', 'party_no_invoice', 'no_stamped_invoice', 'no_td_file', 'no_warehouse_receipt'])
/** Код блокера — настоящее препятствие (не ожидание этапа и не неизвестный серверу фронта код). */
export const isObstacle = (code: string | null | undefined): code is string =>
  !!code && !EXPECTED_BLOCKERS.has(code) && OBSTACLE_BLOCKERS.has(code)

/** Полоса из семи делений; текущий этап с препятствием или в «Проблеме» — warn. Выпущенная — все done. */
export function stageBar(item: Pick<TruckListItem, 'status' | 'currentStage' | 'blockerCode'>): StageCell[] {
  if (isReleased(item)) return STAGES.map(() => 'done')
  const cur = item.currentStage!
  const warn = isObstacle(item.blockerCode) || item.status === 'problem'
  return STAGES.map((s) => (s < cur ? 'done' : s > cur ? 'todo' : warn ? 'warn' : 'current'))
}

/** Состояние по этапу — как в фильтрах списка: 1 ждёт документы, 2–4 на контроле, 5 декларант, 6 номер ТД, 7 СВХ. */
const STAGE_STATE: Record<number, { tone: ZTone; key: string }> = {
  1: { tone: 'wait', key: 'waitDocs' },
  2: { tone: 'info', key: 'control' },
  3: { tone: 'info', key: 'control' },
  4: { tone: 'info', key: 'control' },
  5: { tone: 'submitted', key: 'waitDeclarant' },
  6: { tone: 'submitted', key: 'waitTd' },
  7: { tone: 'pay', key: 'warehouse' },
}

/** Метка строки: архив, «Проблема», выпуск; иначе препятствие этапа (isObstacle), иначе состояние этапа. */
export function stateTag(item: Pick<TruckListItem, 'status' | 'currentStage' | 'blockerCode'>): { tone: ZTone; key: string } {
  if (item.status === 'archived') return { tone: 'neutral', key: 'broker.autoTransit.state.archived' }
  if (item.status === 'problem') return { tone: 'danger', key: 'broker.autoTransit.state.problem' }
  if (isReleased(item)) return { tone: 'done', key: 'broker.autoTransit.state.released' }
  if (isObstacle(item.blockerCode)) return { tone: 'wait', key: `broker.autoTransit.blocker.${item.blockerCode}` }
  const s = STAGE_STATE[item.currentStage!] ?? STAGE_STATE[1]!
  return { tone: s.tone, key: `broker.autoTransit.state.${s.key}` }
}

/** Заголовок строки: 2+ партий — «Консолидация · N»; одна — получатель, а без него — «Получатель не указан». */
export function rowTitle(item: Pick<TruckListItem, 'partiesCount' | 'title'>, t: Translate): string {
  if (item.partiesCount >= 2) return t('broker.autoTransit.row.consolidation', { n: item.partiesCount })
  return item.title?.trim() || t('broker.autoTransit.row.noRecipient')
}

/** Сколько машина на этапе: «15 мин», «1 ч 10 мин», «2 д 3 ч». Часы клиента спешат — не меньше 0 мин. */
export function sinceText(stageSinceUtc: string, now: Date, t: Translate): string {
  const ms = now.getTime() - new Date(stageSinceUtc).getTime()
  const totalMin = Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 60_000)) : 0
  const d = Math.floor(totalMin / 1440)
  const h = Math.floor((totalMin % 1440) / 60)
  const m = totalMin % 60
  if (d > 0) return h > 0 ? t('broker.autoTransit.since.dayHour', { d, h }) : t('broker.autoTransit.since.day', { d })
  if (h > 0) return m > 0 ? t('broker.autoTransit.since.hourMin', { h, m }) : t('broker.autoTransit.since.hour', { h })
  return t('broker.autoTransit.since.min', { m })
}

export type NextAction = { kind: 'stage'; stage: number } | { kind: 'none'; reasonKey: string }

/**
 * Что этот сотрудник может сделать с машиной сейчас (по card.can и текущему этапу). Как на сервере:
 * 1 — загрузка файлов (граница или декларант), 2–4 и 7 — отметка границы, 5 — «ТД подана» (декларант),
 * 6 — номер ТД (декларант или граница). В «Проблеме», архиве и после выпуска этапы не двигаются.
 */
export function nextAction(card: Pick<TruckCard, 'status' | 'currentStage' | 'can'>): NextAction {
  const none = (r: string): NextAction => ({ kind: 'none', reasonKey: `broker.autoTransit.wait.${r}` })
  if (card.status === 'archived') return none('archived')
  if (card.status === 'problem') return none('problem')
  if (isReleased(card)) return none('released')
  const stage = card.currentStage!
  const { border, declare } = card.can
  const ok = stage === 5 ? declare : stage === 1 || stage === 6 ? border || declare : border
  if (ok) return { kind: 'stage', stage }
  return none(stage === 5 || stage === 6 ? 'declarant' : 'border')
}

/** Фильтры списка в порядке показа (как на сервере). */
export const FILTERS: { id: FilterId; key: string }[] = (
  ['all', 'waitDocs', 'control', 'waitDeclaration', 'warehouse', 'releasedToday', 'problem'] as FilterId[]
).map((id) => ({ id, key: `broker.autoTransit.filter.${id}` }))

/** Коды 409 сервера; conflict — машину одновременно изменили: перечитать карточку и попросить повторить. */
export const ERROR_CODES = [
  'stage_order', 'td_number_missing', 'party_submitted', 'nothing_to_undo', 'problem', 'archived', 'released',
  'inspection_required', 'already_submitted', 'not_submitted', 'td_number_set', 'last_party', 'not_in_problem',
  'not_in_work', 'duplicate_plate', 'conflict', 'short_number_required',
  // ПИ (очередь 3, ревью этапа 1 M4): другая вкладка уже отметила / сняла ПИ; очистка номера у поданной ПИ / ТД.
  'pi_already_submitted', 'pi_not_submitted', 'pi_number_locked', 'short_number_locked',
] as const

export const errorKey = (code: string): string =>
  `broker.autoTransit.error.${(ERROR_CODES as readonly string[]).includes(code) ? code : 'unknown'}`
