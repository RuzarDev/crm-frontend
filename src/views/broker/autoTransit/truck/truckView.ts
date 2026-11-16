import type { Blocker, Party, RecipientLink, TruckCard, TruckEvent } from '@/api/autoTransit'
import { STAGES, nextAction, stageKey } from '../autoTransit'

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
}

export function rights(card: Pick<TruckCard, 'status' | 'currentStage' | 'can'>): TruckRights {
  const { border, declare, manage } = card.can
  const s = card.status
  const inWork = s === 'inWork'
  const open = inWork || s === 'problem'
  const released = s === 'released'
  const archived = s === 'archived'
  return {
    editTruck: (border || declare) && open,
    editParty: (border || declare) && open,
    addParty: (border || declare) && open,
    deleteParty: (declare || manage) && open,
    submit: declare && inWork,
    submitLocked: (card.currentStage ?? 7) < 5,
    td: (declare || border) && (inWork || released),
    upload: (border || declare) && !archived,
    patchFile: (border || declare) && open,
    deleteFile: (declare || manage) && open,
    links: (declare || manage) && !archived,
    undo: (border || manage) && (inWork || released),
    problem: (border || declare || manage) && inWork,
    clearProblem: (border || declare || manage) && s === 'problem',
    archive: manage && !archived,
  }
}

// ---- Этапы ----

export type RailState = 'done' | 'current' | 'warn' | 'todo'
export interface RailCell { stage: number; name: string; state: RailState; meta: string }

/** Время последней отметки «пройден» этапа (без отменённых после неё), ЧЧ:ММ. */
const doneAt = (events: TruckEvent[], stage: number): string | null => {
  const own = [...events].filter((e) => e.stage === stage && (e.action === 'done' || e.action === 'undone'))
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
  const warn = card.status === 'problem' || !!card.blockerCode
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

/** Недостающие файлы партии — пунктирные чипы: коды блокеров этой партии, которые закрываются файлом. */
export const missingFiles = (blockers: Blocker[], partyId: string): string[] =>
  blockers.filter((b) => b.partyId === partyId && FILE_CODES.has(b.code)).map((b) => b.code)

const cap = (s: string) => s.charAt(0).toLocaleUpperCase() + s.slice(1)

/** Текст «что мешает» по коду, с номером партии, если блокер — её. */
export function blockerText(b: Blocker, card: Pick<TruckCard, 'parties'>, t: Translate): string {
  const text = t(`${K}.blocker.hint.${b.code}`)
  const fallback = t(`${K}.blocker.${b.code}`)
  const body = text === `${K}.blocker.hint.${b.code}` ? fallback : text
  const p = b.partyId ? card.parties.find((x) => x.id === b.partyId) : undefined
  return p ? t(`${K}.blocker.party`, { n: p.number, text: body }) : cap(body)
}

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
