import type { Blocker, FileKind, Party, RecipientLink, TruckCard, TruckEvent, TruckFile } from '@/api/autoTransit'
import { STAGES, isObstacle, nextAction, stageKey } from '../autoTransit'

// Чистая логика карточки машины (задача 9): права на каждое действие по card.can и статусу, ячейки этапов,
// главная кнопка, «что мешает», недостающие файлы партии, состояние ссылки получателя.
// Правила статусов: «Проблема» — этапы, «ТД подана» и номер ТД не предлагаются (данные и файлы править можно);
// «Выпущена» — только файлы, исправление номера ТД, ссылки и отмена последней отметки; «Архив» — ничего.

type Translate = (key: string, params?: Record<string, unknown>) => string
const K = 'broker.autoTransit'

export interface TruckRights {
  editTruck: boolean
  editParty: boolean
  addParty: boolean
  deleteParty: boolean
  submit: boolean
  /** «ТД подана» до этапа 5 — видна, но выключена с подсказкой. */
  submitLocked: boolean
  td: boolean
  upload: boolean
  patchFile: boolean
  deleteFile: boolean
  links: boolean
  undo: boolean
  problem: boolean
  clearProblem: boolean
  archive: boolean
  /** «Вернуть из архива» (очередь 2а) — manage. */
  unarchive: boolean
}

export function rights(card: Pick<TruckCard, 'status' | 'currentStage' | 'can'>): TruckRights {
  const { border, declare, manage } = card.can
  const s = card.status
  const inWork = s === 'inWork'
  const open = inWork || s === 'problem'
  const released = s === 'released'
  const archived = s === 'archived'
  return {
    // Выпущенную машину и её партии исправляет только manage (сервер: иначе 409 released), в работе — border или declare.
    editTruck: ((border || declare) && open) || (released && manage),
    editParty: ((border || declare) && open) || (released && manage),
    addParty: (border || declare) && open,
    deleteParty: (declare || manage) && open,
    submit: declare && inWork,
    submitLocked: (card.currentStage ?? 7) < 5,
    td: (declare || border) && (inWork || released),
    upload: (border || declare) && !archived,
    // Выпущенной тоже (решение 23): ТД или чек СВХ, загруженные после выпуска, иначе не дошли бы до получателя.
    patchFile: (border || declare) && (open || released),
    deleteFile: (declare || manage) && open,
    links: (declare || manage) && !archived,
    undo: (border || manage) && (inWork || released),
    problem: (border || declare || manage) && inWork,
    clearProblem: (border || declare || manage) && s === 'problem',
    archive: manage && !archived,
    unarchive: manage && archived,
  }
}

// ---- Этапы ----

export type RailState = 'done' | 'current' | 'warn' | 'todo'
export interface RailCell { stage: number; name: string; state: RailState; meta: string }

/** Время последней отметки «пройден» этапа (без отменённых после неё), ЧЧ:ММ. partyLevel=false — только отметки машины. */
const doneAt = (events: TruckEvent[], stage: number, partyLevel = true): string | null => {
  const own = [...events].filter((e) => e.stage === stage && (e.action === 'done' || e.action === 'undone') && (partyLevel || e.partyId == null))
    .sort((a, b) => a.atUtc.localeCompare(b.atUtc))
  const last = own[own.length - 1]
  return last?.action === 'done' ? last.atUtc : null
}

export const hhmm = (iso: string): string => {
  const d = new Date(iso)
  return Number.isFinite(d.getTime())
    ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    : ''
}
export const ddmm = (iso: string): string => {
  const d = new Date(iso)
  return Number.isFinite(d.getTime())
    ? `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`
    : ''
}
/** YYYY-MM-DD → ДД.ММ.ГГГГ. */
export const dateText = (ymd: string | null): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd ?? '')
  return m ? `${m[3]}.${m[2]}.${m[1]}` : ''
}

/** Семь ячеек: пройденные — со временем отметки; текущий — «идёт N мин»; 5 и 6 — «N из M» по партиям. */
export function railCells(card: TruckCard, since: string, t: Translate): RailCell[] {
  const released = card.status === 'released' || card.currentStage == null
  const cur = card.currentStage ?? 8
  const warn = card.status === 'problem' || isObstacle(card.blockerCode)
  const total = card.parties.length
  return STAGES.map((stage) => {
    const state: RailState = released || stage < cur ? 'done' : stage > cur ? 'todo' : warn ? 'warn' : 'current'
    let meta = ''
    if (stage === 5 || stage === 6) {
      meta = t(`${K}.truck.rail.count`, { done: stage === 5 ? card.submittedCount : card.tdNumberCount, total })
    } else if (state === 'done') {
      const at = doneAt(card.events, stage)
      meta = at ? hhmm(at) : ''
    }
    if (state === 'current' || state === 'warn') {
      const s = t(`${K}.truck.rail.since`, { time: since })
      meta = meta ? `${meta} · ${s}` : s
    }
    return { stage, name: t(stageKey(stage)), state, meta }
  })
}

/**
 * Этап, который снимет «Отменить последнюю отметку» (как сервер: последняя отметка машины 2–4 или 7; этап 1 ставит
 * загрузка файла и здесь не отменяется). null — отменять нечего, пункт меню не показываем.
 */
export function lastMachineMark(card: Pick<TruckCard, 'events'>): number | null {
  for (const stage of [7, 4, 3, 2]) if (doneAt(card.events, stage, false)) return stage
  return null
}

// ---- Главная кнопка ----

const MARK_KEYS = ['docs', 'stamps', 'transport', 'inspection', 'declaration', 'tdNumber', 'warehouse'] as const

export type Primary =
  | { kind: 'upload'; label: string }
  | { kind: 'mark'; stage: number; label: string }
  | { kind: 'submit'; partyId: string; label: string }
  | { kind: 'td'; partyId: string; label: string }
  | { kind: 'none'; reason: string }

/**
 * Следующее действие для этого сотрудника (nextAction): 1 — добавить документы, 2–4 и 7 — отметка этапа,
 * 5 — «ТД подана» первой неподанной партии, 6 — номер ТД первой поданной партии без номера. Иначе — текст причины.
 */
export function primaryAction(card: TruckCard, t: Translate): Primary {
  const next = nextAction(card)
  const total = card.parties.length
  const many = total > 1
  const withParty = (label: string, p: Party) => (many ? t(`${K}.truck.markParty`, { action: label, n: p.number }) : label)
  if (next.kind === 'none') {
    const stage = card.currentStage
    if (card.status === 'inWork' && stage === 5) return { kind: 'none', reason: t(`${K}.truck.waitSubmitted`, { done: card.submittedCount, total }) }
    if (card.status === 'inWork' && stage === 6) return { kind: 'none', reason: t(`${K}.truck.waitTd`, { done: card.tdNumberCount, total }) }
    return { kind: 'none', reason: t(next.reasonKey) }
  }
  const stage = next.stage
  const label = t(`${K}.truck.mark.${MARK_KEYS[stage - 1]}`)
  if (stage === 1) return { kind: 'upload', label }
  if (stage === 5) {
    const p = sortedParties(card).find((x) => !x.submittedAtUtc)
    if (p) return { kind: 'submit', partyId: p.id, label: withParty(label, p) }
    return { kind: 'none', reason: t(`${K}.truck.waitSubmitted`, { done: card.submittedCount, total }) }
  }
  if (stage === 6) {
    const p = sortedParties(card).find((x) => x.submittedAtUtc && !x.tdNumber.trim())
    if (p) return { kind: 'td', partyId: p.id, label: withParty(label, p) }
    return { kind: 'none', reason: t(`${K}.truck.waitTd`, { done: card.tdNumberCount, total }) }
  }
  return { kind: 'mark', stage, label }
}

export const sortedParties = (card: Pick<TruckCard, 'parties'>): Party[] => [...card.parties].sort((a, b) => a.number - b.number)

// ---- Что мешает ----

const FILE_CODES = new Set(['no_stamped_invoice', 'no_td_file', 'no_warehouse_receipt', 'no_files'])

/** Какие коды важны на каком этапе — зеркало AutoTransitBlockers.ByStage сервера (этапы 3 и 4 — ничего). */
export const STAGE_BLOCKERS: Readonly<Record<number, readonly string[]>> = {
  1: ['no_files'],
  2: ['party_no_recipient', 'party_no_invoice', 'no_stamped_invoice'],
  5: ['party_no_recipient', 'party_no_invoice', 'not_submitted'],
  6: ['no_td_number', 'no_td_file'],
  7: ['no_warehouse_receipt'],
}

/**
 * Подсказки по ТД партии (очередь 2а): этапы не блокируют и в blockerCode строки не идут, сервер шлёт их только для
 * неподанных партий — поэтому показываются на любом этапе машины в работе, после подсказок самого этапа.
 */
export const TD_HINT_BLOCKERS: readonly string[] = ['declaration_missing', 'declaration_incomplete']

/** «Что мешает» сейчас: блокеры текущего этапа (сервер присылает полный список всех этапов) и подсказки по ТД. */
export function currentBlockers(card: Pick<TruckCard, 'blockers' | 'currentStage' | 'status'>): Blocker[] {
  if (card.status === 'released' || card.status === 'archived' || card.currentStage == null) return []
  const own = STAGE_BLOCKERS[card.currentStage] ?? []
  return [
    ...card.blockers.filter((b) => own.includes(b.code)),
    ...card.blockers.filter((b) => TD_HINT_BLOCKERS.includes(b.code)),
  ]
}

/** Недостающий файл партии (пунктирный чип) → что загружать: вид и «с печатью». */
export const MISSING_UPLOAD: Readonly<Record<string, { kind: FileKind; stamped?: boolean }>> = {
  no_stamped_invoice: { kind: 'invoice', stamped: true },
  no_td_file: { kind: 'td' },
  no_warehouse_receipt: { kind: 'warehouseReceipt' },
}

/** Недостающие файлы партии — пунктирные чипы: коды блокеров этой партии, которые закрываются файлом. */
export const missingFiles = (blockers: Blocker[], partyId: string): string[] =>
  blockers.filter((b) => b.partyId === partyId && FILE_CODES.has(b.code)).map((b) => b.code)

const cap = (s: string) => s.charAt(0).toLocaleUpperCase() + s.slice(1)

/** Текст «что мешает» по коду, с номером партии, если блокер — её. */
export function blockerText(b: Blocker, card: Pick<TruckCard, 'parties'>, t: Translate): string {
  const params = { count: b.count ?? 0 }
  const text = t(`${K}.blocker.hint.${b.code}`, params)
  const fallback = t(`${K}.blocker.${b.code}`, params)
  const body = text === `${K}.blocker.hint.${b.code}` ? fallback : text
  const p = b.partyId ? card.parties.find((x) => x.id === b.partyId) : undefined
  return p ? t(`${K}.blocker.party`, { n: p.number, text: body }) : cap(body)
}

// ---- Видимость получателю ----

/** Виды, которые получатель видит по умолчанию (как DefaultVisibleToRecipient на сервере). */
export const RECIPIENT_KINDS: readonly FileKind[] = ['invoice', 'packingList', 'cmr', 'td', 'warehouseReceipt']

/**
 * Видит ли получатель файл на самом деле: файл партии — по признаку «виден получателю»; общий документ машины —
 * только CMR с этим признаком (сервер, VisibleFiles). Признак у общего не-CMR ничего не открывает.
 */
export const recipientSees = (f: Pick<TruckFile, 'visibleToRecipient' | 'partyId' | 'kind'>): boolean =>
  f.visibleToRecipient && (f.partyId != null || f.kind === 'cmr')

/** Общий документ машины, который получатели не увидят ни при каком признаке (не CMR). */
export const truckLevelHidden = (f: Pick<TruckFile, 'partyId' | 'kind'>): boolean => f.partyId == null && f.kind !== 'cmr'

// ---- Ссылки получателям ----

export type LinkState = 'none' | 'active' | 'revoked' | 'expired'

/** Ссылка партии: действующая, иначе последняя по сроку. */
export function partyLink(links: RecipientLink[], partyId: string, now: Date): { link: RecipientLink | null; state: LinkState } {
  const own = links.filter((l) => l.partyId === partyId).sort((a, b) => b.expiresAtUtc.localeCompare(a.expiresAtUtc))
  const active = own.find((l) => !l.revokedAtUtc && new Date(l.expiresAtUtc).getTime() > now.getTime())
  if (active) return { link: active, state: 'active' }
  const last = own[0]
  if (!last) return { link: null, state: 'none' }
  return { link: last, state: last.revokedAtUtc ? 'revoked' : 'expired' }
}

export const linkUrl = (origin: string, token: string): string => `${origin}/t/${encodeURIComponent(token)}`

// ---- Формы ----

type Val = string | number | null
/**
 * Изменённые поля формы (PUT: пропущенное поле не меняется, null очищает). Строки сравниваются без краевых пробелов;
 * очищенная строка или число — null.
 */
export function diffPatch<T extends Record<string, Val>>(initial: T, draft: T): Partial<Record<keyof T, Val>> {
  const out: Partial<Record<keyof T, Val>> = {}
  for (const k of Object.keys(draft) as (keyof T)[]) {
    const a: Val = initial[k] ?? null
    const b: Val = draft[k] ?? null
    const na: Val = typeof a === 'string' ? a.trim() : a
    const nb: Val = typeof b === 'string' ? b.trim() : b
    if (na === nb || ((na === '' || na === null) && (nb === '' || nb === null))) continue
    out[k] = nb === '' ? null : nb
  }
  return out
}

/** Коды стран и валют — заглавными латинскими буквами, без пробелов. */
export const upperCode = (v: string, max: number): string => v.replace(/\s+/g, '').toUpperCase().slice(0, max)

export const CURRENCY_OPTIONS = ['USD', 'EUR', 'CNY', 'KZT', 'RUB', 'KGS', 'UZS', 'TRY'].map((c) => ({ value: c, label: c }))
