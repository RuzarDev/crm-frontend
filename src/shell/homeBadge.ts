import { dashboardApi } from '@/api/dashboard'
import { setStaffHomeBadge } from '@/shell/attention'

// Значок «Главной» в меню сотрудника (пакет G, 02.11.2026): считается и без открытия Главной — лёгкий запрос
// dashboard/home/badge при входе, раз в несколько минут и при возврате на вкладку. Весь дашборд не грузим.
export const HOME_BADGE_POLL_MS = 3 * 60 * 1000

let timer: ReturnType<typeof setInterval> | null = null
let seq = 0

/** Обновить значок сейчас; ошибка — значок остаётся прежним (без тоста). */
export async function refreshHomeBadge(): Promise<void> {
  const my = ++seq
  try {
    const b = await dashboardApi.homeBadge()
    if (my === seq) setStaffHomeBadge(b)
  } catch {
    // Сеть или права — значок не трогаем.
  }
}

const onVisible = () => {
  if (document.visibilityState === 'visible') void refreshHomeBadge()
}

export function startHomeBadgePolling(): void {
  if (timer) return
  void refreshHomeBadge()
  timer = setInterval(() => {
    if (document.visibilityState === 'visible') void refreshHomeBadge()
  }, HOME_BADGE_POLL_MS)
  document.addEventListener('visibilitychange', onVisible)
}

export function stopHomeBadgePolling(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  // Ответ запроса, ушедшего до остановки (выход из системы), отбрасываем.
  seq++
  document.removeEventListener('visibilitychange', onVisible)
}

/** Главная загрузилась свежими данными — опрос не нужен прямо сейчас, а ответ идущего запроса устарел. */
export function homeBadgeFromHome(b: { urgent: number; awaitingMe: number }): void {
  seq++
  setStaffHomeBadge(b)
}
