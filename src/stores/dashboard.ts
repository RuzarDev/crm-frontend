import { defineStore } from 'pinia'
import { ref } from 'vue'
import { dashboardApi } from '@/api/dashboard'
import type { DashboardDto } from '@/types/api'
import { message } from 'ant-design-vue'

export const useDashboardStore = defineStore('dashboard', () => {
  const data = ref<DashboardDto | null>(null)
  const loading = ref(false)

  const fetch = async () => {
    loading.value = true
    try {
      const res = await dashboardApi.get()
      data.value = res.data
    } catch {
      message.error('Не удалось загрузить дашборд')
    } finally {
      loading.value = false
    }
  }

  return { data, loading, fetch }
})
