// Чистые правила каркаса страницы ДТ (волна 6а, Task 3): раздел из адреса (?s=), отметки разделов в навигации,
// тег ЕТТ/ВТО в шапке, причина «только просмотр», ДТ, заменившие разделённую.
import type { Import40CaseDto, Import40DeclarationDto } from '@/api/import40'
import type { DtAccessUser } from '@/views/import40/dtAccess'
import { DECLARING_STATUS } from '@/views/import40/dtAccess'
import { DT_SECTION_KEYS, goodsIndexFromText, graphFromText, normalizeGraph, type DtSectionKey } from './dtSections'
import type { DtReadinessItem } from './useDtReadiness'

/** Разделы страницы: «ДТС» — только с правом декларанта (сервер GET …/dts отдаёт только ему). */
export const visibleSections = (withDts: boolean): DtSectionKey[] =>
  DT_SECTION_KEYS.filter((k) => withDts || k !== 'dts')

/** Раздел из ?s=; неизвестный или скрытый — первый («Номер и дата»). */
export function sectionFromQuery(raw: unknown, keys: readonly DtSectionKey[]): DtSectionKey {
  const v = Array.isArray(raw) ? raw[0] : raw
  return typeof v === 'string' && (keys as readonly string[]).includes(v) ? (v as DtSectionKey) : keys[0]
}

/** Соседний раздел (Alt+↑/↓); у края — null. */
export function adjacentSection(keys: readonly DtSectionKey[], current: DtSectionKey, step: 1 | -1): DtSectionKey | null {
  const i = keys.indexOf(current)
  const next = keys[i + step]
  return i >= 0 && next ? next : null
}

/**
 * Графы, которые проверяет серверная готовность (KedenXmlReadiness): только у этих разделов «нет пунктов» значит
 * «готово». Общие сведения (гр. 1, 3–7) и Завершение (гр. 48, 52, 54) сервер не проверяет — там галочки нет
 * (иначе пустой раздел выглядел бы готовым — та же ошибка, что B4).
 */
export const SERVER_CHECKED_SECTIONS: readonly DtSectionKey[] = [
  'number', 'parties', 'countries', 'transport', 'finance', 'customs', 'goods', 'docs',
]

export type DtNavMark = { kind: 'done' } | { kind: 'count'; count: number } | { kind: 'unknown' }

export interface DtNavMarksInput {
  keys: readonly DtSectionKey[]
  /** Ответ готовности ДТ получен. */
  readinessLoaded: boolean
  /** Пунктов по разделам (ДТ и ДТС вместе). */
  bySection: Partial<Record<DtSectionKey, number>>
  /** Ответ GET …/dts получен (галочка раздела «ДТС»). */
  dtsLoaded: boolean
}

/** Отметка раздела: число недостающего → галочка (готово по серверу) → пустой кружок (неизвестно). */
export function navMarks(input: DtNavMarksInput): Record<DtSectionKey, DtNavMark> {
  const out = {} as Record<DtSectionKey, DtNavMark>
  for (const key of input.keys) {
    const n = input.bySection[key] ?? 0
    const checked = key === 'dts' ? input.dtsLoaded : input.readinessLoaded && SERVER_CHECKED_SECTIONS.includes(key)
    out[key] = n > 0 ? { kind: 'count', count: n } : checked ? { kind: 'done' } : { kind: 'unknown' }
  }
  return out
}

/**
 * Платежи устарели (точка у раздела «Товары», пока нет отдельного раздела «Платежи»): у товара стоит признак
 * «пересчитать ТПиН» (импорт из КП, разделение) или у него нет ни одной строки гр. 47.
 */
export function paymentsStale(goods: readonly { needsTpinRecalc?: boolean | null; payments?: readonly unknown[] | null }[]): boolean {
  return goods.length > 0 && goods.some((g) => !!g.needsTpinRecalc || !(g.payments?.length))
}

export type DtRateTag = { kind: 'replaced' } | { kind: 'ett' } | { kind: 'vto' }

/** Тег в шапке: заменённая разделением — «Разделена»; ВТО — по роли разделения или типу ставок EATT; иначе ЕТТ. */
export function rateTag(dto: Pick<Import40DeclarationDto, 'isSplitReplaced' | 'splitRole' | 'rateType'> | null | undefined): DtRateTag | null {
  if (!dto) return null
  if (dto.isSplitReplaced) return { kind: 'replaced' }
  const role = (dto.splitRole ?? '').toUpperCase()
  if (role === 'VTO') return { kind: 'vto' }
  if (role === 'ETT') return { kind: 'ett' }
  return (dto.rateType ?? '').toUpperCase() === 'EATT' ? { kind: 'vto' } : { kind: 'ett' }
}

/** ДТ, которые заменили разделённую: ЕТТ и ВТО (ЕТТ нет, если в ВТО ушли все товары). */
export function splitChildren(kase: Pick<Import40CaseDto, 'declarations'> | null | undefined, dtId: string) {
  const kids = (kase?.declarations ?? []).filter((d) => d.splitSourceDeclarationId === dtId)
  return {
    ett: kids.find((d) => (d.splitRole ?? '').toUpperCase() === 'ETT') ?? null,
    vto: kids.find((d) => (d.splitRole ?? '').toUpperCase() === 'VTO') ?? null,
  }
}

export type DtReadonlyReason = 'client' | 'role' | 'assigned'

/**
 * Почему ДТ только для просмотра (зеркало dtAccess.canEditDt): клиент; нет права декларанта; ДТ на этапе
 * «Декларирование» и дальше закреплена за другим декларантом. null — править можно.
 */
export function readonlyReason(u: DtAccessUser, kase: Pick<Import40CaseDto, 'status' | 'assignedDeclarantId'> | null | undefined): DtReadonlyReason | null {
  if (u.isAdmin || u.isRop) return null
  if (u.isClient) return 'client'
  if (!u.canDeclare) return 'role'
  if (!kase || kase.status < DECLARING_STATUS) return null
  if (!kase.assignedDeclarantId || kase.assignedDeclarantId === u.userId) return null
  return 'assigned'
}

/**
 * Пункты самой ДТС из ответа GET …/dts (счётчик раздела «ДТС» и строки панели «До подачи»). Пункты ДТ в том же
 * ответе не берём — их уже показывает готовность ДТ. Старый сервер без items — строки «ДТС: …».
 */
export function dtsReadinessItems(view: { missing?: string[] | null; items?: { text: string; graph: string | null; goodsIndex: number | null }[] | null }): DtReadinessItem[] {
  const list = view.items
    ? view.items.filter((i) => normalizeGraph(i.graph) === 'ДТС').map((i) => ({ text: i.text, goodsIndex: i.goodsIndex ?? null }))
    : (view.missing ?? []).filter((m) => graphFromText(m) === 'ДТС').map((m) => ({ text: m, goodsIndex: goodsIndexFromText(m) }))
  return list.map((i) => ({ ...i, graph: 'ДТС', section: 'dts' as const, fromXml: false }))
}
