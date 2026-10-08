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

/** Действует многоразовый документ — второй такой же сервер не выпустит (правило для договора). */
export const hasEffectiveMulti = (docs: Import40DocumentDto[]) =>
  docs.some((d) => isDocumentEffective(d) && !d.isSingleUse)

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
 * - later — шаг после незавершённого предыдущего (серый).
 */
export type StepTone = 'done' | 'action' | 'waiting' | 'later'
export type StepStateKey =
  | 'filled' | 'fill'
  | 'effective' | 'effectiveUntil'
  | 'needSign' | 'needGenerate' | 'awaitingUs'
  | 'afterProfile' | 'afterContract'
export interface StepState { done: boolean; tone: StepTone; key: StepStateKey; date: string }

export interface CompanySnapshot {
  profileComplete: boolean
  contracts: Import40DocumentDto[]
  poas: Import40DocumentDto[]
}

/** «ДД.ММ.ГГГГ» по местному времени; пусто — для пустой/битой даты. */
export function fullDate(v: string | null | undefined): string {
  if (!v) return ''
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`
}
export const shortDate = (v: string | null | undefined) => fullDate(v).slice(0, 5)

const effectiveDoc = (docs: Import40DocumentDto[]) => sortDocs(docs).find((d) => isDocumentEffective(d)) ?? null

function docStep(docs: Import40DocumentDto[], blockedBy: StepStateKey | null): StepState {
  const eff = effectiveDoc(docs)
  if (eff) {
    const date = fullDate(eff.validUntilUtc)
    return { done: true, tone: 'done', key: date ? 'effectiveUntil' : 'effective', date }
  }
  const cur = currentDoc(docs)
  if (cur && !cur.clientSigned) return { done: false, tone: 'action', key: 'needSign', date: '' }
  if (cur && cur.clientSigned) return { done: false, tone: 'waiting', key: 'awaitingUs', date: '' }
  if (blockedBy) return { done: false, tone: 'later', key: blockedBy, date: '' }
  return { done: false, tone: 'action', key: 'needGenerate', date: '' }
}

/**
 * Три шага регистрации. «Готово» — как у сервера (can-create): реквизиты заполнены, договор и доверенность
 * ДЕЙСТВУЮТ (подписаны, не истекли; разовая — не израсходована: для следующей поставки нужна новая).
 */
export function companySteps(s: CompanySnapshot): Record<CompanyStep, StepState> {
  const profile: StepState = s.profileComplete
    ? { done: true, tone: 'done', key: 'filled', date: '' }
    : { done: false, tone: 'action', key: 'fill', date: '' }
  const contract = docStep(s.contracts, s.profileComplete ? null : 'afterProfile')
  const poa = docStep(s.poas, s.profileComplete && contract.done ? null : 'afterContract')
  return { profile, contract, poa }
}

/** Шаг по умолчанию: первый незавершённый, где ход за клиентом; затем любой незавершённый; всё готово — договор. */
export function defaultStep(steps: Record<CompanyStep, StepState>): CompanyStep {
  return COMPANY_STEPS.find((k) => !steps[k].done && steps[k].tone !== 'waiting')
    ?? COMPANY_STEPS.find((k) => !steps[k].done)
    ?? 'contract'
}

export const isCompanyStep = (v: unknown): v is CompanyStep =>
  typeof v === 'string' && (COMPANY_STEPS as string[]).includes(v)

/** Конец выбранного дня ('YYYY-MM-DD') по местному времени — как прежний endOf('day') у даты «действует до». */
export function endOfLocalDay(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d, 23, 59, 59, 999).toISOString()
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
