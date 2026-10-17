import type { ConditionalReleaseBrief, ConditionalReleaseDto } from '@/api/conditionalRelease'
import { COND_REL_KINDS } from '@/api/conditionalRelease'

// Условный выпуск ДТ (17.10): общие подписи для метки в списках, блока в ДТ и карточки поставки.

type T = (key: string, named?: Record<string, unknown>) => string

/** 'YYYY-MM-DD' → 'ДД.ММ'; другой год (не текущий) — 'ДД.ММ.ГГГГ'; пусто — ''. */
export function condRelDate(iso: string | null | undefined, now: Date = new Date()): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '')
  if (!m) return ''
  return Number(m[1]) === now.getFullYear() ? `${m[3]}.${m[2]}` : `${m[3]}.${m[2]}.${m[1]}`
}

/** Что нужно (после «нужен …»): «сертификат происхождения»; «Другой» с текстом — «документ: …» (согласование рода, как на сервере). */
export function condRelDoc(kind: string | null | undefined, note: string | null | undefined, t: T): string {
  if (kind === 'other' && note?.trim()) return t('condRel.otherDoc', { note: note.trim() })
  const k = (COND_REL_KINDS as readonly string[]).includes(kind ?? '') ? kind : 'other'
  return t(`condRel.kind.${k}`)
}

/** Название вида для списка выбора и карточки — общие подписи чек-листа клиента (client.docKind.*). */
export const condRelKindName = (kind: string | null | undefined, t: T): string =>
  t(`client.docKind.${(COND_REL_KINDS as readonly string[]).includes(kind ?? '') ? kind : 'other'}.name`)

export type CondRelState = 'open' | 'overdue' | 'uploaded'

/** Открыт (ждём документ) / срок истёк / документ загружен, ждёт подтверждения. Загрузка важнее просрочки: ход уже не клиента. */
export function condRelState(c: Pick<ConditionalReleaseBrief, 'overdue' | 'uploaded'>): CondRelState {
  if (c.uploaded) return 'uploaded'
  return c.overdue ? 'overdue' : 'open'
}

/** «Условный выпуск: до 15.12 нужен сертификат» / «…срок истёк 15.12 — нужен …» / «…документ на проверке». */
export function condRelLabel(c: Pick<ConditionalReleaseBrief, 'deadline' | 'docKind' | 'note' | 'overdue' | 'uploaded'>, t: T, now?: Date): string {
  const date = condRelDate(c.deadline, now)
  const doc = condRelDoc(c.docKind, c.note, t)
  const state = condRelState(c)
  if (state === 'uploaded') return t('condRel.labelUploaded', { date })
  return t(state === 'overdue' ? 'condRel.labelOverdue' : 'condRel.label', { date, doc })
}

/** Открытый условный выпуск ДТ (отмечен, не закрыт). */
export const isCondRelOpen = (c: ConditionalReleaseDto | null | undefined): c is ConditionalReleaseDto =>
  !!c && !c.resolvedAtUtc

/** Краткая метка из полной ДТ (карточка заявки/поставки) — те же поля, что присылают списки. */
export function briefOf(dt: { id: string; declarationNumber?: string | null; conditionalRelease?: ConditionalReleaseDto | null }): ConditionalReleaseBrief | null {
  const c = dt.conditionalRelease
  if (!isCondRelOpen(c)) return null
  return {
    declarationId: dt.id,
    declarationNumber: dt.declarationNumber || null,
    docKind: c.docKind,
    note: c.note,
    deadline: c.deadline,
    overdue: c.overdue,
    daysLeft: c.daysLeft,
    uploaded: !!c.uploadedAtUtc,
    openCount: 1,
  }
}

/** Фильтр списка сотрудника: 'any' — любой открытый, иначе — по состоянию. */
export type CondRelFilter = 'any' | CondRelState
export function matchesCondRel(c: ConditionalReleaseBrief | null | undefined, f: CondRelFilter | null): boolean {
  if (!f) return true
  if (!c) return false
  return f === 'any' || condRelState(c) === f
}
