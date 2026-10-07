import { defineStore } from 'pinia'
import { ref } from 'vue'
import { notificationsApi } from '@/api/notifications'
import type { AppNotification } from '@/types/api'

const POLL_INTERVAL_MS = 60_000

export const useNotificationsStore = defineStore('notifications', () => {
  const items = ref<AppNotification[]>([])
  const loading = ref(false)
  // Отдельно от items: опрашивается раз в минуту (только пока вкладка видима), без перегрузки
  // всего списка — колокольчик показывает счётчик даже когда выпадашка закрыта (аудит 2.3).
  const unreadCount = ref(0)
  // Последняя загрузка списка не удалась — колокольчик показывает ошибку и «Повторить» вместо «пусто».
  // Сбрасывается только успешной загрузкой (во время повтора ошибка остаётся на экране).
  const loadError = ref(false)

  const fetch = async () => {
    loading.value = true
    try {
      const res = await notificationsApi.list()
      items.value = res.data
      unreadCount.value = items.value.filter((n) => !n.isRead).length
      loadError.value = false
    } catch {
      loadError.value = true
      // Фоновая загрузка списка — тост уже показал перехватчик, здесь не дублируем.
    } finally {
      loading.value = false
    }
  }

  const refreshUnreadCount = async () => {
    try {
      const res = await notificationsApi.getUnreadCount()
      unreadCount.value = res.data.count
    } catch {
      // Фоновый опрос — не шумим тостом на каждый пропущенный запрос.
    }
  }

  // Пользовательские действия — ошибку не проглатываем (аудит 2.1: раньше эндпоинта не было,
  // 404 тонул в try/catch, и «Прочитать все» выглядело так, будто ничего не произошло). Общий
  // перехватчик (api/client.ts) сам покажет тост; здесь только обновляем локальное состояние
  // после успеха.
  const markRead = async (id: string) => {
    await notificationsApi.markRead(id)
    const n = items.value.find((x) => x.id === id)
    if (n && !n.isRead) {
      n.isRead = true
      unreadCount.value = Math.max(0, unreadCount.value - 1)
    }
  }

  const markAllRead = async () => {
    await notificationsApi.markAllRead()
    items.value.forEach((n) => (n.isRead = true))
    unreadCount.value = 0
  }

  // Опрос unread-count раз в минуту, только пока вкладка видима (не жжём API в фоновой вкладке),
  // плюс мгновенное обновление при возврате на вкладку (аудит 2.3).
  let pollTimer: ReturnType<typeof setInterval> | null = null
  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible') refreshUnreadCount()
  }
  const startPolling = () => {
    if (pollTimer) return
    refreshUnreadCount()
    pollTimer = setInterval(() => {
      if (document.visibilityState === 'visible') refreshUnreadCount()
    }, POLL_INTERVAL_MS)
    document.addEventListener('visibilitychange', onVisibilityChange)
  }
  const stopPolling = () => {
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
    document.removeEventListener('visibilitychange', onVisibilityChange)
  }

  // На выходе из системы — сбрасываем состояние, чтобы следующий пользователь на этом же
  // устройстве не увидел чужие уведомления до первой загрузки.
  const reset = () => {
    stopPolling()
    items.value = []
    unreadCount.value = 0
    loadError.value = false
  }

  return { items, loading, unreadCount, loadError, fetch, refreshUnreadCount, markRead, markAllRead, startPolling, stopPolling, reset }
})
