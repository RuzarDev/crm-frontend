import { isDocumentActive, isDocumentEffective, type Import40DocumentDto } from '@/api/import40Contract'

// «Моя компания» клиента (редизайн, волна 2b): чистые правила шагов и документов — без Vue, проверяются отдельно.

export type CompanyStep = 'profile' | 'contract' | 'poa'
export const COMPANY_STEPS: CompanyStep[] = ['profile', 'contract', 'poa']
export type DocKind = 'contract' | 'poa'

/** Свежие сверху: по дате формирования, при равной — по году и номеру. */
export function sortDocs(docs: Import40DocumentDto[]): Import40DocumentDto[] {
  return [...docs].sort((a, b) =>
    b.generatedAtUtc.localeCompare(a.generatedAtUtc)
    || b.year - a.year
    || b.number.localeCompare(a.number, undefined, { numeric: true }))
}

/** Ждёт подписей (черновик или «на подписи»). */
export const isOpen = (d: Import40DocumentDto) => d.status === 0 || d.status === 1

/**
 * Актуальный документ раздела: свежий из ждущих подписи (от клиента или AQNIET что-то требуется),
 * иначе свежий действующий. Истёкшие, отозванные и израсходованные разовые — в истории.
 */
export function currentDoc(docs: Import40DocumentDto[]): Import40DocumentDto | null {
  const sorted = sortDocs(docs)
  return sorted.find(isOpen) ?? sorted.find((d) => isDocumentEffective(d)) ?? null
}

export function historyDocs(docs: Import40DocumentDto[]): Import40DocumentDto[] {
  const cur = currentDoc(docs)
  return sortDocs(docs).filter((d) => d !== cur)
}

export type HistoryStatus = 'effective' | 'awaiting' | 'consumed' | 'expired' | 'revoked'
export function historyStatus(d: Import40DocumentDto, now = Date.now()): HistoryStatus {
  if (d.status === 4) return 'revoked'
  if (isOpen(d)) return 'awaiting'
  if (d.status === 3 || (d.validUntilUtc && new Date(d.validUntilUtc).getTime() <= now)) return 'expired'
  if (isDocumentActive(d) && d.isSingleUse && d.consumedByCaseId) return 'consumed'
  return isDocumentEffective(d) ? 'effective' : 'expired'
}

/**
 * Состояние карточки шага:
 * - done — готово (зелёная галочка);
 * - action — ждёт действия клиента (золотой текст);
 * - waiting — ждёт AQNIET (от клиента ничего не нужно);
 * - later — шаг после незаполненных реквизитов (серый).
 */
export type StepTone = 'done' | 'action' | 'waiting' | 'later'
export type StepStateKey =
  | 'filled' | 'fill'
  | 'effective' | 'effectiveUntil'
  | 'needSign' | 'needGenerate' | 'needNew' | 'awaitingUs'
  | 'afterProfile'
export interface StepState { done: boolean; tone: StepTone; key: StepStateKey; date: string }

/**
 * Состояние регистрации от сервера (GET import40/can-create через useClientRegistration) — единственный
 * источник «готово»: тот же, что у плашки регистрации и мастера поставки.
 */
export interface RegistrationSnapshot {
  profileDone: boolean
  contractDone: boolean
  poaDone: boolean
  /** Клиент договор подписал, ждём подпись AQNIET. */
  contractAwaitingUs: boolean
}

export interface CompanySnapshot {
  reg: RegistrationSnapshot
  /** Документы — только для показа (срок действия, ждёт ли подписи клиента), не для «готово». */
  contracts: Import40DocumentDto[]
  poas: Import40DocumentDto[]
}

const p2 = (n: number) => String(n).padStart(2, '0')

/** Момент времени (сформирован, подписан) — «ДД.ММ» / «ДД.ММ.ГГГГ» по местному времени. */
export function localDate(v: string | null | undefined, withYear = false): string {
  if (!v) return ''
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return ''
  const dm = `${p2(d.getDate())}.${p2(d.getMonth() + 1)}`
  return withYear ? `${dm}.${d.getFullYear()}` : dm
}

/**
 * Срок действия («действует до») — календарная дата, сервер хранит её концом дня по UTC (31.12 23:59:59Z):
 * показываем по UTC, иначе восточнее Гринвича она «переезжала» бы на 01.01.
 */
export function validDate(v: string | null | undefined): string {
  if (!v) return ''
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return ''
  return `${p2(d.getUTCDate())}.${p2(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`
}

const effectiveDoc = (docs: Import40DocumentDto[]) => sortDocs(docs).find((d) => isDocumentEffective(d)) ?? null

function docStep(ok: boolean, docs: Import40DocumentDto[], profileDone: boolean, awaitingUs: boolean): StepState {
  if (ok) {
    const date = validDate(effectiveDoc(docs)?.validUntilUtc)
    return { done: true, tone: 'done', key: date ? 'effectiveUntil' : 'effective', date }
  }
  if (awaitingUs) return { done: false, tone: 'waiting', key: 'awaitingUs', date: '' }
  if (!profileDone) return { done: false, tone: 'later', key: 'afterProfile', date: '' }
  const cur = currentDoc(docs)
  if (cur && isOpen(cur) && !cur.clientSigned) return { done: false, tone: 'action', key: 'needSign', date: '' }
  // Документ действует, но сервер не принимает его для новой поставки (разовый занят открытой заявкой).
  if (effectiveDoc(docs) || docs.some((d) => isDocumentActive(d))) return { done: false, tone: 'action', key: 'needNew', date: '' }
  return { done: false, tone: 'action', key: 'needGenerate', date: '' }
}

/**
 * Три шага регистрации. «Готово» — только по серверу (can-create): реквизиты заполнены, договор и доверенность
 * годятся для новой поставки. Доверенность можно оформлять параллельно с договором — сервер требует лишь реквизиты.
 */
export function companySteps(s: CompanySnapshot): Record<CompanyStep, StepState> {
  const { reg } = s
  const profile: StepState = reg.profileDone
    ? { done: true, tone: 'done', key: 'filled', date: '' }
    : { done: false, tone: 'action', key: 'fill', date: '' }
  const contract = docStep(reg.contractDone, s.contracts, reg.profileDone, reg.contractAwaitingUs)
  const poa = docStep(reg.poaDone, s.poas, reg.profileDone, false)
  return { profile, contract, poa }
}

export const isCompanyStep = (v: unknown): v is CompanyStep =>
  typeof v === 'string' && (COMPANY_STEPS as string[]).includes(v)

/** «Действует до» выбранного дня ('YYYY-MM-DD') — конец этого дня по UTC, как сервер ставит сроки по умолчанию. */
export function endOfDayUtc(ymd: string): string {
  return `${ymd}T23:59:59.000Z`
}

/** Сегодня, 'YYYY-MM-DD' по местному времени (нижняя граница «действует до»). */
export function todayYmd(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
}

/** Перечисление «a, b и c» на языке интерфейса; без Intl.ListFormat — через запятую. */
type ListFormatCtor = new (locale: string, opts: { style: 'long'; type: 'conjunction' }) => { format: (items: string[]) => string }
export function joinList(items: string[], locale: string): string {
  // Intl.ListFormat (ES2021) — вне lib проекта, берём через приведение.
  const ListFormat = (Intl as unknown as { ListFormat?: ListFormatCtor }).ListFormat
  try {
    if (ListFormat) return new ListFormat(locale, { style: 'long', type: 'conjunction' }).format(items)
  } catch {
    /* неизвестная локаль — ниже через запятую */
  }
  return items.join(', ')
}
