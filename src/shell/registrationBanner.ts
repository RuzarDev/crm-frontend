import type { RegistrationStep } from '@/composables/useClientRegistration'
import type { Import40CanCreateDto, RegistrationBlockCode } from '@/api/import40'

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

/**
 * Первый заход незарегистрированного клиента — сразу на шаги регистрации, а не на пустую Главную (один раз за сессию).
 * Только по загруженному состоянию: при ошибке загрузки complete = false и nextStep = 'profile' — без проверки loaded
 * полностью зарегистрированного клиента уводило бы на регистрацию.
 */
export const shouldRedirectToRegistration = (reg: RegistrationSnapshot, path: string, alreadyRedirected: boolean): boolean =>
  !alreadyRedirected && reg.isClient && reg.loaded && !reg.complete && !!reg.nextStep && path === '/home'

/**
 * Тексты блокировки новой поставки по причине (C-9, 30.10.2026): клиенту, который всё подписал и ждёт AQNIET, —
 * «ждём», занятый разовый документ — с номером поставки, истёкший — «нужен новый». Ключи i18n: заголовок и текст
 * экрана мастера, подсказка кнопки «Оформить новую поставку»; companyAction — кнопка ведёт в «Мою компанию» без
 * «Завершить регистрацию» (регистрация уже пройдена).
 */
export function registrationBlock(code: RegistrationBlockCode | null): {
  title: string; text: string; tooltip: string; companyAction: boolean
} {
  switch (code) {
    case 'awaitingAqniet':
      return { title: 'client.wizard.gate.awaitingAqniet.title', text: 'client.wizard.gate.awaitingAqniet.text', tooltip: 'clientHome.newLockedWait', companyAction: true }
    case 'busy':
      return { title: 'client.wizard.gate.busy.title', text: 'client.wizard.gate.busy.text', tooltip: 'clientHome.newLockedBusy', companyAction: true }
    case 'renew':
      return { title: 'client.wizard.gate.renew.title', text: 'client.wizard.gate.renew.text', tooltip: 'clientHome.newLockedRenew', companyAction: true }
    default:
      return { title: 'client.wizard.gate.title', text: 'client.wizard.gate.text', tooltip: 'clientHome.newLocked', companyAction: false }
  }
}

/**
 * Почему новую поставку оформить нельзя: код сервера; старый сервер кода не шлёт — выводим сами (C-9, 30.10.2026).
 * I-1 ревью: «ждём AQNIET» — только когда со стороны клиента всё готово (доверенность действует); иначе — «missing»
 * (кнопка ведёт на шаг доверенности по needNew).
 */
export function blockReasonOf(s: Import40CanCreateDto | null, contractAwaitingUs: boolean): RegistrationBlockCode | null {
  if (!s || s.canCreate) return null
  if (s.reasonCode) return s.reasonCode
  if (!s.profileComplete) return 'profile'
  if (contractAwaitingUs && s.poaOk) return 'awaitingAqniet'
  return 'missing'
}
