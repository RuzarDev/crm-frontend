import type { CustomsRequestDto, CustomsRequestStage } from '@/api/customsRequests'
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

/** Ключ красной метки по моменту запроса: «Запрос таможни / на границе / после выпуска · N без ответа». */
export const waitingKey = (stage: CustomsRequestStage): string =>
  stage === 'border' ? 'customsRequest.waitingBorder'
  : stage === 'postRelease' ? 'customsRequest.waitingPostRelease'
  : 'customsRequest.waiting'

/** Красная метка сотрудника: «Запрос таможни · 2 ч без ответа»; null — никто не ждёт клиента. */
export function waitingLabel(list: readonly CustomsRequestDto[], t: T, now: Date = new Date()): string | null {
  const r = oldestWaiting(list)
  return r ? t(waitingKey(stageOf(r)), { time: elapsedLabel(r.createdAtUtc, t, now) }) : null
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

// ---- Момент запроса (17.10): на границе / при проверке ДТ / после выпуска ----

export const STAGES: readonly CustomsRequestStage[] = ['border', 'declaration', 'postRelease']

/** Момент запроса; без поля (старый ответ сервера) — при проверке ДТ. */
export const stageOf = (r: Pick<CustomsRequestDto, 'stage'>): CustomsRequestStage => r.stage ?? 'declaration'

/** Моменты, разрешённые на статусе заявки — как Import40CustomsRequestFlow.CanCreateAt(status, stage) на сервере:
 * граница — шаг 2 (1); проверка ДТ — шаг 3 (2, 3); после выпуска — с выпуска ДТ (4…7) и по выполненной (8). */
export function stagesAt(status: number): CustomsRequestStage[] {
  if (status === 1) return ['border']
  if (status === 2 || status === 3) return ['declaration']
  if (status >= 4 && status <= 8) return ['postRelease']
  return []
}

/** Момент по умолчанию для статуса (как DefaultStage на сервере); null — запрос не заводится. */
export const defaultStage = (status: number): CustomsRequestStage | null => stagesAt(status)[0] ?? null

/** Статусы, на которых заводится запрос (какой-нибудь момент подходит): граница, шаг 3, после выпуска, выполненная. */
export const canCreateAtStatus = (status: number): boolean => stagesAt(status).length > 0

/** Запросы, по которым сейчас ждём клиента с учётом статуса заявки: отменённая — ничего; выполненная — только после
 * выпуска (камеральная проверка идёт и по закрытой поставке) — как фильтры сервера (список поставок, напоминания). */
export function waitingForClient<R extends Pick<CustomsRequestDto, 'status' | 'stage'>>(list: readonly R[], status: number): R[] {
  if (status === 9) return []
  return list.filter((r) => isWaiting(r) && (status !== 8 || stageOf(r) === 'postRelease'))
}

/** Ждущие клиента запросы одного момента (метка на своём шаге: граница — шаг 2, проверка ДТ — шаг 3). */
export const waitingOfStage = <R extends Pick<CustomsRequestDto, 'status' | 'stage'>>(list: readonly R[], stage: CustomsRequestStage): R[] =>
  list.filter((r) => isWaiting(r) && stageOf(r) === stage)

// Срок без времени сохраняется полднем UTC (так дата не съезжает в часовом поясе) — время у такого срока не показываем.
const isDateOnly = (d: Date) =>
  d.getUTCHours() === 12 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0

/** «ЧЧ:ММ» срока по местному времени; '' — срок без времени. */
export function dueTimeLabel(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime()) || isDateOnly(d)) return ''
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Срок прошёл: со временем — по моменту, без времени — после конца дня срока. */
export function isOverdue(r: Pick<CustomsRequestDto, 'dueAtUtc' | 'status'>, now: Date = new Date()): boolean {
  if (!r.dueAtUtc || r.status !== 'open') return false
  const d = new Date(r.dueAtUtc)
  if (Number.isNaN(d.getTime())) return false
  if (!isDateOnly(d)) return now.getTime() > d.getTime()
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
  return now.getTime() >= end.getTime()
}

/** Срок для API: дата 'YYYY-MM-DD' и необязательное время 'HH:MM' (местное) → ISO; без времени — полдень UTC. */
export function dueToIso(date: string | null | undefined, time: string | null | undefined): string | null {
  if (!date) return null
  const tm = (time ?? '').trim()
  if (!/^\d{2}:\d{2}$/.test(tm)) return `${date}T12:00:00Z`
  const local = new Date(`${date}T${tm}:00`)
  return Number.isNaN(local.getTime()) ? `${date}T12:00:00Z` : local.toISOString()
}

/** Есть ли что напомнить клиенту: ждущий запрос таможни, черновик (0) или счёт СВХ без оплаты (6). */
export const hasClientDebt = (status: number, list: readonly Pick<CustomsRequestDto, 'status'>[]): boolean =>
  list.some(isWaiting) || status === 0 || status === 6
