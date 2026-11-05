import { clientShipmentsApi } from '@/api/clientShipments'
import { dashboardApi } from '@/api/dashboard'
import { homeAttention, homeAttentionTone, setStaffHomeBadge } from '@/shell/attention'
import { clientAsks } from '@/views/home/clientHome'

// Значок «Главной» в меню сотрудника (пакет G, 02.11.2026): считается и без открытия Главной — лёгкий запрос
// dashboard/home/badge при входе, раз в несколько минут и при возврате на вкладку. Весь дашборд не грузим.
// Клиенту (05.11.2026) — то же по лёгкому списку поставок: вход по ссылке из письма не должен оставлять значок пустым.
export const HOME_BADGE_POLL_MS = 3 * 60 * 1000
/** Клиент сделал дело и перешёл на другой экран — значок перечитываем, но не чаще этого. */
export const CLIENT_BADGE_NAV_MS = 30 * 1000

let timer: ReturnType<typeof setInterval> | null = null
let seq = 0
let refresh: () => Promise<void> = () => refreshHomeBadge()
let clientRead = 0

const setClientBadge = (n: number) => {
  homeAttention.value = n
  homeAttentionTone.value = 'gold'
}

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

/** Значок клиента сейчас: «Нужно от вас» по тому же правилу, что на Главной. Ошибка — значок прежний, без тоста. */
export async function refreshClientHomeBadge(): Promise<void> {
  const my = ++seq
  clientRead = Date.now()
  try {
    const list = await clientShipmentsApi.list({ silent: true })
    if (my === seq) setClientBadge(clientAsks(list).length)
  } catch {
    // Сеть или права — значок не трогаем.
  }
}

const onVisible = () => {
  if (document.visibilityState === 'visible') void refresh()
}

const startPolling = (fn: () => Promise<void>) => {
  if (timer) return
  refresh = fn
  void fn()
  timer = setInterval(() => {
    if (document.visibilityState === 'visible') void fn()
  }, HOME_BADGE_POLL_MS)
  document.addEventListener('visibilitychange', onVisible)
}

export function startHomeBadgePolling(): void {
  startPolling(refreshHomeBadge)
}

export function startClientHomeBadgePolling(): void {
  startPolling(refreshClientHomeBadge)
}

/** Переход клиента на другой экран: сделанное дело гасит значок, не дожидаясь опроса. */
export function clientBadgeOnNavigate(): void {
  if (timer && refresh === refreshClientHomeBadge && Date.now() - clientRead >= CLIENT_BADGE_NAV_MS) void refreshClientHomeBadge()
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

/** То же для Главной клиента: число «Нужно от вас». */
export function homeBadgeFromClientHome(n: number): void {
  seq++
  clientRead = Date.now()
  setClientBadge(n)
}
