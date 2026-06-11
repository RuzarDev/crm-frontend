import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { notificationsApi } from '@/api/notifications'
import type { NotificationDto } from '@/types/api'

export const useNotificationsStore = defineStore('notifications', () => {
  const items = ref<NotificationDto[]>([])
  const loading = ref(false)

  const unreadCount = computed(() => items.value.filter((n) => !n.isRead).length)

  const fetch = async () => {
    loading.value = true
    try {
      const res = await notificationsApi.getUnread()
      items.value = res.data
    } catch {
      // silent
    } finally {
      loading.value = false
    }
  }

  const markRead = async (id: string) => {
    try {
      await notificationsApi.markRead(id)
      const n = items.value.find((x) => x.id === id)
      if (n) n.isRead = true
    } catch {
      // silent
    }
  }

  const markAllRead = async () => {
    try {
      await notificationsApi.markAllRead()
      items.value.forEach((n) => (n.isRead = true))
    } catch {
      // silent
    }
  }

  return { items, loading, unreadCount, fetch, markRead, markAllRead }
})
