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
 * Многоразовый договор у клиента один: пока действует многоразовый, второй не выпускается — остаётся только
 * разовый (флажок включён и закреплён). У доверенности такого правила нет.
 */
export function multiBlocked(kind: DocKind, docs: Import40DocumentDto[]): boolean {
  return kind === 'contract' && docs.some((d) => !d.isSingleUse && isDocumentEffective(d))
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
