import { isDocumentActive, isDocumentEffective, type Import40DocumentDto } from '@/api/import40Contract'
import type { ZTone } from '@/components/z/ZTag.vue'

// «Компания клиента» сотрудника (/import-40/company, редизайн, волна 7): чистые правила шагов, регистрации
// и документов — как у прежнего Import40CompanyView + Import40DocumentStep, без Vue.

export type StaffStep = 'requisites' | 'contract' | 'poa'
export const STAFF_STEPS: StaffStep[] = ['requisites', 'contract', 'poa']
export type DocKind = 'contract' | 'poa'

/** ?step=: requisites | contract | poa; profile — синоним реквизитов (так шаг называет кабинет клиента). */
export function parseStep(raw: unknown): StaffStep | null {
  if (raw === 'profile') return 'requisites'
  return typeof raw === 'string' && (STAFF_STEPS as string[]).includes(raw) ? (raw as StaffStep) : null
}

export interface Onboarding {
  /** Действующий договор (иначе — подписанный и не истёкший, даже израсходованный разовый). */
  contract: Import40DocumentDto | null
  /** Подписанная и не истёкшая доверенность (расход разовой заявкой онбординг не «отменяет»). */
  poa: Import40DocumentDto | null
  /** Есть доверенность, годная для новой заявки. */
  poaEffective: boolean
  /** Регистрация пройдена: договор и доверенность. */
  complete: boolean
}

export function onboardingOf(contracts: Import40DocumentDto[], poas: Import40DocumentDto[]): Onboarding {
  const contract = contracts.find((d) => isDocumentEffective(d)) ?? contracts.find((d) => isDocumentActive(d)) ?? null
  const poa = poas.find((d) => isDocumentActive(d)) ?? null
  return { contract, poa, poaEffective: poas.some((d) => isDocumentEffective(d)), complete: !!contract && !!poa }
}

/** Первый незавершённый шаг: реквизиты → договор → доверенность (всё готово — тоже доверенность). */
export function defaultStep(profileComplete: boolean, ob: Onboarding): StaffStep {
  if (!profileComplete) return 'requisites'
  if (!ob.contract) return 'contract'
  return 'poa'
}

/** Чего не хватает для регистрации — ключи подписей (broker.company.missing.*). */
export function missingOf(profileComplete: boolean, ob: Onboarding): ('profile' | 'contract' | 'poa')[] {
  const out: ('profile' | 'contract' | 'poa')[] = []
  if (!profileComplete) out.push('profile')
  if (!ob.contract) out.push('contract')
  if (!ob.poa) out.push('poa')
  return out
}

export interface StepState { done: boolean; key: 'filled' | 'notFilled' | 'effective' | 'required' | 'consumed' }
export function stepStates(profileComplete: boolean, ob: Onboarding): Record<StaffStep, StepState> {
  return {
    requisites: { done: profileComplete, key: profileComplete ? 'filled' : 'notFilled' },
    contract: { done: !!ob.contract, key: ob.contract ? 'effective' : 'required' },
    poa: { done: !!ob.poa, key: ob.poaEffective ? 'effective' : ob.poa ? 'consumed' : 'required' },
  }
}

/**
 * Многоразовый договор у клиента один: пока многоразовый действует или ждёт подписей, сервер второй не выпустит
 * (409) — остаётся только разовый (флажок включён и закреплён). У доверенности такого правила нет.
 * 'active' — действует, 'awaiting' — ждёт подписей, null — ограничения нет.
 */
export function multiBlocked(kind: DocKind, docs: Import40DocumentDto[]): 'active' | 'awaiting' | null {
  if (kind !== 'contract') return null
  const multi = docs.filter((d) => !d.isSingleUse)
  if (multi.some((d) => isDocumentEffective(d))) return 'active'
  if (multi.some((d) => d.status === 1)) return 'awaiting'
  return null
}

// ---- Статус документа ----
type StatusKey = 'draft' | 'awaiting' | 'active' | 'expired' | 'revoked'
const STATUS_KEY: Record<number, StatusKey> = { 0: 'draft', 1: 'awaiting', 2: 'active', 3: 'expired', 4: 'revoked' }
const STATUS_TONE: Record<StatusKey, ZTone> = { draft: 'neutral', awaiting: 'info', active: 'done', expired: 'danger', revoked: 'danger' }
export const statusKey = (status: number): StatusKey => STATUS_KEY[status] ?? 'draft'
export const statusTone = (status: number): ZTone => STATUS_TONE[statusKey(status)]
export const REVOKED = 4

/** Срок действия прошёл. */
export const isExpired = (d: Pick<Import40DocumentDto, 'validUntilUtc'>, now = Date.now()): boolean =>
  !!d.validUntilUtc && new Date(d.validUntilUtc).getTime() <= now

/** Подпись: клиент или AQNIET. */
export type SignSide = 'client' | 'provider'

/**
 * Год, на который выйдет новая доверенность (как на сервере): выбранная дата, иначе — текущий год, а в декабре
 * (по Астане, UTC+5) — следующий.
 */
export function poaTargetYear(validUntilYmd: string | null, now = Date.now()): number {
  if (validUntilYmd) return Number(validUntilYmd.slice(0, 4))
  const astana = new Date(now + 5 * 60 * 60 * 1000)
  return astana.getUTCMonth() === 11 ? astana.getUTCFullYear() + 1 : astana.getUTCFullYear()
}

/**
 * Доверенность на следующий год уже выпущена (раунд 1 ревью, M-7; с 1 декабря её выпускает система): многоразовая,
 * черновик/ждёт подписи/действует, срок — в году новой доверенности или позже. Тогда вторую многоразовую сервер не выпустит
 * (409) — остаётся разовая. На текущий год (новая доверенность не «на следующий») ограничения нет.
 */
export function nextYearPoa(kind: DocKind, docs: Import40DocumentDto[], targetYear: number, now = Date.now()): Import40DocumentDto | null {
  const astanaYear = new Date(now + 5 * 60 * 60 * 1000).getUTCFullYear()
  if (kind !== 'poa' || targetYear <= astanaYear) return null
  return docs.find((d) => !d.isSingleUse && (d.status === 0 || d.status === 1 || d.status === 2)
    && !!d.validUntilUtc && new Date(d.validUntilUtc).getUTCFullYear() >= targetYear) ?? null
}
