import { useNotificationsStore } from '@/stores/notifications'
import { useProfileStore } from '@/stores/profile'
import { resetClientRegistration } from '@/composables/useClientRegistration'
import { homeAttention } from '@/shell/attention'
import { useCommandPalette } from '@/shell/useCommandPalette'

/** Флаг ClientShell: клиента уже один раз увели на регистрацию в этой вкладке. */
export const REG_REDIRECT_FLAG = 'zircon-reg-redirect'

/**
 * Выход из системы без перезагрузки страницы: вход следующего пользователя — SPA-переход, модульные
 * ref и сторы живут дальше. Забываем всё, что принадлежало прежнему: уведомления, профиль (имя в шапке),
 * бейдж «Требует внимания», состояние регистрации клиента, открытую палитру и флаг переадресации.
 * Вызывается до authStore.logout(). Перехватчик 401 перезагружает страницу и в этом не нуждается.
 */
export function resetSession(): void {
  useNotificationsStore().reset()
  useProfileStore().reset()
  homeAttention.value = null
  resetClientRegistration()
  useCommandPalette().hide()
  try { sessionStorage.removeItem(REG_REDIRECT_FLAG) } catch { /* приватный режим */ }
}
