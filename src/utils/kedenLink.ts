import type { ZTone } from '@/components/z/ZTag.vue'
import type { KedenLinkDto, KedenStatusKind } from '@/api/kedenLink'
import type { Import40DeclarationDto } from '@/api/import40'
import type { Import40BoardRow } from '@/api/import40Board'
import type { AppNotification } from '@/types/api'

// Чистая логика связи ДТ ↔ КЕДЕН (17.10): тон и подпись чипа в шапке ДТ, сводка по ДТ заявки для подэтапов шага 3,
// фильтр «Нет связи с КЕДЕН» в списке заявок, переход и кнопка «Завести запрос таможни» в уведомлениях.

type T = (key: string, params?: Record<string, unknown>) => string

/** Типы уведомлений КЕДЕН (сервер шлёт NotificationType.ToString()). */
export const KEDEN_STATUS_NOTIFICATION = 'KedenStatus'
export const KEDEN_DOCS_NOTIFICATION = 'KedenDocsRequired'

/** Query-параметр страницы ДТ: открыть форму «Запрос таможни» по этой ДТ. */
export const CUSTOMS_REQUEST_QUERY = 'customsRequest'

const RELEASED: ReadonlySet<KedenStatusKind> = new Set(['released', 'conditionalRelease'])
export const isKedenReleased = (k: KedenLinkDto | null | undefined): boolean => !!k?.linked && !!k.statusKind && RELEASED.has(k.statusKind)

/** Тон чипа КЕДЕН: без связи — серый, выпуск — зелёный, отказ/отзыв — красный, запрос документов / условный — жёлтый. */
export function kedenTone(k: KedenLinkDto | null | undefined): ZTone {
  if (!k?.linked) return 'neutral'
  switch (k.statusKind) {
    case 'released': return 'done'
    case 'conditionalRelease': case 'docsRequired': return 'wait'
    case 'refused': case 'withdrawn': return 'danger'
    case 'registered': return 'submitted'
    default: return 'info'
  }
}

/** Подпись чипа: название статуса из КЕДЕН как есть; без связи — «нет связи». */
export function kedenChipText(k: KedenLinkDto | null | undefined, t: T): string {
  if (!k?.linked) return t('kedenLink.unlinked')
  return k.statusName?.trim() || t('kedenLink.noStatus')
}

/** Ячейка «Коридор» в окне КЕДЕН: green/yellow/red переводом, иначе — как пришло, нет — «КЕДЕН не передал». */
export function kedenCorridorText(c: string | null | undefined, t: T, te: (k: string) => boolean): string {
  if (!c) return t('kedenLink.corridorNone')
  return te(`customsRequest.corridorName.${c}`) ? t(`customsRequest.corridorName.${c}`) : c
}

/** «Живые» ДТ заявки: без исходной ДТ разделения, у которой есть части. */
const liveDts = (dts: readonly Pick<Import40DeclarationDto, 'isSplitReplaced' | 'keden'>[]) => dts.filter((d) => !d.isSplitReplaced)

export interface KedenCaseSummary {
  total: number
  linked: number
  released: number
  docs: boolean
  refused: boolean
  withdrawn: boolean
  /** Самая ранняя регистрация/статус по связанным ДТ — «подача подтверждена КЕДЕН». */
  firstAtUtc: string | null
  /** Самый поздний выпуск по КЕДЕН (когда выпущены все). */
  releasedAtUtc: string | null
  /** Статус последней по времени связанной ДТ — для подписи «КЕДЕН: …». */
  latestName: string | null
}

/** Сводка КЕДЕН по ДТ заявки; null — ни одна ДТ не связана (подэтапы считаются по-старому). */
export function kedenCaseSummary(dts: readonly Pick<Import40DeclarationDto, 'isSplitReplaced' | 'keden'>[]): KedenCaseSummary | null {
  const live = liveDts(dts)
  const linked = live.map((d) => d.keden).filter((k): k is KedenLinkDto => !!k?.linked)
  if (!linked.length) return null
  const kinds = linked.map((k) => k.statusKind)
  const times = linked.map((k) => k.statusAtUtc).filter((x): x is string => !!x).sort()
  const releasedTimes = linked.filter(isKedenReleased).map((k) => k.statusAtUtc).filter((x): x is string => !!x).sort()
  const sorted = [...linked].sort((a, b) => (a.statusAtUtc ?? '').localeCompare(b.statusAtUtc ?? ''))
  const latest = sorted[sorted.length - 1]
  return {
    total: live.length,
    linked: linked.length,
    released: linked.filter(isKedenReleased).length,
    docs: kinds.includes('docsRequired'),
    refused: kinds.includes('refused'),
    withdrawn: kinds.includes('withdrawn'),
    firstAtUtc: times[0] ?? null,
    releasedAtUtc: releasedTimes[releasedTimes.length - 1] ?? null,
    latestName: latest?.statusName?.trim() || null,
  }
}

/** Фильтр «Нет связи с КЕДЕН»: ДТ подана (статусы 3–8) и хотя бы одна живая ДТ не связана. */
export const kedenUnlinked = (r: Pick<Import40BoardRow, 'status' | 'kedenUnlinkedCount'>): boolean =>
  r.status >= 3 && r.status <= 8 && (r.kedenUnlinkedCount ?? 0) > 0

/** Страница ДТ по уведомлению КЕДЕН; null — уведомление не про ДТ. */
export function kedenNotificationDtPath(n: Pick<AppNotification, 'caseId'> & { type?: string; declarationId?: string | null }): string | null {
  if (n.type !== KEDEN_STATUS_NOTIFICATION && n.type !== KEDEN_DOCS_NOTIFICATION) return null
  if (!n.caseId || !n.declarationId) return null
  return `/import-40/${encodeURIComponent(n.caseId)}/dt/${encodeURIComponent(n.declarationId)}`
}

/** Кнопка «Завести запрос таможни» у уведомления «таможня запрашивает документы»: страница ДТ с открытой формой. */
export function kedenCustomsRequestPath(n: Pick<AppNotification, 'caseId'> & { type?: string; declarationId?: string | null }): string | null {
  if (n.type !== KEDEN_DOCS_NOTIFICATION) return null
  const dt = kedenNotificationDtPath(n)
  return dt ? `${dt}?${CUSTOMS_REQUEST_QUERY}=new` : null
}
