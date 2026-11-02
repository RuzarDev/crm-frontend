import { ref } from 'vue'

// Значок у пункта «Главная»/«Мои поставки» в меню: число и цвет.
// Клиенту пишет его Главная (число «Нужно ваше действие», жёлтый); сотруднику — опрос dashboard/home/badge
// (shell/homeBadge.ts) и сама Главная после загрузки (пакет G, 02.11.2026). null — ещё не считали (значка нет).
export const homeAttention = ref<number | null>(null)

/** danger — число строк «Срочно» (красный); gold — «Ждут вас» / у клиента «Нужно ваше действие» (жёлтый). */
export type HomeAttentionTone = 'danger' | 'gold'
export const homeAttentionTone = ref<HomeAttentionTone>('gold')

/** Значок сотрудника: есть срочное — его число красным, иначе «Ждут вас» жёлтым, иначе значка нет (0). */
export function setStaffHomeBadge(b: { urgent: number; awaitingMe: number }): void {
  if (b.urgent > 0) {
    homeAttention.value = b.urgent
    homeAttentionTone.value = 'danger'
  } else {
    homeAttention.value = b.awaitingMe
    homeAttentionTone.value = 'gold'
  }
}

/** Выход из системы: значок прежнего пользователя не показываем. */
export function resetHomeAttention(): void {
  homeAttention.value = null
  homeAttentionTone.value = 'gold'
}
