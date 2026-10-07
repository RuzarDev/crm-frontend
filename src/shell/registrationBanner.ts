import type { RegistrationStep } from '@/composables/useClientRegistration'

// Плашка регистрации клиента и одноразовый переход на шаги регистрации (перенос из прежней оболочки на AntD):
// чистые функции от снимка useClientRegistration и текущего пути.

export interface RegistrationSnapshot {
  isClient: boolean
  loaded: boolean
  complete: boolean
  nextStep: RegistrationStep | null
  doneCount: number
  needNew: string | null
}

export type RegistrationBanner =
  | { kind: 'waiting' }
  | { kind: 'todo'; done: number; next: RegistrationStep; to: string }

const COMPANY = '/import-40/company'

/**
 * Клиенту, не завершившему регистрацию (реквизиты → договор → доверенность), — на любой странице:
 * без неё заявку не подать. На самой странице регистрации не дублируем; пока состояние не загружено — молчим.
 * Шагов от клиента больше нет (nextStep = null) — договор на подписи у AQNIET, только ждать.
 */
export function registrationBannerState(reg: RegistrationSnapshot, path: string): RegistrationBanner | null {
  if (!reg.isClient || !reg.loaded || reg.complete) return null
  if (path.startsWith(COMPANY)) return null
  if (!reg.nextStep) return { kind: 'waiting' }
  return { kind: 'todo', done: reg.doneCount, next: reg.nextStep, to: reg.needNew ? `${COMPANY}?step=${reg.needNew}` : COMPANY }
}

/** Первый заход незарегистрированного клиента — сразу на шаги регистрации, а не на пустую Главную (один раз за сессию). */
export const shouldRedirectToRegistration = (reg: RegistrationSnapshot, path: string, alreadyRedirected: boolean): boolean =>
  !alreadyRedirected && reg.isClient && !reg.complete && !!reg.nextStep && path === '/home'
