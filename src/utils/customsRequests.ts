import type { CustomsRequestDto } from '@/api/customsRequests'
import { isDocKind } from '@/views/client/docKinds'
import { canManageDeclarations, dtUserFrom, type DtAccessSource } from '@/views/import40/dtAccess'

// Правила запроса таможни (волна 17.10, задача 5) — общие для карточки заявки, страницы ДТ и поставки клиента.

type T = (key: string, named?: Record<string, unknown>) => string

/** Ждёт ответа клиента: не закрыт и без ответа. */
export const isWaiting = (r: Pick<CustomsRequestDto, 'status'>): boolean => r.status === 'open'
/** Не закрыт (ждёт клиента или ждёт, пока декларант передаст ответ). */
export const isActive = (r: Pick<CustomsRequestDto, 'status'>): boolean => r.status !== 'closed'

/** Самый давний запрос, ждущий клиента (для метки «N ч без ответа»). */
export function oldestWaiting<R extends Pick<CustomsRequestDto, 'status' | 'createdAtUtc'>>(list: readonly R[]): R | null {
  return list.filter(isWaiting).reduce<R | null>((acc, r) => (!acc || r.createdAtUtc < acc.createdAtUtc ? r : acc), null)
}

/** «12 мин» / «5 ч» / «3 д» — сколько прошло с момента from (минимум 1 мин). */
export function elapsedLabel(fromIso: string, t: T, now: Date = new Date()): string {
  const ms = Math.max(0, now.getTime() - Date.parse(fromIso))
  const min = Math.max(1, Math.floor(ms / 60_000))
  if (min < 60) return t('customsRequest.time.min', { n: min })
  const hours = Math.floor(min / 60)
  if (hours < 48) return t('customsRequest.time.hour', { n: hours })
  return t('customsRequest.time.day', { n: Math.floor(hours / 24) })
}

/** Красная метка сотрудника: «Запрос таможни · 2 ч без ответа»; null — никто не ждёт клиента. */
export function waitingLabel(list: readonly CustomsRequestDto[], t: T, now: Date = new Date()): string | null {
  const r = oldestWaiting(list)
  return r ? t('customsRequest.waiting', { time: elapsedLabel(r.createdAtUtc, t, now) }) : null
}

/** Название вида документа в словаре клиента; неизвестный — как есть. */
export const docKindName = (kind: string, t: T): string =>
  isDocKind(kind) ? t(`client.docKind.${kind}.name`) : kind

/** «ДД.ММ.ГГГГ» из ISO-даты (срок ответа). */
export function dateLabel(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`
}

/** Вид документа для загрузки ответа: единственный запрошенный, иначе первый из запрошенных или «другой». */
export const defaultUploadKind = (r: Pick<CustomsRequestDto, 'docKinds'>): string =>
  r.docKinds.find((k) => isDocKind(k)) ?? 'other'

const isAdminOf = (a: DtAccessSource) => (a.role ?? '').trim().toLowerCase() === 'administrator'
const perm = (a: DtAccessSource, p: string) => isAdminOf(a) || a.permissions.includes(p)

/** Заводить и закрывать запрос таможни — как сервер (Import40CustomsRequestEndpoints.CanManage): ведёт ДТ или import40.problem. */
export const canManageCustoms = (a: DtAccessSource): boolean =>
  canManageDeclarations(dtUserFrom(a)) || (!dtUserFrom(a).isClient && perm(a, 'import40.problem'))

/** «Напомнить клиенту» — как сервер (CanRemind): плюс КПП и руководитель (import40.assign). */
export const canRemindClient = (a: DtAccessSource): boolean =>
  canManageCustoms(a) || (!dtUserFrom(a).isClient && (perm(a, 'import40.kpp') || perm(a, 'import40.assign')))

/** Статусы шага 3 (ДТ заполняется или подана), на которых заводится запрос — как CanCreateAt на сервере. */
export const canCreateAtStatus = (status: number): boolean => status === 2 || status === 3

/** Есть ли что напомнить клиенту: ждущий запрос таможни, черновик (0) или счёт СВХ без оплаты (6). */
export const hasClientDebt = (status: number, list: readonly Pick<CustomsRequestDto, 'status'>[]): boolean =>
  list.some(isWaiting) || status === 0 || status === 6
